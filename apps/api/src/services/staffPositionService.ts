import prisma from '../db/prisma';
import { writeAuditLog } from '../lib/auditLog';
import { AppError, NotFoundError } from '../errors/AppError';
import type {
  StaffPositionResponse,
  CreateStaffPositionInput,
  UpdateStaffPositionInput,
} from '@stap/shared';

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(p: any, staffCount = 0): StaffPositionResponse {
  return {
    id:           p.id,
    code:         p.code,
    title:        p.title,
    department:   p.department,
    grade:        p.grade ?? null,
    description:  p.description ?? null,
    displayOrder: p.displayOrder,
    isActive:     p.isActive,
    staffCount,
    createdAt:    p.createdAt.toISOString(),
  };
}

/**
 * Derives the stable code a staff record will store, e.g. "Zone 1 Supervisor"
 * → ZONE_1_SUPERVISOR. It matches the codes already on User.jobTitle, so a
 * position recreated by hand adopts the staff who held it rather than leaving
 * them pointing at nothing.
 */
function toCode(title: string): string {
  const base = title
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, ' ')      // drop punctuation, em dashes included
    .trim()
    .replace(/[\s-]+/g, '_')
    .toUpperCase();
  return base || 'POSITION';
}

/** Counts staff per position code in one query, rather than one per row. */
async function countsByCode(): Promise<Map<string, number>> {
  const grouped = await prisma.user.groupBy({
    by:     ['jobTitle'],
    _count: { _all: true },
    where:  { jobTitle: { not: null } },
  });
  return new Map(
    grouped
      .filter((g): g is typeof g & { jobTitle: string } => g.jobTitle !== null)
      .map((g) => [g.jobTitle, g._count._all]),
  );
}

// ── StaffPositionService ───────────────────────────────────────────────────────

class StaffPositionService {
  async listPositions(activeOnly = false): Promise<StaffPositionResponse[]> {
    const [positions, counts] = await Promise.all([
      prisma.staffPosition.findMany({
        where:   activeOnly ? { isActive: true } : {},
        orderBy: [{ department: 'asc' }, { displayOrder: 'asc' }, { title: 'asc' }],
      }),
      countsByCode(),
    ]);
    return positions.map((p) => fmt(p, counts.get(p.code) ?? 0));
  }

  async createPosition(data: CreateStaffPositionInput, _createdBy: string): Promise<StaffPositionResponse> {
    const title      = data.title.trim();
    const department = data.department.trim();

    const clash = await prisma.staffPosition.findFirst({
      where: {
        title:      { equals: title, mode: 'insensitive' },
        department: { equals: department, mode: 'insensitive' },
      },
    });
    if (clash) {
      throw new AppError(`"${title}" already exists in ${department}.`, 409);
    }

    // The code has to be unique on its own, so a title that reduces to a code
    // already taken gets a suffix rather than failing in front of the user.
    const base = toCode(title);
    let code = base;
    for (let n = 2; await prisma.staffPosition.findUnique({ where: { code } }); n++) {
      code = `${base}_${n}`;
    }

    const position = await prisma.staffPosition.create({
      data: {
        code,
        title,
        department,
        grade:        data.grade?.trim() || null,
        description:  data.description?.trim() || null,
        displayOrder: data.displayOrder ?? 0,
      },
    });

    await writeAuditLog({
      action:   'STAFF_POSITION_CREATED',
      entity:   'staffPosition',
      entityId: position.id,
      newValue: { code: position.code, title: position.title, department: position.department },
    });

    return fmt(position);
  }

  async updatePosition(
    id: string,
    data: UpdateStaffPositionInput,
    _updatedBy: string,
  ): Promise<StaffPositionResponse> {
    const existing = await prisma.staffPosition.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Position not found');

    const title      = data.title?.trim()      ?? existing.title;
    const department = data.department?.trim() ?? existing.department;

    if (title !== existing.title || department !== existing.department) {
      const clash = await prisma.staffPosition.findFirst({
        where: {
          id:         { not: id },
          title:      { equals: title, mode: 'insensitive' },
          department: { equals: department, mode: 'insensitive' },
        },
      });
      if (clash) throw new AppError(`"${title}" already exists in ${department}.`, 409);
    }

    // `code` is deliberately left alone: staff records point at it, and renaming
    // a position should reword the label, not detach everyone holding it.
    const position = await prisma.staffPosition.update({
      where: { id },
      data: {
        title,
        department,
        grade:        data.grade === undefined       ? undefined : (data.grade?.trim() || null),
        description:  data.description === undefined ? undefined : (data.description?.trim() || null),
        displayOrder: data.displayOrder ?? undefined,
        isActive:     data.isActive ?? undefined,
      },
    });

    await writeAuditLog({
      action:   'STAFF_POSITION_UPDATED',
      entity:   'staffPosition',
      entityId: id,
      oldValue: { title: existing.title, department: existing.department, grade: existing.grade },
      newValue: { title: position.title, department: position.department, grade: position.grade },
    });

    const counts = await countsByCode();
    return fmt(position, counts.get(position.code) ?? 0);
  }

  async deactivatePosition(
    id: string,
    _by: string,
  ): Promise<{ position: StaffPositionResponse; staffWithPosition: number }> {
    const existing = await prisma.staffPosition.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Position not found');

    const staffWithPosition = await prisma.user.count({
      where: { jobTitle: existing.code, status: 'ACTIVE' },
    });

    const updated = await prisma.staffPosition.update({ where: { id }, data: { isActive: false } });

    await writeAuditLog({
      action:   'STAFF_POSITION_DEACTIVATED',
      entity:   'staffPosition',
      entityId: id,
      newValue: { title: existing.title, staffCurrentlyHolding: staffWithPosition },
    });

    return { position: fmt(updated, staffWithPosition), staffWithPosition };
  }

  async activatePosition(id: string): Promise<StaffPositionResponse> {
    const existing = await prisma.staffPosition.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Position not found');

    const updated = await prisma.staffPosition.update({ where: { id }, data: { isActive: true } });

    await writeAuditLog({
      action:   'STAFF_POSITION_ACTIVATED',
      entity:   'staffPosition',
      entityId: id,
      newValue: { title: existing.title },
    });

    const counts = await countsByCode();
    return fmt(updated, counts.get(updated.code) ?? 0);
  }

  async deletePosition(id: string, _by: string): Promise<void> {
    const existing = await prisma.staffPosition.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Position not found');

    const held = await prisma.user.count({ where: { jobTitle: existing.code } });
    if (held > 0) {
      throw new AppError(
        `Cannot delete "${existing.title}" — ${held} staff member(s) hold this position. `
        + 'Deactivate it instead to hide it from the dropdown without changing their profiles.',
        409,
      );
    }

    await prisma.staffPosition.delete({ where: { id } });

    await writeAuditLog({
      action:   'STAFF_POSITION_DELETED',
      entity:   'staffPosition',
      entityId: id,
      oldValue: { code: existing.code, title: existing.title, department: existing.department },
    });
  }

  /** Orders within a department; the ids given are taken to be one department's. */
  async reorderPositions(orderedIds: string[]): Promise<StaffPositionResponse[]> {
    await Promise.all(
      orderedIds.map((pid, index) =>
        prisma.staffPosition.update({ where: { id: pid }, data: { displayOrder: index + 1 } }),
      ),
    );
    return this.listPositions();
  }
}

export const staffPositionService = new StaffPositionService();
