import fs from 'node:fs/promises';
import path from 'node:path';
import prisma from '../db/prisma';
import { QueueService } from '../jobs/QueueService';
import { notificationService } from './notificationService';
import { payrollExportService } from './payrollExportService';
import { NotFoundError, AppError } from '../errors/AppError';
import { FINANCE_ROLES, HR_ROLES } from '@security360/shared';
import type { SharePayrollInput } from '@security360/shared';

// Volume-backed uploads root: process.cwd() is /app, where the
// persistent volume lands (same convention as uploadService).
const UPLOAD_ROOT = path.join(process.cwd(), 'public', 'uploads', 'payroll');

export interface ShareRecipientResponse {
  userId: string;
  staffName: string;
  readAt: string | null;
}

export interface PayrollShareResponse {
  id: string;
  payrollRunId: string;
  period: string;
  runType: string;
  format: string;
  filename: string;
  note: string | null;
  generatedBy: string;
  createdAt: string;
  recipients: ShareRecipientResponse[];
}

function fmtShare(s: any): PayrollShareResponse {
  return {
    id: s.id,
    payrollRunId: s.payrollRunId,
    period: `${s.payrollRun.month}/${s.payrollRun.year}`,
    runType: s.payrollRun.runType ?? 'GUARD',
    format: s.format,
    filename: path.basename(s.filePath),
    note: s.note,
    generatedBy: s.generatedBy,
    createdAt: s.createdAt.toISOString(),
    recipients: (s.recipients ?? []).map((r: any) => ({
      userId: r.userId,
      staffName: r.user ? r.user.name : '',
      readAt: r.readAt ? r.readAt.toISOString() : null,
    })),
  };
}

function canViewAll(role: string): boolean {
  return (FINANCE_ROLES as readonly string[]).includes(role)
    || (HR_ROLES as readonly string[]).includes(role);
}

class PayrollShareService {
  /**
   * Save a run's files into the system and share with staff accounts.
   * Only internal staff (guard and client portal roles excluded) may receive
   * payroll schedules. Notifications are bell-only; nothing leaves the system.
   */
  async share(
    runId: string,
    data: SharePayrollInput,
    generatedBy: string,
    generatedByName: string,
  ): Promise<PayrollShareResponse[]> {
    const run = await prisma.payrollRun.findUnique({ where: { id: runId } });
    if (!run) throw new NotFoundError('Payroll run not found');

    const formats = [...new Set(data.formats)];
    if (formats.length === 0) throw new AppError('Pick at least one format to share.', 400);

    const recipientIds = [...new Set(data.userIds)];
    if (recipientIds.length === 0) throw new AppError('Pick at least one staff member.', 400);
    const recipients = await prisma.user.findMany({
      where: {
        id: { in: recipientIds },
        status: 'ACTIVE',
        role: { notIn: ['GUARD', 'CLIENT'] },
      },
    });
    const found = new Set(recipients.map((u) => u.id));
    const missing = recipientIds.filter((id) => !found.has(id));
    if (missing.length > 0) {
      throw new AppError('Only active internal staff can receive payroll schedules.', 400);
    }

    const periodLabel = `${run.month}/${run.year}`;
    const runLabel = (run as any).runType === 'STAFF' ? 'Staff payroll' : 'Payroll';
    const created: any[] = [];

    for (const format of formats) {
      const built = format === 'PDF'
        ? await payrollExportService.buildRunPdf(runId, generatedByName)
        : await payrollExportService.buildRunExcel(runId, generatedByName);
      const buffer = (built as any).buffer ?? (built as any).pdf;
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${stamp}-${(built as any).filename}`;
      const dir = path.join(UPLOAD_ROOT, runId);
      await fs.mkdir(dir, { recursive: true });
      const filePath = path.join('payroll', runId, filename);
      await fs.writeFile(path.join(UPLOAD_ROOT, runId, filename), buffer);

      const share = await prisma.payrollShare.create({
        data: {
          payrollRunId: runId,
          format,
          filePath,
          note: data.note ?? null,
          generatedBy,
          recipients: {
            create: recipients.map((u) => ({ userId: u.id })),
          },
        },
        include: { payrollRun: true, recipients: { include: { user: true } } },
      });
      created.push(share);

      for (const u of recipients) {
        await notificationService.send({
          userId: u.id,
          type: 'PAYROLL_SHARED',
          channels: ['inApp', 'email'],
          title: `${runLabel} schedule shared: ${periodLabel}`,
          message: `${generatedByName} shared the ${periodLabel} ${runLabel.toLowerCase()} schedule (${format})${data.note ? `: ${data.note}` : ''}.`,
          entityType: 'payrollShare',
          entityId: share.id,
        });
      }

      await QueueService.logAudit({
        userId: generatedBy,
        action: 'PAYROLL_SHARED',
        entity: 'payrollShare',
        entityId: share.id,
        newValue: {
          payrollRunId: runId,
          format,
          recipients: recipients.map((u) => u.id),
        },
      });
    }

    return created.map(fmtShare);
  }

  async list(query: { runId?: string; format?: string }): Promise<PayrollShareResponse[]> {
    const shares = await prisma.payrollShare.findMany({
      where: {
        ...(query.runId ? { payrollRunId: query.runId } : {}),
        ...(query.format ? { format: query.format } : {}),
      },
      include: { payrollRun: true, recipients: { include: { user: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return shares.map(fmtShare);
  }

  /**
   * Recipient-only download: the recipient, or finance/HR. Marks the
   * recipient's read receipt and audits every download.
   */
  async download(
    shareId: string,
    user: { userId: string; role: string; name: string },
  ): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
    const share = await prisma.payrollShare.findUnique({
      where: { id: shareId },
      include: { recipients: true },
    });
    if (!share) throw new NotFoundError('Shared schedule not found');

    const isRecipient = share.recipients.some((r) => r.userId === user.userId);
    if (!isRecipient && !canViewAll(user.role)) {
      throw new AppError('This schedule was not shared with you.', 403);
    }

    if (isRecipient) {
      await prisma.payrollShareRecipient.updateMany({
        where: { shareId, userId: user.userId, readAt: null },
        data: { readAt: new Date() },
      });
    }

    const uploadsRoot = path.join(process.cwd(), 'public', 'uploads');
    let buffer: Buffer;
    try {
      buffer = await fs.readFile(path.join(uploadsRoot, share.filePath));
    } catch {
      // Self-healing: the share row outlived its file. Rebuild the exact
      // file in place from the live run so this and future downloads just
      // work - no error, no re-share needed.
      const run = await prisma.payrollRun.findUnique({ where: { id: share.payrollRunId } });
      if (!run) {
        throw new AppError('This schedule and its payroll run are both gone. Ask finance to share the run again.', 410);
      }
      const rebuilt = share.format === 'PDF'
        ? await payrollExportService.buildRunPdf(share.payrollRunId, user.name)
        : await payrollExportService.buildRunExcel(share.payrollRunId, user.name);
      buffer = Buffer.from((rebuilt as any).buffer ?? (rebuilt as any).pdf);
      const full = path.join(uploadsRoot, share.filePath);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, buffer);
      await QueueService.logAudit({
        userId: user.userId,
        action: 'PAYROLL_SHARE_REGENERATED',
        entity: 'payrollShare',
        entityId: shareId,
      });
    }

    await QueueService.logAudit({
      userId: user.userId,
      action: 'PAYROLL_SHARE_DOWNLOADED',
      entity: 'payrollShare',
      entityId: shareId,
    });

    return {
      buffer,
      filename: path.basename(share.filePath),
      contentType: share.format === 'PDF'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }
}

export const payrollShareService = new PayrollShareService();
