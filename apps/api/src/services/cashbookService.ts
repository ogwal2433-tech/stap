import prisma from '../db/prisma';
import { QueueService } from '../jobs/QueueService';
import type { CashbookEntryInput, CashbookEntryResponse, PaginatedResponse } from '@security360/shared';

// ── Helper ─────────────────────────────────────────────────────────────────────

function fmt(entry: any, runningBalance: number): CashbookEntryResponse {
  return {
    id:             entry.id,
    date:           entry.date.toISOString(),
    description:    entry.description,
    category:       entry.category,
    amount:         entry.amount,
    type:           entry.type,
    recordedBy:     entry.recordedBy,
    runningBalance,
    createdAt:      entry.createdAt.toISOString(),
  };
}

// ── CashbookService ────────────────────────────────────────────────────────────

class CashbookService {
  /**
   * An entry the ledger writes itself at the moment money actually moves.
   * sourceRef keys the row to that event ("PAYMENT:<id>", "PAYSLIP:<id>", …),
   * and the column is unique, so a retried webhook, a second approval attempt
   * or a re-run backfill finds the row already posted and does nothing — no
   * movement can ever be counted twice. Deliberately best-effort: by the time
   * we are called the money has already moved on the caller's side, so a
   * ledger hiccup records itself in the audit trail instead of failing the
   * business operation and leaving the invoice or payroll run half-updated.
   */
  async recordAuto(data: {
    sourceRef:   string;
    date:        Date;
    description: string;
    category:    string;
    amount:      number;
    type:        'IN' | 'OUT';
    recordedBy:  string;
  }): Promise<void> {
    try {
      await prisma.cashbookEntry.upsert({
        where:  { sourceRef: data.sourceRef },
        create: { ...data },
        update: {},
      });
    } catch (err: any) {
      // P2002: a concurrent writer posted the same movement first — the entry
      // exists, which is exactly the outcome we wanted.
      if (err?.code === 'P2002') return;
      try {
        await QueueService.logAudit({
          userId:   data.recordedBy,
          action:   'CASHBOOK_AUTO_ENTRY_FAILED',
          entity:   'cashbookEntry',
          entityId: data.sourceRef,
          newValue: { sourceRef: data.sourceRef, error: String(err?.message ?? err) },
        });
      } catch {
        // The audit queue is unreachable too; the payment itself still stands.
      }
    }
  }

  /**
   * The inverse of recordAuto: a commitment that was posted (an approved
   * payroll run, say) and then rejected before any money moved takes its
   * ledger row back with it. Best-effort like the post — the business
   * operation has already committed either way.
   */
  async removeAuto(sourceRef: string): Promise<void> {
    try {
      await prisma.cashbookEntry.deleteMany({ where: { sourceRef } });
    } catch (err: any) {
      try {
        await QueueService.logAudit({
          userId:   'system',
          action:   'CASHBOOK_AUTO_ENTRY_REMOVE_FAILED',
          entity:   'cashbookEntry',
          entityId: sourceRef,
          newValue: { sourceRef, error: String(err?.message ?? err) },
        });
      } catch {
        // The audit queue is unreachable too; the rejection itself still stands.
      }
    }
  }

  async addEntry(data: CashbookEntryInput, recordedBy: string): Promise<CashbookEntryResponse> {
    const entry = await prisma.cashbookEntry.create({
      data: {
        date:        new Date(data.date),
        description: data.description,
        category:    data.category,
        amount:      data.amount,
        type:        data.type,
        recordedBy,
      },
    });

    // Compute running balance up to this entry
    const all = await prisma.cashbookEntry.findMany({
      where:   { date: { lte: entry.date } },
      orderBy: { date: 'asc' },
    });
    let balance = 0;
    for (const e of all) {
      balance += e.type === 'IN' ? e.amount : -e.amount;
    }

    await QueueService.logAudit({
      userId:   recordedBy,
      action:   'CASHBOOK_ENTRY_ADDED',
      entity:   'cashbookEntry',
      entityId: entry.id,
      newValue: { type: data.type, amount: data.amount },
    });

    return fmt(entry, balance);
  }

  async list(query: {
    month?: number;
    year?: number;
    type?: string;
    page: number;
    limit: number;
  }): Promise<PaginatedResponse<CashbookEntryResponse>> {
    const { page, limit, month, year, type } = query;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (type) where.type = type;
    if (month && year) {
      where.date = {
        gte: new Date(year, month - 1, 1),
        lte: new Date(year, month, 0, 23, 59, 59),
      };
    } else if (year) {
      where.date = {
        gte: new Date(year, 0, 1),
        lte: new Date(year, 11, 31, 23, 59, 59),
      };
    }

    const [entries, total] = await Promise.all([
      prisma.cashbookEntry.findMany({ where, orderBy: { date: 'asc' }, skip, take: limit }),
      prisma.cashbookEntry.count({ where }),
    ]);

    // Compute running balance for the returned page
    // Fetch all entries up to the last date on this page for accurate balance
    const allPrior = entries.length > 0
      ? await prisma.cashbookEntry.findMany({
          where:   { date: { lte: entries[entries.length - 1].date } },
          orderBy: { date: 'asc' },
        })
      : [];

    let runningBalance = 0;
    const balanceMap = new Map<string, number>();
    for (const e of allPrior) {
      runningBalance += e.type === 'IN' ? e.amount : -e.amount;
      balanceMap.set(e.id, runningBalance);
    }

    const totalPages = Math.ceil(total / limit);
    return {
      data: entries.map((e) => fmt(e, balanceMap.get(e.id) ?? 0)),
      pagination: { page, limit, total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
    };
  }

  async getMonthSummary(month: number, year: number) {
    const periodStart = new Date(year, month - 1, 1);
    const periodEnd   = new Date(year, month, 0, 23, 59, 59);

    const entries = await prisma.cashbookEntry.findMany({
      where: { date: { gte: periodStart, lte: periodEnd } },
    });

    const totalIn  = entries.filter((e) => e.type === 'IN').reduce((s, e) => s + e.amount, 0);
    const totalOut = entries.filter((e) => e.type === 'OUT').reduce((s, e) => s + e.amount, 0);

    // Opening balance = sum of all entries before this month
    const prior = await prisma.cashbookEntry.findMany({
      where: { date: { lt: periodStart } },
    });
    const openingBalance = prior.reduce(
      (s, e) => s + (e.type === 'IN' ? e.amount : -e.amount),
      0,
    );

    return {
      totalIn,
      totalOut,
      netCash:        totalIn - totalOut,
      openingBalance,
      closingBalance: openingBalance + totalIn - totalOut,
    };
  }
}

export const cashbookService = new CashbookService();
