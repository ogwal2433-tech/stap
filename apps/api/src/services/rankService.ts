import prisma from '../db/prisma';
import { writeAuditLog } from '../lib/auditLog';
import { AppError, NotFoundError } from '../errors/AppError';
import type {
  GuardRankResponse,
  CreateGuardRankInput,
  UpdateGuardRankInput,
} from '@stap/shared';

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(r: any): GuardRankResponse {
  return {
    id:            r.id,
    name:          r.name,
    defaultSalary: r.defaultSalary ?? null,
    displayOrder:  r.displayOrder,
    isActive:      r.isActive,
    createdAt:     r.createdAt.toISOString(),
  };
}

// ── RankService ────────────────────────────────────────────────────────────────

class RankService {
  async listRanks(activeOnly = false): Promise<GuardRankResponse[]> {
    const ranks = await prisma.guardRank.findMany({
      where:   activeOnly ? { isActive: true } : {},
      orderBy: { displayOrder: 'asc' },
    });
    return ranks.map(fmt);
  }

  async createRank(data: CreateGuardRankInput, _createdBy: string): Promise<GuardRankResponse> {
    const existing = await prisma.guardRank.findFirst({
      where: { name: { equals: data.name, mode: 'insensitive' } },
    });
    if (existing) {
      throw new AppError(`A rank named "${data.name}" already exists.`, 409);
    }

    const rank = await prisma.guardRank.create({
      data: {
        name:          data.name,
        defaultSalary: data.defaultSalary ?? null,
        displayOrder:  data.displayOrder ?? 0,
      },
    });

    await writeAuditLog({
        action:   'RANK_CREATED',
        entity:   'guardRank',
        entityId: rank.id,
        newValue: { name: rank.name },
      });

    return fmt(rank);
  }

  async updateRank(id: string, data: UpdateGuardRankInput, _updatedBy: string): Promise<GuardRankResponse> {
    const existing = await prisma.guardRank.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Rank not found');

    if (data.name && data.name !== existing.name) {
      const duplicate = await prisma.guardRank.findFirst({
        where: {
          name: { equals: data.name, mode: 'insensitive' },
          id:   { not: id },
        },
      });
      if (duplicate) {
        throw new AppError(`A rank named "${data.name}" already exists.`, 409);
      }
    }

    const updated = await prisma.guardRank.update({ where: { id }, data });

    await writeAuditLog({
        action:   'RANK_UPDATED',
        entity:   'guardRank',
        entityId: id,
        oldValue: { name: existing.name, isActive: existing.isActive },
        newValue: data,
      });

    return fmt(updated);
  }

  async deactivateRank(id: string, _deactivatedBy: string): Promise<{ rank: GuardRankResponse; guardsWithRank: number }> {
    const rank = await prisma.guardRank.findUnique({ where: { id } });
    if (!rank) throw new NotFoundError('Rank not found');

    const guardsWithRank = await prisma.guard.count({
      where: { rank: rank.name, employmentStatus: 'ACTIVE' },
    });

    const updated = await prisma.guardRank.update({
      where: { id },
      data:  { isActive: false },
    });

    await writeAuditLog({
        action:   'RANK_DEACTIVATED',
        entity:   'guardRank',
        entityId: id,
        newValue: { guardsCurrentlyWithRank: guardsWithRank },
      });

    return { rank: fmt(updated), guardsWithRank };
  }

  async activateRank(id: string): Promise<GuardRankResponse> {
    const rank = await prisma.guardRank.findUnique({ where: { id } });
    if (!rank) throw new NotFoundError('Rank not found');

    const updated = await prisma.guardRank.update({
      where: { id },
      data:  { isActive: true },
    });

    await writeAuditLog({
        action:   'RANK_ACTIVATED',
        entity:   'guardRank',
        entityId: id,
        newValue: { name: rank.name },
      });

    return fmt(updated);
  }

  async deleteRank(id: string, _deletedBy: string): Promise<void> {
    const rank = await prisma.guardRank.findUnique({ where: { id } });
    if (!rank) throw new NotFoundError('Rank not found');

    const guardsWithRank = await prisma.guard.count({ where: { rank: rank.name } });
    if (guardsWithRank > 0) {
      throw new AppError(
        `Cannot delete rank "${rank.name}" — ${guardsWithRank} guard(s) currently hold this rank. Deactivate it instead to hide it from the dropdown.`,
        409,
      );
    }

    await prisma.guardRank.delete({ where: { id } });

    await writeAuditLog({
        action:   'RANK_DELETED',
        entity:   'guardRank',
        entityId: id,
        oldValue: { name: rank.name },
      });
  }

  async reorderRanks(orderedIds: string[]): Promise<GuardRankResponse[]> {
    await Promise.all(
      orderedIds.map((rid, index) =>
        prisma.guardRank.update({
          where: { id: rid },
          data:  { displayOrder: index + 1 },
        }),
      ),
    );
    return this.listRanks();
  }

  async bulkUpdateGuardSalaryByRank(
    rankId:       string,
    newSalary:    number,
    updatedBy:    string,
    prevSalary?:  number,
  ): Promise<{ updatedCount: number }> {
    const rank = await prisma.guardRank.findUnique({ where: { id: rankId } });
    if (!rank) throw new NotFoundError('Rank not found');

    const salaryFilter = prevSalary !== undefined ? prevSalary : (rank.defaultSalary ?? undefined);

    const result = await prisma.guard.updateMany({
      where: {
        rank:             rank.name,
        employmentStatus: 'ACTIVE',
        ...(salaryFilter !== undefined ? { salaryRate: salaryFilter } : {}),
      },
      data: { salaryRate: newSalary },
    });

    await writeAuditLog({
        action:   'RANK_SALARY_BULK_UPDATE',
        entity:   'guard',
        entityId: rankId,
        newValue: {
          rankName:      rank.name,
          newSalary,
          guardsUpdated: result.count,
          updatedBy,
        },
      });

    return { updatedCount: result.count };
  }
}

export const rankService = new RankService();
