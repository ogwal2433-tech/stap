import prisma from '../db/prisma';
import { ROLES, DEPLOYABLE_STATUSES } from '@stap/shared';
import type { DashboardData } from '@stap/shared';

// ── Date helpers ───────────────────────────────────────────────────────────────

function startOfDay(d = new Date()): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function startOfMonth(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

const guardName = (g: { firstName: string; lastName: string }) => `${g.firstName} ${g.lastName}`;

/**
 * Role-scoped dashboard data.
 *
 * Each role gets only the figures it can act on — an Accounts Officer has no
 * deployment counts, a Field Supervisor no revenue. The shape is
 * { role, stats, feeds } for every role so the frontend can render generically.
 *
 * Field names here are matched against the actual schema, which differs from
 * the obvious guesses in several places: invoices are PENDING/OVERDUE/PAID (not
 * DRAFT/SENT), attendance lives on AttendanceRecord rather than Deployment,
 * clients are flagged by contractStatus rather than an isActive boolean, and
 * there is no separate salary disbursement model — PayrollRun covers it.
 */
class DashboardService {
  async getStats(userId: string, role: string, clientId: string | null): Promise<DashboardData> {
    switch (role) {
      case ROLES.DIRECTOR:
      case ROLES.ASSISTANT_MANAGER:
        return this.getDirectorStats();
      case ROLES.OPERATIONS_SUPERVISOR:
        return this.getOpsStats();
      case ROLES.FIELD_SUPERVISOR:
        return this.getFieldStats(userId);
      case ROLES.ACCOUNTS_OFFICER:
        return this.getAccountsStats();
      case ROLES.ADMINISTRATOR:
        return this.getAdminStats();
      case ROLES.CLIENT:
        return this.getClientStats(clientId);
      default:
        // TRAINER and MARKETING land here alongside anything added later —
        // the HR view is the safest general-purpose set.
        return this.getHRStats();
    }
  }

  // ── Director / Assistant Manager — full overview ─────────────────────────────

  private async getDirectorStats(): Promise<DashboardData> {
    const today = startOfDay();
    const monthStart = startOfMonth();

    const [
      totalGuards,
      activeGuards,
      guardsOnLeave,
      activeClients,
      openComplaints,
      pendingInvoices,
      revenueAgg,
      recentComplaints,
      recentInvoices,
      guardsNeedingAttention,
    ] = await Promise.all([
      prisma.guard.count(),
      prisma.guard.count({ where: { employmentStatus: 'ACTIVE' } }),
      prisma.guard.count({ where: { employmentStatus: 'ON_LEAVE' } }),
      prisma.client.count({ where: { contractStatus: 'ACTIVE' } }),
      prisma.clientComplaint.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS', 'UNDER_INVESTIGATION'] } } }),
      prisma.invoice.count({ where: { status: { in: ['PENDING', 'OVERDUE'] } } }),
      prisma.invoice.aggregate({
        _sum:  { totalAmount: true },
        where: { status: 'PAID', paidAt: { gte: monthStart } },
      }),
      prisma.clientComplaint.findMany({
        where:   { status: { in: ['OPEN', 'IN_PROGRESS', 'UNDER_INVESTIGATION'] } },
        include: { client: { select: { clientName: true } } },
        orderBy: { createdAt: 'desc' },
        take:    5,
      }),
      prisma.invoice.findMany({
        where:   { status: { in: ['PENDING', 'OVERDUE'] } },
        include: { client: { select: { clientName: true } } },
        orderBy: { createdAt: 'desc' },
        take:    5,
      }),
      prisma.guard.findMany({
        where:   { employmentStatus: { in: ['ON_LEAVE', 'SUSPENDED'] } },
        select:  { id: true, firstName: true, lastName: true, systemId: true, employmentStatus: true },
        orderBy: { updatedAt: 'desc' },
        take:    5,
      }),
    ]);

    void today;

    return {
      role:  'DIRECTOR',
      stats: {
        totalGuards,
        activeGuards,
        guardsOnLeave,
        activeClients,
        openComplaints,
        pendingInvoices,
        monthlyRevenue: revenueAgg._sum.totalAmount ?? 0,
      },
      feeds: {
        recentComplaints: recentComplaints.map(c => ({
          id:        c.id,
          primary:   c.subject,
          secondary: c.client.clientName,
          badge:     c.status,
        })),
        recentInvoices: recentInvoices.map(i => ({
          id:        i.id,
          primary:   i.client.clientName,
          secondary: `UGX ${i.totalAmount.toLocaleString()}`,
          badge:     i.status,
        })),
        guardsNeedingAttention: guardsNeedingAttention.map(g => ({
          id:        g.id,
          primary:   guardName(g),
          secondary: g.systemId ?? '—',
          badge:     g.employmentStatus,
        })),
      },
    };
  }

  // ── Operations Supervisor — deployment focus ─────────────────────────────────

  private async getOpsStats(): Promise<DashboardData> {
    const today = startOfDay();

    const [
      activeGuards,
      deployedToday,
      absentToday,
      sitesCovered,
      openComplaints,
      recentTransfers,
      deployedIds,
    ] = await Promise.all([
      prisma.guard.count({ where: { employmentStatus: 'ACTIVE' } }),
      prisma.deployment.count({ where: { date: today } }),
      prisma.attendanceRecord.count({ where: { date: today, status: { in: ['ABSENT', 'AWOL'] } } }),
      prisma.deployment.findMany({ where: { date: today }, select: { siteId: true }, distinct: ['siteId'] }),
      prisma.clientComplaint.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS', 'UNDER_INVESTIGATION'] } } }),
      prisma.guardTransfer.findMany({
        orderBy: { transferDate: 'desc' },
        take:    5,
        include: {
          guard:  { select: { firstName: true, lastName: true } },
          toSite: { select: { siteName: true } },
        },
      }),
      prisma.deployment.findMany({ where: { date: today }, select: { guardId: true } }),
    ]);

    // "Undeployed" means deployable but with no deployment row for today.
    const deployedGuardIds = deployedIds.map(d => d.guardId);
    const undeployedGuards = await prisma.guard.findMany({
      where:  {
        employmentStatus: { in: DEPLOYABLE_STATUSES },
        id:               { notIn: deployedGuardIds },
      },
      select: { id: true, firstName: true, lastName: true, systemId: true, rank: true },
      take:   10,
    });
    const undeployedCount = await prisma.guard.count({
      where: {
        employmentStatus: { in: DEPLOYABLE_STATUSES },
        id:               { notIn: deployedGuardIds },
      },
    });

    return {
      role:  'OPERATIONS_SUPERVISOR',
      stats: {
        activeGuards,
        deployedToday,
        absentToday,
        sitesCoveredToday: sitesCovered.length,
        openComplaints,
        undeployedGuards:  undeployedCount,
      },
      feeds: {
        recentTransfers: recentTransfers.map(t => ({
          id:        t.id,
          primary:   guardName(t.guard),
          secondary: `→ ${t.toSite.siteName}`,
          badge:     new Date(t.transferDate).toLocaleDateString('en-GB'),
        })),
        undeployedGuards: undeployedGuards.map(g => ({
          id:        g.id,
          primary:   guardName(g),
          secondary: g.systemId ?? '—',
          badge:     g.rank ?? undefined,
        })),
      },
    };
  }

  // ── Field Supervisor — attendance in their own zones ─────────────────────────

  private async getFieldStats(userId: string): Promise<DashboardData> {
    const today = startOfDay();

    // Scope to the zones this supervisor covers (primary or alternate). With no
    // zone assigned they see nothing rather than everyone else's sites.
    const zones = await prisma.zone.findMany({
      where:  { OR: [{ supervisorId: userId }, { alternateId: userId }] },
      select: { id: true, name: true },
    });
    const zoneIds = zones.map(z => z.id);

    const siteFilter = zoneIds.length ? { zoneId: { in: zoneIds } } : { id: '__none__' };

    const [sitesInZones, deployedToday, absentToday, todaysAttendance] = await Promise.all([
      prisma.site.count({ where: siteFilter }),
      prisma.deployment.count({ where: { date: today, site: siteFilter } }),
      prisma.attendanceRecord.count({
        where: { date: today, status: { in: ['ABSENT', 'AWOL'] }, site: siteFilter },
      }),
      prisma.attendanceRecord.findMany({
        where:   { date: today, site: siteFilter },
        include: {
          guard: { select: { firstName: true, lastName: true, systemId: true } },
          site:  { select: { siteName: true } },
        },
        orderBy: { status: 'asc' },
        take:    10,
      }),
    ]);

    const guardsInZones = await prisma.deployment.findMany({
      where:    { date: today, site: siteFilter },
      select:   { guardId: true },
      distinct: ['guardId'],
    });

    const marked = deployedToday > 0 ? Math.round(((deployedToday - absentToday) / deployedToday) * 100) : 0;

    return {
      role:  'FIELD_SUPERVISOR',
      stats: {
        zonesCovered:   zones.length,
        sitesInZones,
        guardsOnDuty:   guardsInZones.length,
        deployedToday,
        absentToday,
        attendanceRate: Math.max(0, marked),
      },
      feeds: {
        todaysAttendance: todaysAttendance.map(a => ({
          id:        a.id,
          primary:   guardName(a.guard),
          secondary: a.site.siteName,
          badge:     a.status,
        })),
        myZones: zones.map(z => ({ id: z.id, primary: z.name, secondary: 'Zone' })),
      },
    };
  }

  // ── Accounts Officer — billing focus ─────────────────────────────────────────

  private async getAccountsStats(): Promise<DashboardData> {
    const monthStart = startOfMonth();

    const [
      unpaidInvoices,
      outstandingAgg,
      paidAgg,
      overdueCount,
      pendingRequisitions,
      payrollRunsPending,
      overdueInvoices,
      recentInvoices,
    ] = await Promise.all([
      prisma.invoice.count({ where: { status: { in: ['PENDING', 'OVERDUE'] } } }),
      prisma.invoice.aggregate({ _sum: { totalAmount: true }, where: { status: { in: ['PENDING', 'OVERDUE'] } } }),
      prisma.invoice.aggregate({ _sum: { totalAmount: true }, where: { status: 'PAID', paidAt: { gte: monthStart } } }),
      prisma.invoice.count({ where: { status: 'OVERDUE' } }),
      prisma.requisition.count({ where: { status: 'SUBMITTED' } }),
      prisma.payrollRun.count({ where: { status: { in: ['DRAFT', 'APPROVED', 'HR_APPROVED'] } } }),
      prisma.invoice.findMany({
        where:   { status: 'OVERDUE' },
        include: { client: { select: { clientName: true } } },
        orderBy: { dueDate: 'asc' },
        take:    5,
      }),
      prisma.invoice.findMany({
        include: { client: { select: { clientName: true } } },
        orderBy: { createdAt: 'desc' },
        take:    5,
      }),
    ]);

    return {
      role:  'ACCOUNTS_OFFICER',
      stats: {
        unpaidInvoices,
        totalOutstanding: outstandingAgg._sum.totalAmount ?? 0,
        paidThisMonth:    paidAgg._sum.totalAmount ?? 0,
        overdueInvoices:  overdueCount,
        pendingRequisitions,
        payrollRunsPending,
      },
      feeds: {
        overdueInvoices: overdueInvoices.map(i => ({
          id:        i.id,
          primary:   i.client.clientName,
          secondary: `UGX ${i.totalAmount.toLocaleString()} · due ${new Date(i.dueDate).toLocaleDateString('en-GB')}`,
          badge:     i.status,
        })),
        recentInvoices: recentInvoices.map(i => ({
          id:        i.id,
          primary:   i.client.clientName,
          secondary: `UGX ${i.totalAmount.toLocaleString()}`,
          badge:     i.status,
        })),
      },
    };
  }

  // ── Administrator — system health ────────────────────────────────────────────

  private async getAdminStats(): Promise<DashboardData> {
    const [totalUsers, openSystemErrors, totalGuards, totalClients, recentErrors, recentUsers] =
      await Promise.all([
        prisma.user.count(),
        prisma.systemError.count({ where: { status: { in: ['OPEN', 'INVESTIGATING'] } } }),
        prisma.guard.count(),
        prisma.client.count({ where: { contractStatus: 'ACTIVE' } }),
        prisma.systemError.findMany({
          where:   { status: { in: ['OPEN', 'INVESTIGATING'] } },
          orderBy: { lastSeenAt: 'desc' },
          take:    5,
          select:  { id: true, errorCode: true, message: true, severity: true, occurrenceCount: true },
        }),
        prisma.user.findMany({
          orderBy: { createdAt: 'desc' },
          take:    5,
          select:  { id: true, name: true, role: true, createdAt: true },
        }),
      ]);

    return {
      role:  'ADMINISTRATOR',
      stats: { totalUsers, openSystemErrors, totalGuards, totalClients },
      feeds: {
        recentErrors: recentErrors.map(e => ({
          id:        e.id,
          primary:   e.errorCode ?? e.message.slice(0, 60),
          secondary: `${e.occurrenceCount} occurrence${e.occurrenceCount === 1 ? '' : 's'}`,
          badge:     e.severity,
        })),
        recentUsers: recentUsers.map(u => ({
          id:        u.id,
          primary:   u.name,
          secondary: new Date(u.createdAt).toLocaleDateString('en-GB'),
          badge:     u.role,
        })),
      },
    };
  }

  // ── HR / Trainer / anything else internal ────────────────────────────────────

  private async getHRStats(): Promise<DashboardData> {
    const monthStart = startOfMonth();

    const [
      totalGuards,
      newGuardsThisMonth,
      pendingLetters,
      guardsOnLeave,
      openDisciplinary,
      recentGuards,
      pendingLettersList,
    ] = await Promise.all([
      prisma.guard.count({ where: { employmentStatus: { in: ['ACTIVE', 'ON_LEAVE'] } } }),
      prisma.guard.count({ where: { createdAt: { gte: monthStart } } }),
      prisma.generatedLetter.count({ where: { approvalStatus: 'PENDING' } }),
      prisma.guard.count({ where: { employmentStatus: 'ON_LEAVE' } }),
      prisma.guard.count({ where: { employmentStatus: 'SUSPENDED' } }),
      prisma.guard.findMany({
        where:   { createdAt: { gte: monthStart } },
        select:  { id: true, firstName: true, lastName: true, systemId: true, rank: true },
        orderBy: { createdAt: 'desc' },
        take:    5,
      }),
      prisma.generatedLetter.findMany({
        where:   { approvalStatus: 'PENDING' },
        orderBy: { generatedAt: 'desc' },
        take:    5,
        select:  { id: true, letterType: true, subjectName: true, approvalStatus: true },
      }),
    ]);

    return {
      role:  'HR',
      stats: { totalGuards, newGuardsThisMonth, pendingLetters, guardsOnLeave, openDisciplinary },
      feeds: {
        recentGuards: recentGuards.map(g => ({
          id:        g.id,
          primary:   guardName(g),
          secondary: g.systemId ?? '—',
          badge:     g.rank ?? undefined,
        })),
        pendingLetters: pendingLettersList.map(l => ({
          id:        l.id,
          primary:   l.subjectName ?? 'Letter',
          secondary: l.letterType.replace(/_/g, ' '),
          badge:     l.approvalStatus,
        })),
      },
    };
  }

  // ── Client portal ────────────────────────────────────────────────────────────

  private async getClientStats(clientId: string | null): Promise<DashboardData> {
    // A CLIENT user with no company linked has nothing to show — return zeros
    // rather than throwing, so the portal still renders.
    if (!clientId) {
      return {
        role:  'CLIENT',
        stats: { activeSites: 0, activeContracts: 0, unpaidInvoices: 0, openComplaints: 0, openServiceRequests: 0 },
        feeds: { recentInvoices: [], recentComplaints: [] },
      };
    }

    const [activeSites, activeContracts, unpaidInvoices, openComplaints, openServiceRequests, recentInvoices, recentComplaints] =
      await Promise.all([
        prisma.site.count({ where: { clientId } }),
        prisma.contract.count({ where: { clientId, status: { in: ['ACTIVE', 'EXPIRING'] } } }),
        prisma.invoice.count({ where: { clientId, status: { in: ['PENDING', 'OVERDUE'] } } }),
        prisma.clientComplaint.count({ where: { clientId, status: { in: ['OPEN', 'IN_PROGRESS', 'UNDER_INVESTIGATION'] } } }),
        prisma.serviceRequest.count({ where: { clientId, status: { in: ['PENDING', 'IN_PROGRESS'] } } }),
        prisma.invoice.findMany({ where: { clientId }, orderBy: { createdAt: 'desc' }, take: 5 }),
        prisma.clientComplaint.findMany({ where: { clientId }, orderBy: { createdAt: 'desc' }, take: 5 }),
      ]);

    return {
      role:  'CLIENT',
      stats: { activeSites, activeContracts, unpaidInvoices, openComplaints, openServiceRequests },
      feeds: {
        recentInvoices: recentInvoices.map(i => ({
          id:        i.id,
          primary:   i.invoiceNumber,
          secondary: `UGX ${i.totalAmount.toLocaleString()}`,
          badge:     i.status,
        })),
        recentComplaints: recentComplaints.map(c => ({
          id:        c.id,
          primary:   c.subject,
          secondary: new Date(c.createdAt).toLocaleDateString('en-GB'),
          badge:     c.status,
        })),
      },
    };
  }
}

export const dashboardService = new DashboardService();
