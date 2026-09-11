import { Router, type Request, type Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../db/prisma';
import { authenticate } from '../middleware/authenticate';
import { requirePermission, clearPermissionCache } from '../middleware/permissions';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError, NotFoundError } from '../errors/AppError';
import { QueueService } from '../jobs/QueueService';
import { PERMISSIONS } from '../constants/permissions';
import { DEFAULT_ROLE_PERMISSIONS } from '../constants/defaultPermissions';
import { PORTAL_ROLES } from '../constants/systemRoles';
import { ROLE_HIERARCHY } from '@stap/shared';

const router = Router();

router.use(authenticate);

/**
 * The caller's own permissions.
 *
 * Declared before the roles.manage gate below: every signed-in user needs to
 * know what they may do, and gating this on permission management would leave
 * the frontend guessing from the role name — which is exactly how the nav and
 * the route guards drifted apart in the first place.
 */
router.get(
  '/me',
  asyncHandler(async (req: Request, res: Response) => {
    // A disabled role holds nothing, whatever grants its rows still carry —
    // the same rule requirePermission applies, so the UI and the API agree.
    const roleRow = await prisma.role.findUnique({
      where:  { name: req.user!.role },
      select: { label: true, isActive: true },
    });
    const rows = roleRow?.isActive
      ? await prisma.rolePermission.findMany({
          where:   { role: req.user!.role as never },
          include: { permission: { select: { key: true, name: true, module: true } } },
          orderBy: { permission: { key: 'asc' } },
        })
      : [];

    const byModule: Record<string, string[]> = {};
    for (const r of rows) {
      (byModule[r.permission.module] ??= []).push(r.permission.key);
    }

    res.json({
      success: true,
      data: {
        role:        req.user!.role,
        // The label, so the UI can name a custom role it has no constant for.
        roleLabel:   roleRow?.label ?? req.user!.role,
        roleActive:  roleRow?.isActive ?? false,
        permissions: rows.map((r) => r.permission.key),
        byModule,
      },
    });
  }),
);

// Managing permissions is itself a permission, so the matrix cannot be opened
// by someone who only happens to hold a high role.
router.use(requirePermission(PERMISSIONS.ROLES_MANAGE));

/**
 * Every role in the Role table except the portal roles, which are not
 * permission-gated. Read from the database rather than the default sets, so a
 * role created in the UI can be given permissions without a code change.
 */
async function assertManagedRole(role: string): Promise<void> {
  const isPortal = (PORTAL_ROLES as readonly string[]).includes(role);
  const found = isPortal
    ? null
    : await prisma.role.findUnique({ where: { name: role }, select: { id: true } });
  if (!found) {
    throw new AppError(`"${role}" is not a role whose permissions can be managed.`, 400);
  }
}

/**
 * DIRECTOR is deliberately immutable.
 *
 * It is the only role guaranteed to hold roles.manage, so letting it be edited
 * allows an administrator to revoke the last grant that can undo the change —
 * locking permission management out of the system with no route back in.
 */
async function assertEditable(role: string): Promise<void> {
  await assertManagedRole(role);
  if (role === 'DIRECTOR') {
    throw new AppError(
      'Director permissions cannot be changed. The role is the fallback that keeps permission management reachable.',
      400,
    );
  }
}

// ── Catalogue ─────────────────────────────────────────────────────────────────

router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const permissions = await prisma.permission.findMany({
      orderBy: [{ module: 'asc' }, { name: 'asc' }],
    });
    res.json({ success: true, data: permissions });
  }),
);

/**
 * Every role the matrix covers, from the Role table, so a role created in the
 * UI appears here at once. System roles first in the hierarchy people already
 * know; custom roles after, A–Z.
 */
router.get(
  '/roles',
  asyncHandler(async (_req: Request, res: Response) => {
    const [roles, counts] = await Promise.all([
      prisma.role.findMany({
        where:   { name: { notIn: [...PORTAL_ROLES] } },
        include: { _count: { select: { users: true } } },
      }),
      prisma.rolePermission.groupBy({ by: ['role'], _count: { id: true } }),
    ]);
    const byRole = new Map(counts.map((c) => [String(c.role), c._count.id]));
    const rank = (r: { name: string; isSystem: boolean }) => {
      const i = ROLE_HIERARCHY.indexOf(r.name as never);
      return r.isSystem && i !== -1 ? i : ROLE_HIERARCHY.length;
    };
    roles.sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label));

    res.json({
      success: true,
      data: roles.map((r) => ({
        role:        r.name,
        label:       r.label,
        description: r.description,
        colour:      r.colour,
        isSystem:    r.isSystem,
        isActive:    r.isActive,
        userCount:   r._count.users,
        count:       byRole.get(r.name) ?? 0,
        editable:    r.name !== 'DIRECTOR',
      })),
    });
  }),
);

router.get(
  '/roles/:role',
  asyncHandler(async (req: Request, res: Response) => {
    const role = req.params.role;
    await assertManagedRole(role);

    const rows = await prisma.rolePermission.findMany({
      where:   { role: role as never },
      include: { permission: true },
      orderBy: { permission: { key: 'asc' } },
    });

    res.json({
      success: true,
      data: {
        role,
        editable:    role !== 'DIRECTOR',
        permissions: rows.map((r) => r.permission),
      },
    });
  }),
);

// ── Grant and revoke ──────────────────────────────────────────────────────────

router.post(
  '/roles/:role/grant',
  asyncHandler(async (req: Request, res: Response) => {
    const role = req.params.role;
    await assertEditable(role);

    const { permissionKey } = req.body as { permissionKey?: string };
    if (!permissionKey) throw new AppError('permissionKey is required.', 400);

    const permission = await prisma.permission.findUnique({ where: { key: permissionKey } });
    if (!permission) throw new NotFoundError(`No permission with key "${permissionKey}".`);

    await prisma.rolePermission.upsert({
      where:  { role_permissionId: { role: role as never, permissionId: permission.id } },
      update: {},
      create: { role: role as never, permissionId: permission.id, grantedById: req.user!.userId },
    });

    clearPermissionCache(role);
    await QueueService.logAudit({
      userId:   req.user!.userId,
      action:   'PERMISSION_GRANTED',
      entity:   'rolePermission',
      entityId: `${role}:${permissionKey}`,
      newValue: { role, permissionKey },
    });

    res.status(201).json({ success: true, data: { role, permissionKey, granted: true } });
  }),
);

router.delete(
  '/roles/:role/revoke/:key',
  asyncHandler(async (req: Request, res: Response) => {
    const role = req.params.role;
    await assertEditable(role);

    const permissionKey = decodeURIComponent(req.params.key);
    const permission = await prisma.permission.findUnique({ where: { key: permissionKey } });
    if (!permission) throw new NotFoundError(`No permission with key "${permissionKey}".`);

    await prisma.rolePermission.deleteMany({
      where: { role: role as never, permissionId: permission.id },
    });

    clearPermissionCache(role);
    await QueueService.logAudit({
      userId:   req.user!.userId,
      action:   'PERMISSION_REVOKED',
      entity:   'rolePermission',
      entityId: `${role}:${permissionKey}`,
      oldValue: { role, permissionKey },
    });

    res.json({ success: true, data: { role, permissionKey, granted: false } });
  }),
);

/** Replaces a role's whole set — used by the UI's "reset to defaults". */
router.put(
  '/roles/:role',
  asyncHandler(async (req: Request, res: Response) => {
    const role = req.params.role;
    await assertEditable(role);

    const { permissionKeys, reason } = req.body as { permissionKeys?: string[]; reason?: string };
    if (!Array.isArray(permissionKeys)) {
      throw new AppError('permissionKeys must be an array of permission keys.', 400);
    }

    const found = await prisma.permission.findMany({
      where:  { key: { in: permissionKeys } },
      select: { id: true, key: true },
    });
    // Refuse the whole write rather than silently granting a subset: a typo
    // would otherwise leave the role with fewer permissions than asked for.
    const unknown = permissionKeys.filter((k) => !found.some((f) => f.key === k));
    if (unknown.length) {
      throw new AppError(`Unknown permission key(s): ${unknown.join(', ')}`, 400);
    }

    await prisma.$transaction([
      prisma.rolePermission.deleteMany({ where: { role: role as never } }),
      prisma.rolePermission.createMany({
        data: found.map((f) => ({
          role:         role as never,
          permissionId: f.id,
          grantedById:  req.user!.userId,
        })),
      }),
    ]);

    clearPermissionCache(role);
    await QueueService.logAudit({
      userId:   req.user!.userId,
      action:   'PERMISSIONS_BULK_UPDATED',
      entity:   'rolePermission',
      entityId: role,
      // Why the set was replaced — a preset, a reset, a module-wide change — so
      // the audit trail reads as decisions rather than bare arrays of keys.
      newValue: {
        role,
        count: found.length,
        permissionKeys,
        ...(typeof reason === 'string' && reason.trim()
          ? { reason: reason.trim().slice(0, 200) }
          : {}),
      },
    });

    res.json({ success: true, data: { role, count: found.length } });
  }),
);

/** The default set for a role, so the UI can offer "reset" without hardcoding it. */
router.get(
  '/roles/:role/defaults',
  asyncHandler(async (req: Request, res: Response) => {
    const role = req.params.role;
    await assertManagedRole(role);
    res.json({ success: true, data: { role, permissionKeys: DEFAULT_ROLE_PERMISSIONS[role] ?? [] } });
  }),
);

// ── Presets ───────────────────────────────────────────────────────────────────
// Named permission sets. There is deliberately no "apply" endpoint: applying a
// preset is PUT /roles/:role above with the preset's keys, so it inherits the
// same checks — DIRECTOR immutable, unknown keys refused, one transaction —
// rather than a second write path that would have to repeat them.

const PRESET_SELECT = {
  id: true, name: true, description: true, permissionKeys: true,
  createdAt: true, updatedAt: true,
  createdBy: { select: { id: true, name: true } },
} as const;

type PresetRow = {
  id: string; name: string; description: string | null; permissionKeys: string[];
  createdAt: Date; updatedAt: Date; createdBy: { id: string; name: string } | null;
};

const fmtPreset = (p: PresetRow) => ({
  ...p,
  createdAt: p.createdAt.toISOString(),
  updatedAt: p.updatedAt.toISOString(),
});

/**
 * Best effort. The preset has already been written by the time this runs, and
 * a queue outage surfacing as a 500 would have the caller retry into "already
 * exists" against the preset they just made.
 */
const auditPreset = (data: Parameters<typeof QueueService.logAudit>[0]) =>
  QueueService.logAudit(data).catch((err) =>
    console.error('⚠️  Failed to queue audit entry for', data.action, err),
  );

router.get(
  '/presets',
  asyncHandler(async (_req: Request, res: Response) => {
    const presets = await prisma.rolePreset.findMany({
      select:  PRESET_SELECT,
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, data: presets.map(fmtPreset) });
  }),
);

router.post(
  '/presets',
  asyncHandler(async (req: Request, res: Response) => {
    const { name, description, permissionKeys } = req.body as {
      name?: unknown; description?: unknown; permissionKeys?: unknown;
    };

    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (!trimmed) throw new AppError('A preset needs a name.', 400);
    if (trimmed.length > 80) throw new AppError('Keep the preset name to 80 characters.', 400);

    if (description != null && typeof description !== 'string') {
      throw new AppError('description must be text.', 400);
    }
    const desc = typeof description === 'string' && description.trim() ? description.trim() : null;
    if (desc && desc.length > 300) throw new AppError('Keep the description to 300 characters.', 400);

    if (!Array.isArray(permissionKeys) || permissionKeys.some((k) => typeof k !== 'string')) {
      throw new AppError('permissionKeys must be an array of permission keys.', 400);
    }
    // An empty set is allowed: "no access" is a legitimate thing to save.
    const keys = [...new Set(permissionKeys as string[])].sort();

    // Refused whole rather than saved minus the typo, matching PUT above: a
    // preset that silently held fewer keys than asked would apply the wrong set.
    const found = await prisma.permission.findMany({
      where:  { key: { in: keys } },
      select: { key: true },
    });
    const known = new Set(found.map((f) => f.key));
    const unknown = keys.filter((k) => !known.has(k));
    if (unknown.length) {
      throw new AppError(`Unknown permission key(s): ${unknown.join(', ')}`, 400);
    }

    // Case-insensitive: "Front desk" and "front desk" read as one preset in a
    // list, so they should not be able to exist as two.
    const clash = await prisma.rolePreset.findFirst({
      where:  { name: { equals: trimmed, mode: 'insensitive' } },
      select: { id: true },
    });
    if (clash) throw new AppError(`A preset called "${trimmed}" already exists.`, 409);

    let preset: PresetRow;
    try {
      preset = await prisma.rolePreset.create({
        data: {
          name:           trimmed,
          description:    desc,
          permissionKeys: keys,
          createdById:    req.user!.userId,
        },
        select: PRESET_SELECT,
      });
    } catch (err) {
      // Two saves racing past the check above land on the unique index.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppError(`A preset called "${trimmed}" already exists.`, 409);
      }
      throw err;
    }

    await auditPreset({
      userId:   req.user!.userId,
      action:   'ROLE_PRESET_CREATED',
      entity:   'rolePreset',
      entityId: preset.id,
      newValue: { name: preset.name, count: keys.length, permissionKeys: keys },
    });

    res.status(201).json({ success: true, data: fmtPreset(preset) });
  }),
);

/** Deleting a preset changes no role — each keeps whatever it holds now. */
router.delete(
  '/presets/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const existing = await prisma.rolePreset.findUnique({
      where:  { id: req.params.id },
      select: { id: true, name: true, permissionKeys: true },
    });
    if (!existing) throw new NotFoundError('That preset no longer exists.');

    await prisma.rolePreset.delete({ where: { id: existing.id } });

    await auditPreset({
      userId:   req.user!.userId,
      action:   'ROLE_PRESET_DELETED',
      entity:   'rolePreset',
      entityId: existing.id,
      oldValue: { name: existing.name, permissionKeys: existing.permissionKeys },
    });

    res.json({ success: true, data: { id: existing.id, deleted: true } });
  }),
);

export default router;
