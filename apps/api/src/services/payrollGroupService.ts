import prisma from '../db/prisma';
import { writeAuditLog } from '../lib/auditLog';
import { AppError, NotFoundError } from '../errors/AppError';
import type {
  PayrollGroupResponse,
  PayrollGroupMember,
  CreatePayrollGroupInput,
  UpdatePayrollGroupInput,
} from '@stap/shared';

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtMember(m: any): PayrollGroupMember {
  const guard = m.guard;
  return {
    id:       guard.id,
    fullName: [guard.firstName, guard.otherNames, guard.lastName].filter(Boolean).join(' '),
    rank:     guard.rank ?? 'GUARD',
  };
}

function fmt(g: any, includeMembers = false): PayrollGroupResponse {
  return {
    id:          g.id,
    name:        g.name,
    description: g.description ?? null,
    isActive:    g.isActive,
    memberCount: g._count?.members ?? g.members?.length ?? 0,
    // The editor needs the member list; plain summaries do not carry it.
    ...(includeMembers ? { members: (g.members ?? []).map(fmtMember) } : {}),
    createdAt: g.createdAt.toISOString(),
    updatedAt: g.updatedAt.toISOString(),
  };
}

/** Rejects ids that are not guards before any write touches the database. */
async function assertGuardsExist(guardIds: string[]): Promise<void> {
  if (guardIds.length === 0) return;
  const found = await prisma.guard.count({ where: { id: { in: guardIds } } });
  if (found !== guardIds.length) {
    const missing = guardIds.length - found;
    throw new NotFoundError(
      `${missing} of the selected guard${missing === 1 ? '' : 's'} no longer exist. Refresh the member list and try again.`,
    );
  }
}

/**
 * A guard belongs to at most one payroll group — the unique index on the join
 * row enforces it, but catching the clash here says which guard sits in which
 * group instead of surfacing a raw P2002.
 */
async function assertNotInOtherGroup(guardIds: string[], groupId: string | null): Promise<void> {
  if (guardIds.length === 0) return;
  const clashes = await prisma.guardPayrollGroupMember.findMany({
    where: {
      guardId: { in: guardIds },
      ...(groupId ? { groupId: { not: groupId } } : {}),
    },
    include: {
      guard: { select: { firstName: true, lastName: true } },
      group: { select: { name: true } },
    },
  });
  if (clashes.length > 0) {
    const list = clashes.map((c) => `${c.guard.firstName} ${c.guard.lastName} (${c.group.name})`).join(', ');
    throw new AppError(
      `Each guard can only be in one payroll group. Already grouped: ${list}.`,
      409,
    );
  }
}

// ── PayrollGroupService ────────────────────────────────────────────────────────

class PayrollGroupService {
  async list(): Promise<PayrollGroupResponse[]> {
    const groups = await prisma.payrollGroup.findMany({
      orderBy: { name: 'asc' },
      include: {
        members: { include: { guard: true }, orderBy: { guard: { firstName: 'asc' } } },
        _count:  { select: { members: true } },
      },
    });
    return groups.map((g) => fmt(g, true));
  }

  async create(data: CreatePayrollGroupInput, createdBy: string): Promise<PayrollGroupResponse> {
    const guardIds = [...new Set(data.guardIds ?? [])];

    const existing = await prisma.payrollGroup.findFirst({
      where: { name: { equals: data.name, mode: 'insensitive' } },
    });
    if (existing) {
      throw new AppError(`A payroll group named "${data.name}" already exists.`, 409);
    }

    await assertGuardsExist(guardIds);
    await assertNotInOtherGroup(guardIds, null);

    const group = await prisma.payrollGroup.create({
      data: {
        name:        data.name,
        description: data.description ?? null,
        isActive:    data.isActive ?? true,
        members:     { createMany: { data: guardIds.map((guardId) => ({ guardId })) } },
      },
      include: {
        members: { include: { guard: true } },
        _count:  { select: { members: true } },
      },
    });

    await writeAuditLog({
      action:   'PAYROLL_GROUP_CREATED',
      entity:   'payrollGroup',
      entityId: group.id,
      newValue: { name: group.name, memberCount: guardIds.length, createdBy },
    });

    return fmt(group, true);
  }

  async update(id: string, data: UpdatePayrollGroupInput, updatedBy: string): Promise<PayrollGroupResponse> {
    const existing = await prisma.payrollGroup.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Payroll group not found');

    if (data.name && data.name.toLowerCase() !== existing.name.toLowerCase()) {
      const duplicate = await prisma.payrollGroup.findFirst({
        where: { name: { equals: data.name, mode: 'insensitive' }, id: { not: id } },
      });
      if (duplicate) {
        throw new AppError(`A payroll group named "${data.name}" already exists.`, 409);
      }
    }

    // guardIds replaces the membership wholesale when provided — the editor
    // saves exactly what is on screen, including clearing everyone out.
    const replacesMembers = data.guardIds !== undefined;
    const guardIds = replacesMembers ? [...new Set(data.guardIds!)] : [];
    if (replacesMembers) {
      await assertGuardsExist(guardIds);
      await assertNotInOtherGroup(guardIds, id);
    }

    const group = await prisma.$transaction(async (tx) => {
      if (replacesMembers) {
        await tx.guardPayrollGroupMember.deleteMany({ where: { groupId: id } });
        if (guardIds.length > 0) {
          await tx.guardPayrollGroupMember.createMany({
            data: guardIds.map((guardId) => ({ groupId: id, guardId })),
          });
        }
      }

      return tx.payrollGroup.update({
        where: { id },
        data: {
          ...(data.name        !== undefined ? { name: data.name }                : {}),
          ...(data.description !== undefined ? { description: data.description }  : {}),
          ...(data.isActive    !== undefined ? { isActive: data.isActive }        : {}),
        },
        include: {
          members: { include: { guard: true }, orderBy: { guard: { firstName: 'asc' } } },
          _count:  { select: { members: true } },
        },
      });
    });

    await writeAuditLog({
      action:   'PAYROLL_GROUP_UPDATED',
      entity:   'payrollGroup',
      entityId: id,
      oldValue: { name: existing.name, isActive: existing.isActive },
      newValue: {
        name:        group.name,
        description: group.description,
        isActive:    group.isActive,
        ...(replacesMembers ? { memberCount: guardIds.length } : {}),
        updatedBy,
      },
    });

    return fmt(group, true);
  }

  async remove(id: string, deletedBy: string): Promise<void> {
    const group = await prisma.payrollGroup.findUnique({
      where:   { id },
      include: { _count: { select: { members: true } } },
    });
    if (!group) throw new NotFoundError('Payroll group not found');

    // Memberships are join rows — cascade removes them, never the guards.
    await prisma.payrollGroup.delete({ where: { id } });

    await writeAuditLog({
      action:   'PAYROLL_GROUP_DELETED',
      entity:   'payrollGroup',
      entityId: id,
      oldValue: { name: group.name, memberCount: group._count.members, deletedBy },
    });
  }
}

export const payrollGroupService = new PayrollGroupService();
