import { Prisma } from '@prisma/client';
import prisma from '../db/prisma';
import { AppError, NotFoundError } from '../errors/AppError';
import { QueueService } from '../jobs/QueueService';
import { invalidatePermissions } from '../middleware/permissions';
import { PORTAL_ROLES } from '../constants/systemRoles';
import {
  ROLE_HIERARCHY, ROLE_NAME_PATTERN, normaliseRoleName,
  type CreateRoleInput, type RoleRecord, type UpdateRoleInput,
} from '@security360/shared';

/**
 * Roles as data: created, relabelled, disabled and deleted from the UI.
 *
 * What a role may do is not here — that is RolePermission, managed under
 * /permissions. This is only which roles exist and what they are called.
 */

const WITH_COUNTS = { _count: { select: { users: { where: { deletedAt: null } }, permissions: true } } } as const;
type RoleRow = Prisma.RoleGetPayload<{ include: typeof WITH_COUNTS }>;

function fmt(r: RoleRow): RoleRecord {
  return {
    id:              r.id,
    name:            r.name,
    label:           r.label,
    description:     r.description,
    colour:          r.colour,
    isSystem:        r.isSystem,
    isActive:        r.isActive,
    userCount:       r._count.users,
    permissionCount: r._count.permissions,
    createdAt:       r.createdAt.toISOString(),
    updatedAt:       r.updatedAt.toISOString(),
  };
}

/** System roles in the hierarchy people already know, then custom ones A–Z. */
function byDisplayOrder(a: RoleRow, b: RoleRow): number {
  const rank = (r: RoleRow) => {
    const i = ROLE_HIERARCHY.indexOf(r.name as never);
    return r.isSystem && i !== -1 ? i : ROLE_HIERARCHY.length;
  };
  return rank(a) - rank(b) || a.label.localeCompare(b.label);
}

/** Best effort: the change has already happened by the time this runs. */
const audit = (data: Parameters<typeof QueueService.logAudit>[0]) =>
  QueueService.logAudit(data).catch((err) =>
    console.error('⚠️  Failed to queue audit entry for', data.action, err),
  );

export const roleService = {
  /** Every role, or with `assignable` only those a person can be given now. */
  async list(opts: { assignable?: boolean } = {}): Promise<RoleRecord[]> {
    const rows = await prisma.role.findMany({
      where:   opts.assignable ? { isActive: true, name: { notIn: [...PORTAL_ROLES] } } : undefined,
      include: WITH_COUNTS,
    });
    return rows.sort(byDisplayOrder).map(fmt);
  },

  async create(input: CreateRoleInput, actorId: string): Promise<RoleRecord> {
    const name = normaliseRoleName(input.name?.trim() ? input.name : input.label);
    if (!ROLE_NAME_PATTERN.test(name)) {
      throw new AppError(
        'A role’s system name must start with a letter and use only letters, numbers and underscores (2–40 characters).',
        400,
      );
    }

    const clash = await prisma.role.findUnique({ where: { name }, select: { label: true } });
    if (clash) throw new AppError(`A role called ${name} already exists (${clash.label}).`, 409);

    let row: RoleRow;
    try {
      row = await prisma.role.create({
        data: {
          name,
          label:       input.label.trim(),
          description: input.description?.trim() || null,
          colour:      input.colour || null,
          isSystem:    false,
          isActive:    true,
        },
        include: WITH_COUNTS,
      });
    } catch (err) {
      // Two creates racing past the check above land on the unique index.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppError(`A role called ${name} already exists.`, 409);
      }
      throw err;
    }

    await audit({
      userId: actorId, action: 'ROLE_CREATED', entity: 'role', entityId: row.id,
      newValue: { name, label: row.label },
    });
    return fmt(row);
  },

  async update(
    name: string,
    input: UpdateRoleInput,
    actorId: string,
    actorRole: string,
  ): Promise<RoleRecord> {
    const existing = await prisma.role.findUnique({ where: { name } });
    if (!existing) throw new NotFoundError(`No role called ${name}.`);

    if (input.isActive === false) {
      // DIRECTOR is the one role guaranteed to hold roles.manage. Disabling it
      // would leave nobody able to turn anything back on.
      if (name === 'DIRECTOR') {
        throw new AppError('The Director role cannot be disabled. It is what keeps permission management reachable.', 400);
      }
      if (name === actorRole) {
        throw new AppError('You cannot disable the role you are signed in with.', 400);
      }
    }

    const data: Prisma.RoleUpdateInput = {};
    if (input.label       !== undefined) data.label       = input.label.trim();
    if (input.description !== undefined) data.description = input.description?.trim() || null;
    if (input.colour      !== undefined) data.colour      = input.colour || null;
    if (input.isActive    !== undefined) data.isActive    = input.isActive;
    if (!Object.keys(data).length) throw new AppError('Nothing to change.', 400);

    const row = await prisma.role.update({ where: { name }, data, include: WITH_COUNTS });

    // Enabling or disabling changes what the role may do from this request on.
    if (input.isActive !== undefined && input.isActive !== existing.isActive) {
      invalidatePermissions(name);
    }

    await audit({
      userId: actorId, action: 'ROLE_UPDATED', entity: 'role', entityId: row.id,
      oldValue: { label: existing.label, description: existing.description, colour: existing.colour, isActive: existing.isActive },
      newValue: { label: row.label, description: row.description, colour: row.colour, isActive: row.isActive },
    });
    return fmt(row);
  },

  async remove(name: string, actorId: string): Promise<{ name: string; deleted: true; grantsRemoved: number }> {
    const existing = await prisma.role.findUnique({ where: { name }, include: WITH_COUNTS });
    if (!existing) throw new NotFoundError(`No role called ${name}.`);

    if (existing.isSystem) {
      throw new AppError(
        'System roles cannot be deleted — code refers to them by name. Disable it instead if it should stop being used.',
        400,
      );
    }
    const holders = existing._count.users;
    if (holders > 0) {
      throw new AppError(
        `${holders} ${holders === 1 ? 'person still holds' : 'people still hold'} ${existing.label}. Move them to another role first.`,
        409,
      );
    }

    try {
      // Its grants go with it (cascade); nothing else refers to a role.
      await prisma.role.delete({ where: { name } });
    } catch (err) {
      // Someone was given the role between the count above and the delete.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        throw new AppError(`Someone was just given ${existing.label}. Move them to another role first.`, 409);
      }
      throw err;
    }

    invalidatePermissions(name);
    await audit({
      userId: actorId, action: 'ROLE_DELETED', entity: 'role', entityId: existing.id,
      oldValue: { name, label: existing.label, grants: existing._count.permissions },
    });
    return { name, deleted: true, grantsRemoved: existing._count.permissions };
  },
};

/**
 * Refuses a role that cannot be given to someone right now: one that does not
 * exist, or one that is disabled. `staffOnly` also refuses the portal roles,
 * which belong to guards and clients rather than staff accounts.
 *
 * The request schemas can no longer list valid roles — they are rows, created
 * at runtime — so this is where an unknown name is caught, before the foreign
 * key turns it into a 500.
 */
export async function assertAssignableRole(
  name: string,
  opts: { staffOnly?: boolean } = {},
): Promise<void> {
  if (opts.staffOnly && (PORTAL_ROLES as readonly string[]).includes(name)) {
    throw new AppError(`${name} is not a staff role.`, 400);
  }
  const role = await prisma.role.findUnique({ where: { name }, select: { isActive: true, label: true } });
  if (!role) throw new AppError(`There is no role called ${name}.`, 400);
  if (!role.isActive) {
    throw new AppError(`The ${role.label} role is disabled and cannot be given to anyone.`, 400);
  }
}
