import prisma from '../db/prisma';
import { AppError, NotFoundError } from '../errors/AppError';
import { QueueService } from '../jobs/QueueService';
import { PORTAL_ROLES } from '../constants/systemRoles';
import { OUTSTANDING_STATUSES } from './invoiceService';

/**
 * Soft delete and restore for clients, guards, staff, contracts and sites, and
 * voiding for invoices.
 *
 * A deleted row keeps everything it had; db/prisma.ts hides it from every read.
 * What each entity may be deleted *with* is decided here, and deliberately
 * narrow:
 *
 *   client    nothing live underneath — no sites, no open contract, no unpaid
 *             invoice, no active portal login. Its paid history stays visible
 *             under its name.
 *   guard     a record made by mistake: no deployments, attendance, pay, or
 *             other history. A guard with history is terminated instead.
 *   staff     a record made by mistake: never signed in, nothing recorded
 *             against them. Anyone else is deactivated instead.
 *   contract  no unpaid invoice. Its invoices keep pointing at it.
 *   site      no upcoming deployment.
 *
 * Invoices are voided, never deleted: they stay on file marked VOID, drop out
 * of balances, and are refused once any money has moved against them.
 */

export type DeletableType = 'client' | 'guard' | 'staff' | 'contract' | 'site';

/** Every row, deleted or not — the read filter steps aside when deletedAt is named. */
const ANY = { deletedAt: undefined } as const;
/** Only deleted rows. */
const DELETED = { deletedAt: { not: null } } as const;

const stamp   = (actorId: string) => ({ deletedAt: new Date(), deletedById: actorId });
const unstamp = { deletedAt: null, deletedById: null };

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "a, b and c" — for listing what blocks a deletion. */
function list(items: string[]): string {
  return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

async function audit(actorId: string, action: string, entity: string, entityId: string, value: Record<string, unknown>) {
  await QueueService.logAudit({ userId: actorId, action, entity, entityId, newValue: value });
}

function refuse(message: string): never {
  throw new AppError(message, 409);
}

// ── Clients ──────────────────────────────────────────────────────────────────

async function deleteClient(id: string, actorId: string) {
  const client = await prisma.client.findFirst({ where: { id, ...ANY }, select: { id: true, clientName: true, deletedAt: true } });
  if (!client) throw new NotFoundError('Client not found');
  if (client.deletedAt) throw new AppError(`${client.clientName} is already deleted.`, 400);

  const [sites, contracts, unpaid, logins] = await Promise.all([
    prisma.site.count({ where: { clientId: id } }),
    prisma.contract.count({ where: { clientId: id, status: { in: ['DRAFT', 'ACTIVE', 'EXPIRING'] } } }),
    prisma.invoice.count({ where: { clientId: id, status: { in: [...OUTSTANDING_STATUSES] } } }),
    prisma.user.count({ where: { clientId: id, status: 'ACTIVE' } }),
  ]);
  const blocking = [
    sites     && plural(sites, 'site'),
    contracts && plural(contracts, 'open contract'),
    unpaid    && plural(unpaid, 'unpaid invoice'),
    logins    && plural(logins, 'active portal login'),
  ].filter(Boolean) as string[];
  if (blocking.length) {
    refuse(`${client.clientName} still has ${list(blocking)}. Close or remove those first — ` +
      'a client is deleted only once nothing is live underneath it.');
  }

  await prisma.client.update({ where: { id }, data: stamp(actorId) });
  await audit(actorId, 'CLIENT_DELETED', 'client', id, { clientName: client.clientName });
  return { id, name: client.clientName };
}

async function restoreClient(id: string, actorId: string) {
  const client = await prisma.client.findFirst({ where: { id, ...ANY }, select: { id: true, clientName: true, deletedAt: true } });
  if (!client) throw new NotFoundError('Client not found');
  if (!client.deletedAt) throw new AppError(`${client.clientName} is not deleted.`, 400);

  await prisma.client.update({ where: { id }, data: unstamp });
  await audit(actorId, 'CLIENT_RESTORED', 'client', id, { clientName: client.clientName });
  return { id, name: client.clientName };
}

// ── Guards ───────────────────────────────────────────────────────────────────

/** What counts as history. Documents, relatives and associates are part of the record itself. */
const GUARD_HISTORY = {
  deployments: 'deployment', deploymentHistory: 'deployment record', attendance: 'attendance record',
  payslips: 'payslip', deductions: 'deduction', disciplinary: 'disciplinary record',
  transfers: 'transfer', promotions: 'promotion', leaveRequests: 'leave request',
  trainingAttendees: 'training record', incidentGuards: 'incident', inventoryTxns: 'kit issue',
} as const;

async function deleteGuard(id: string, actorId: string, opts?: { override?: boolean; reason?: string }) {
  const guard = await prisma.guard.findFirst({
    where:  { id, ...ANY },
    select: {
      id: true, firstName: true, lastName: true, deletedAt: true, userId: true,
      _count: { select: Object.fromEntries(Object.keys(GUARD_HISTORY).map((k) => [k, true])) as Record<keyof typeof GUARD_HISTORY, true> },
    },
  });
  if (!guard) throw new NotFoundError('Guard not found');
  const name = `${guard.firstName} ${guard.lastName}`;
  if (guard.deletedAt) throw new AppError(`${name} is already deleted.`, 400);

  const counts = guard._count as Record<string, number>;
  const history = (Object.entries(GUARD_HISTORY) as [string, string][])
    .filter(([key]) => counts[key] > 0)
    .map(([key, label]) => plural(counts[key], label));
  const hadLogin = !!guard.userId;

  // Director override: delete any guard regardless of constraints. The row is
  // still only soft-deleted (history is kept, restore works as normal), but
  // the history and login refusals below are skipped. A reason is mandatory
  // and everything skipped lands in the audit trail.
  if (opts?.override === true) {
    const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { role: true } });
    if (!actor || (actor.role !== 'DIRECTOR' && actor.role !== 'MD')) {
      throw new AppError('Only a Director can delete a guard with history.', 403);
    }
    const reason = (opts?.reason ?? '').trim();
    if (reason.length < 5) {
      throw new AppError('Give a reason for deleting a guard with history - at least 5 characters.', 400);
    }
    await prisma.$transaction(async (tx) => {
      // Detach and deactivate the portal login in the same move, so no
      // orphaned login keeps pointing at a deleted profile. The User row
      // itself stays for the audit trail.
      if (guard.userId) {
        await tx.guard.update({ where: { id }, data: { userId: null } });
        await tx.user.update({
          where: { id: guard.userId },
          data: {
            status: 'INACTIVE', deactivatedAt: new Date(),
            deactivatedById: actorId, deactivationReason: `Guard profile deleted by director: ${reason}`,
          },
        });
      }
      await tx.guard.update({ where: { id }, data: stamp(actorId) });
    });
    await audit(actorId, 'GUARD_DELETED', 'guard', id, {
      name, override: true, reason,
      historySkipped: history, hadLogin,
    });
    return { id, name, override: true };
  }

  if (history.length) {
    refuse(`${name} has ${list(history)}, so they are part of the record. ` +
      'Change their status to Terminated instead — only a guard added by mistake can be deleted.');
  }
  if (guard.userId) {
    refuse(`${name} has a portal login. Revoke their access first.`);
  }

  await prisma.guard.update({ where: { id }, data: stamp(actorId) });
  await audit(actorId, 'GUARD_DELETED', 'guard', id, { name });
  return { id, name };
}

// ?? Guards: permanent delete from the Deserters Archive ???????????????????????

/**
 * Permanently deletes a DESERTED guard and every record that points at them,
 * except payslips (kept for finance, de-linked, name snapshotted on the row)
 * and the audit trail (which records this purge). Director or MD only, with
 * the system ID typed as confirmation and a mandatory reason. There is no
 * undo: documents, history and the guard row itself are gone.
 */
async function purgeGuard(id: string, actorId: string, opts: { systemId: string; reason: string }) {
  const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { role: true } });
  if (!actor || (actor.role !== 'DIRECTOR' && actor.role !== 'MD')) {
    throw new AppError('Only a Director or the MD can permanently delete a guard.', 403);
  }
  const guard = await prisma.guard.findUnique({
    where: { id },
    select: {
      id: true, firstName: true, lastName: true, systemId: true,
      employmentStatus: true, userId: true,
      _count: { select: {
        deployments: true, deploymentHistory: true, attendance: true,
        payslips: true, deductions: true, disciplinary: true,
        transfers: true, promotions: true, leaveRequests: true,
        trainingAttendees: true, incidentGuards: true, inventoryTxns: true,
        documents: true, relatives: true, associates: true,
      } },
    },
  });
  if (!guard) throw new NotFoundError('Guard not found');
  const name = `${guard.firstName} ${guard.lastName}`;
  if (guard.employmentStatus !== 'DESERTED') {
    throw new AppError(
      `Only deserted guards can be permanently deleted from the archive. ${name} is ${guard.employmentStatus}.`,
      400,
    );
  }
  const typed = (opts?.systemId ?? '').trim().toUpperCase();
  if (!typed || typed !== (guard.systemId ?? '').toUpperCase()) {
    throw new AppError('Type the guard system ID exactly as shown to confirm permanent deletion.', 400);
  }
  const reason = (opts?.reason ?? '').trim();
  if (reason.length < 5) {
    throw new AppError('Give a reason for permanent deletion - at least 5 characters.', 400);
  }
  const counts = guard._count as Record<string, number>;

  await prisma.$transaction(async (tx) => {
    // Detach and deactivate the portal login first, as soft-delete does.
    if (guard.userId) {
      await tx.guard.update({ where: { id }, data: { userId: null } });
      await tx.user.update({
        where: { id: guard.userId },
        data: {
          status: 'INACTIVE', deactivatedAt: new Date(),
          deactivatedById: actorId, deactivationReason: `Guard purged by director: ${reason}`,
        },
      });
    }
    // Payslips stay readable for finance: de-linked, name kept on the row.
    if (counts.payslips > 0) {
      await tx.payslip.updateMany({
        where: { guardId: id },
        data:  { guardId: null, guardNameSnapshot: name },
      });
    }
    await tx.guardDeduction.deleteMany({ where: { guardId: id } });
    await tx.incidentGuard.deleteMany({ where: { guardId: id } });
    await tx.trainingAttendee.deleteMany({ where: { guardId: id } });
    await tx.leaveRequest.deleteMany({ where: { guardId: id } });
    await tx.inventoryTransaction.deleteMany({ where: { guardId: id } });
    await tx.deployment.deleteMany({ where: { guardId: id } });
    await tx.attendanceRecord.deleteMany({ where: { guardId: id } });
    await tx.guardTransfer.deleteMany({ where: { guardId: id } });
    await tx.deploymentHistory.deleteMany({ where: { guardId: id } });
    await tx.disciplinaryRecord.deleteMany({ where: { guardId: id } });
    await tx.guardPromotion.deleteMany({ where: { guardId: id } });
    await tx.guardDocument.deleteMany({ where: { guardId: id } });
    await tx.guardRelative.deleteMany({ where: { guardId: id } });
    await tx.guardAssociate.deleteMany({ where: { guardId: id } });
    await tx.guard.delete({ where: { id } });
  });
  await audit(actorId, 'GUARD_PURGED', 'guard', id, { name, systemId: guard.systemId, reason, wiped: counts });
  return { id, name };
}

async function restoreGuard(id: string, actorId: string) {
  const guard = await prisma.guard.findFirst({ where: { id, ...ANY }, select: { id: true, firstName: true, lastName: true, deletedAt: true } });
  if (!guard) throw new NotFoundError('Guard not found');
  const name = `${guard.firstName} ${guard.lastName}`;
  if (!guard.deletedAt) throw new AppError(`${name} is not deleted.`, 400);

  await prisma.guard.update({ where: { id }, data: unstamp });
  await audit(actorId, 'GUARD_RESTORED', 'guard', id, { name });
  return { id, name };
}

// ── Staff ────────────────────────────────────────────────────────────────────

async function deleteStaff(id: string, actorId: string) {
  if (id === actorId) throw new AppError('You cannot delete your own account.', 400);

  const user = await prisma.user.findFirst({
    where:  { id, ...ANY },
    select: {
      id: true, name: true, role: true, status: true, lastLoginAt: true, deletedAt: true,
      _count: { select: { auditLogs: true, supervisedZones: true, alternateZones: true } },
    },
  });
  if (!user || (PORTAL_ROLES as readonly string[]).includes(user.role)) throw new NotFoundError('Staff member not found');
  if (user.deletedAt) throw new AppError(`${user.name} is already deleted.`, 400);

  if (user.lastLoginAt) {
    refuse(`${user.name} has signed in, so their account is part of the record. ` +
      'Deactivate it instead — only an account created by mistake can be deleted.');
  }
  if (user._count.auditLogs > 0) {
    refuse(`${user.name} has ${plural(user._count.auditLogs, 'recorded action')}. Deactivate the account instead.`);
  }
  const zones = user._count.supervisedZones + user._count.alternateZones;
  if (zones > 0) refuse(`${user.name} supervises ${plural(zones, 'zone')}. Reassign them first.`);

  if (user.role === 'DIRECTOR' && user.status === 'ACTIVE') {
    const directors = await prisma.user.count({ where: { role: 'DIRECTOR', status: 'ACTIVE' } });
    if (directors <= 1) throw new AppError('This is the last active Director account and cannot be deleted.', 400);
  }

  await prisma.user.update({ where: { id }, data: stamp(actorId) });
  await audit(actorId, 'STAFF_DELETED', 'User', id, { name: user.name, role: user.role });
  return { id, name: user.name };
}

async function restoreStaff(id: string, actorId: string) {
  const user = await prisma.user.findFirst({ where: { id, ...ANY }, select: { id: true, name: true, role: true, deletedAt: true } });
  if (!user || (PORTAL_ROLES as readonly string[]).includes(user.role)) throw new NotFoundError('Staff member not found');
  if (!user.deletedAt) throw new AppError(`${user.name} is not deleted.`, 400);

  await prisma.user.update({ where: { id }, data: unstamp });
  await audit(actorId, 'STAFF_RESTORED', 'User', id, { name: user.name });
  return { id, name: user.name };
}

// ── Contracts ────────────────────────────────────────────────────────────────

const contractLabel = (c: { id: string; client: { clientName: string } }) =>
  `Contract ${c.id.slice(-8).toUpperCase()} — ${c.client.clientName}`;

async function deleteContract(id: string, actorId: string) {
  const contract = await prisma.contract.findFirst({
    where:  { id, ...ANY },
    select: { id: true, deletedAt: true, clientId: true, client: { select: { clientName: true } } },
  });
  if (!contract) throw new NotFoundError('Contract not found');
  const name = contractLabel(contract);
  if (contract.deletedAt) throw new AppError(`${name} is already deleted.`, 400);

  const unpaid = await prisma.invoice.count({ where: { contractId: id, status: { in: [...OUTSTANDING_STATUSES] } } });
  if (unpaid) refuse(`${name} has ${plural(unpaid, 'unpaid invoice')}. Settle or void them first.`);

  // Soft, unlike the hard delete this replaces: that one cut every invoice loose
  // from its contract and destroyed the rate lines and amendment history.
  await prisma.contract.update({ where: { id }, data: stamp(actorId) });
  await audit(actorId, 'CONTRACT_DELETED', 'contract', id, { clientId: contract.clientId });
  return { id, name };
}

async function restoreContract(id: string, actorId: string) {
  const contract = await prisma.contract.findFirst({
    where:  { id, ...ANY },
    select: { id: true, deletedAt: true, clientId: true, client: { select: { clientName: true, deletedAt: true } } },
  });
  if (!contract) throw new NotFoundError('Contract not found');
  const name = contractLabel(contract);
  if (!contract.deletedAt) throw new AppError(`${name} is not deleted.`, 400);
  if (contract.client.deletedAt) refuse(`${contract.client.clientName} is deleted. Restore the client first.`);

  await prisma.contract.update({ where: { id }, data: unstamp });
  await audit(actorId, 'CONTRACT_RESTORED', 'contract', id, { clientId: contract.clientId });
  return { id, name };
}

// ── Sites ────────────────────────────────────────────────────────────────────

async function deleteSite(id: string, actorId: string) {
  const site = await prisma.site.findFirst({
    where:  { id, ...ANY },
    select: { id: true, siteName: true, deletedAt: true, clientId: true },
  });
  if (!site) throw new NotFoundError('Site not found');
  if (site.deletedAt) throw new AppError(`${site.siteName} is already deleted.`, 400);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = await prisma.deployment.count({ where: { siteId: id, date: { gte: today } } });
  if (upcoming) refuse(`${site.siteName} has ${plural(upcoming, 'upcoming deployment')}. Move the guards first.`);

  // Soft: the hard delete this replaces could not remove a site with any
  // history anyway — attendance and deployments hold it by foreign key.
  await prisma.site.update({ where: { id }, data: stamp(actorId) });
  await audit(actorId, 'SITE_DELETED', 'site', id, { siteName: site.siteName, clientId: site.clientId });
  return { id, name: site.siteName };
}

async function restoreSite(id: string, actorId: string) {
  const site = await prisma.site.findFirst({
    where:  { id, ...ANY },
    select: { id: true, siteName: true, deletedAt: true, client: { select: { clientName: true, deletedAt: true } } },
  });
  if (!site) throw new NotFoundError('Site not found');
  if (!site.deletedAt) throw new AppError(`${site.siteName} is not deleted.`, 400);
  if (site.client.deletedAt) refuse(`${site.client.clientName} is deleted. Restore the client first.`);

  await prisma.site.update({ where: { id }, data: unstamp });
  await audit(actorId, 'SITE_RESTORED', 'site', id, { siteName: site.siteName });
  return { id, name: site.siteName };
}

// ── The Deleted records page ─────────────────────────────────────────────────

export interface DeletedRecord {
  id:            string;
  name:          string;
  detail:        string | null;
  deletedAt:     string;
  deletedByName: string | null;
}

const who = { select: { name: true } } as const;

async function listDeleted(type: DeletableType): Promise<DeletedRecord[]> {
  const base = { where: DELETED, orderBy: { deletedAt: 'desc' as const }, take: 200 };
  const iso = (d: Date | null) => (d ? d.toISOString() : '');

  switch (type) {
    case 'client': {
      const rows = await prisma.client.findMany({ ...base, select: { id: true, clientName: true, systemId: true, deletedAt: true, deletedBy: who } });
      return rows.map((r) => ({ id: r.id, name: r.clientName, detail: r.systemId, deletedAt: iso(r.deletedAt), deletedByName: r.deletedBy?.name ?? null }));
    }
    case 'guard': {
      const rows = await prisma.guard.findMany({ ...base, select: { id: true, firstName: true, lastName: true, systemId: true, deletedAt: true, deletedBy: who } });
      return rows.map((r) => ({ id: r.id, name: `${r.firstName} ${r.lastName}`, detail: r.systemId, deletedAt: iso(r.deletedAt), deletedByName: r.deletedBy?.name ?? null }));
    }
    case 'staff': {
      const rows = await prisma.user.findMany({
        ...base,
        where:  { ...DELETED, role: { notIn: [...PORTAL_ROLES] } },
        select: { id: true, name: true, email: true, role: true, deletedAt: true, deletedBy: who },
      });
      return rows.map((r) => ({ id: r.id, name: r.name, detail: `${r.email} · ${r.role}`, deletedAt: iso(r.deletedAt), deletedByName: r.deletedBy?.name ?? null }));
    }
    case 'contract': {
      const rows = await prisma.contract.findMany({ ...base, select: { id: true, totalMonthlyValue: true, client: { select: { clientName: true } }, deletedAt: true, deletedBy: who } });
      return rows.map((r) => ({ id: r.id, name: contractLabel(r), detail: `UGX ${r.totalMonthlyValue.toLocaleString()}/month`, deletedAt: iso(r.deletedAt), deletedByName: r.deletedBy?.name ?? null }));
    }
    case 'site': {
      const rows = await prisma.site.findMany({ ...base, select: { id: true, siteName: true, client: { select: { clientName: true } }, deletedAt: true, deletedBy: who } });
      return rows.map((r) => ({ id: r.id, name: r.siteName, detail: r.client.clientName, deletedAt: iso(r.deletedAt), deletedByName: r.deletedBy?.name ?? null }));
    }
  }
}

// ── Invoices: void ───────────────────────────────────────────────────────────

async function voidInvoice(id: string, reason: string, actorId: string) {
  const invoice = await prisma.invoice.findUnique({
    where:  { id },
    select: {
      id: true, invoiceNumber: true, status: true, paidAmount: true,
      outstandingBalance: true, totalAmount: true, issuedAt: true,
    },
  });
  if (!invoice) throw new NotFoundError('Invoice not found');
  if (invoice.status === 'VOID') throw new AppError(`${invoice.invoiceNumber} is already void.`, 400);
  if (invoice.issuedAt) {
    refuse(`${invoice.invoiceNumber} has been issued by the MD and can no longer be voided.`);
  }

  // A mobile-money payment in flight may still land; settled history stays.
  // Settled payments (manual or SUCCESS momo) are preserved on the voided
  // invoice and in the audit log ? only the unpaid remainder is written off.
  const momoInflight = await prisma.invoicePayment.count({ where: { invoiceId: id, status: 'PENDING' } });
  if (momoInflight > 0) {
    refuse(`${invoice.invoiceNumber} has a mobile-money payment in flight. Wait for it to settle first.`);
  }
  const carried = await prisma.invoiceCarryForward.count({ where: { OR: [{ fromInvoiceId: id }, { toInvoiceId: id }] } });
  if (carried) {
    refuse(`${invoice.invoiceNumber} carries a balance to or from another invoice. Void that one first, or leave both.`);
  }

  await prisma.invoice.update({
    where: { id },
    data:  {
      status:             'VOID',
      voidedAt:           new Date(),
      voidedById:         actorId,
      voidReason:         reason.trim(),
      // Nothing is owed on a void invoice; the total stays as it was issued.
      outstandingBalance: 0,
    },
  });
  await audit(actorId, 'INVOICE_VOIDED', 'invoice', id, {
    invoiceNumber: invoice.invoiceNumber,
    reason: reason.trim(),
    totalAsIssued: invoice.totalAmount,
    paidPreserved: invoice.paidAmount,
    outstandingWrittenOff: invoice.outstandingBalance,
  });
  return { id, name: invoice.invoiceNumber };
}

export const softDeleteService = {
  deleteClient,   restoreClient,
  deleteGuard,    restoreGuard,    purgeGuard,
  deleteStaff,    restoreStaff,
  deleteContract, restoreContract,
  deleteSite,     restoreSite,
  listDeleted,
  voidInvoice,
};
