import prisma from '../db/prisma';
import { guardService } from './guardService';
import { OUTSTANDING_STATUSES } from './invoiceService';
import { ROLES, DEPLOYABLE_STATUSES, getJobTitleLabel, formatUgx, roundMoney as round2 } from '@security360/shared';
import { marketingService } from './marketingService';
import type { DashboardData } from '@security360/shared';

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
      case ROLES.CONTROL_ROOM:
        return this.getControlRoomStats();
      case ROLES.HR:
        return this.getHRStats();
      case ROLES.MARKETING:
      case ROLES.MARKETING_HEAD:
      case ROLES.SALES:
        // getMarketingStats scopes by role: a head sees the whole pipeline, a
        // sales officer only their own leads.
        return this.getMarketingStats(userId, role);
      case ROLES.CLIENT:
        return this.getClientStats(clientId);
      default:
        // TRAINER lands here alongside anything added later — the HR view is
        // the safest general-purpose set.
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
      pendingServiceRequests,
      activeStaff,
      failedJobs,
    ] = await Promise.all([
      prisma.guard.count(),
      prisma.guard.count({ where: { employmentStatus: 'ACTIVE' } }),
      prisma.guard.count({ where: { employmentStatus: 'ON_LEAVE' } }),
      prisma.client.count({ where: { contractStatus: 'ACTIVE' } }),
      prisma.clientComplaint.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS', 'UNDER_INVESTIGATION'] } } }),
      prisma.invoice.count({ where: { status: { in: [...OUTSTANDING_STATUSES] } } }),
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
        where:   { status: { in: [...OUTSTANDING_STATUSES] } },
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
      prisma.serviceRequest.count({ where: { status: 'PENDING' } }),
      // Internal accounts only — guards and client portal logins are counted
      // elsewhere and would drown the staff head-count.
      prisma.user.count({ where: { status: 'ACTIVE', role: { notIn: ['GUARD', 'CLIENT'] } } }),
      // Surfaced on the Director dashboard: a job that stopped working is
      // invisible otherwise — nothing fails loudly, invoices simply stop.
      prisma.scheduledJob.count({ where: { lastRunStatus: 'FAILED' } }),
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
        pendingServiceRequests,
        activeStaff,
        monthlyRevenue: round2(revenueAgg._sum.totalAmount ?? 0),
        failedJobs,
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
          secondary: formatUgx(i.totalAmount),
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
      pendingServiceRequests,
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
      prisma.serviceRequest.count({ where: { status: 'PENDING' } }),
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
        pendingServiceRequests,
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

  // ── Control Room — complaints desk plus a read-only view of operations ───────

  private async getControlRoomStats(): Promise<DashboardData> {
    const today = startOfDay();

    const [
      openComplaints,
      underInvestigation,
      resolvedToday,
      unassignedCount,
      deployedToday,
      activeGuards,
      activeClients,
      pendingRequisitions,
      activeComplaints,
      unassignedComplaints,
      shiftReportsToday,
      shiftReportsAwaitingAck,
    ] = await Promise.all([
      prisma.clientComplaint.count({ where: { status: { in: ['OPEN', 'UNDER_INVESTIGATION'] } } }),
      prisma.clientComplaint.count({ where: { status: 'UNDER_INVESTIGATION' } }),
      prisma.clientComplaint.count({ where: { status: 'RESOLVED', resolvedAt: { gte: today } } }),
      prisma.clientComplaint.count({ where: { status: 'OPEN', assignedToId: null } }),
      prisma.deployment.count({ where: { date: today } }),
      prisma.guard.count({ where: { employmentStatus: 'ACTIVE' } }),
      prisma.client.count({ where: { contractStatus: 'ACTIVE' } }),
      prisma.requisition.count({ where: { status: { in: ['PENDING', 'SUBMITTED'] } } }),
      prisma.clientComplaint.findMany({
        where:   { status: { in: ['OPEN', 'UNDER_INVESTIGATION'] } },
        include: {
          client:         { select: { clientName: true } },
          assignedToUser: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take:    8,
      }),
      prisma.clientComplaint.findMany({
        where:   { status: 'OPEN', assignedToId: null },
        include: { client: { select: { clientName: true } } },
        orderBy: { createdAt: 'desc' },
        take:    5,
      }),
      // Handovers written for today, whichever controller wrote them — the
      // Control Room is one desk, and the incoming shift needs to see whether
      // the outgoing one has filed yet.
      prisma.shiftHandoverReport.count({ where: { date: { gte: today } } }),
      prisma.shiftHandoverReport.count({ where: { status: 'SUBMITTED' } }),
    ]);

    return {
      role:  'CONTROL_ROOM',
      stats: {
        openComplaints,
        underInvestigation,
        resolvedToday,
        unassignedCount,
        deployedToday,
        activeGuards,
        activeClients,
        pendingRequisitions,
        shiftReportsToday,
        shiftReportsAwaitingAck,
      },
      feeds: {
        activeComplaints: activeComplaints.map(c => ({
          id:        c.id,
          primary:   c.subject,
          secondary: `${c.client.clientName} · ${
            c.assignedToUser ? `Assigned to ${c.assignedToUser.name}` : 'Unassigned'
          }`,
          badge:     c.status.replace(/_/g, ' '),
        })),
        unassignedComplaints: unassignedComplaints.map(c => ({
          id:        c.id,
          primary:   c.subject,
          secondary: c.client.clientName,
          badge:     c.severity,
        })),
      },
    };
  }

  // ── HR — headcount, leave, discipline and letters ────────────────────────────

  private async getHRStats(): Promise<DashboardData> {
    const today      = startOfDay();
    const monthStart = startOfMonth();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [
      activeGuards,
      guardsOnLeaveToday,
      staffOnLeaveToday,
      pendingLeave,
      recentDisciplinary,
      lettersThisMonth,
      byRank,
      pendingLeaveFeed,
      idStats,
    ] = await Promise.all([
      prisma.guard.count({ where: { employmentStatus: 'ACTIVE' } }),
      // Approved leave that covers today, so the figure answers "who is off
      // right now" rather than "how much leave was booked".
      prisma.leaveRequest.count({
        where: {
          status: 'APPROVED', startDate: { lte: today }, endDate: { gte: today },
          guardId: { not: null },
        },
      }),
      // Office staff leave, counted separately: "12 people off" reads very
      // differently depending on whether they were guards on a site.
      prisma.leaveRequest.count({
        where: {
          status: 'APPROVED', startDate: { lte: today }, endDate: { gte: today },
          userId: { not: null },
        },
      }),
      prisma.leaveRequest.count({ where: { status: 'PENDING' } }),
      // Terminations and reinstatements are outcomes, not open matters, so they
      // are left out of a count meant to show what still needs handling.
      prisma.disciplinaryRecord.count({
        where: {
          type:      { notIn: ['TERMINATION', 'REINSTATEMENT'] },
          createdAt: { gte: thirtyDaysAgo },
        },
      }),
      // generatedAt, not createdAt — this model does not have one.
      prisma.generatedLetter.count({ where: { generatedAt: { gte: monthStart } } }),
      prisma.guard.groupBy({
        by:     ['rank'],
        where:  { employmentStatus: 'ACTIVE' },
        _count: { id: true },
      }),
      prisma.leaveRequest.findMany({
        where:   { status: 'PENDING' },
        include: {
          guard: { select: { firstName: true, lastName: true, systemId: true } },
          user:  { select: { name: true, jobTitle: true, role: true } },
        },
        orderBy: { startDate: 'asc' },
        take:    10,
      }),
      // Reuses the guard service so the dashboard and the guard list cannot
      // disagree about how many guards are documented.
      guardService.getIdStats(),
    ]);

    const fmtDate = (d: Date) =>
      d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

    return {
      role:  'HR',
      stats: {
        activeGuards,
        // Kept as the combined figure the existing card reads, with the split
        // alongside it so a caller can show either.
        onLeaveToday: guardsOnLeaveToday + staffOnLeaveToday,
        guardsOnLeaveToday,
        staffOnLeaveToday,
        pendingLeave,
        recentDisciplinary,
        lettersThisMonth,
        guardsOwnId:      idStats.ownId,
        guardsRelativeId: idStats.relativeId,
        guardsOtherDoc:   idStats.otherDoc,
        guardsNoId:       idStats.noId,
      },
      feeds: {
        pendingLeave: pendingLeaveFeed.map((l) => {
          // Either a guard or a staff member; a CHECK constraint guarantees one.
          const who = l.guard
            ? {
                name: `${l.guard.firstName} ${l.guard.lastName}`,
                ref:  l.guard.systemId ?? '—',
              }
            : {
                name: l.user?.name ?? 'Unknown',
                ref:  l.user?.jobTitle
                  ? getJobTitleLabel(l.user.jobTitle)
                  : (l.user?.role.replace(/_/g, ' ') ?? 'Staff'),
              };
          return {
            id:        l.id,
            primary:   who.name,
            secondary: `${who.ref} · ${fmtDate(l.startDate)} to ${fmtDate(l.endDate)} · ${l.daysRequested} day${l.daysRequested === 1 ? '' : 's'}`,
            badge:     l.type,
          };
        }),
        guardsByRank: byRank
          .sort((a, b) => b._count.id - a._count.id)
          .map((r) => ({
            id:        r.rank,
            primary:   r.rank.replace(/_/g, ' '),
            secondary: `${r._count.id} active guard${r._count.id === 1 ? '' : 's'}`,
            badge:     String(r._count.id),
          })),
      },
    };
  }

  // ── Marketing — pipeline, bids and target progress ───────────────────────────

  private async getMarketingStats(userId: string, role: string): Promise<DashboardData> {
    // The marketing module owns these figures; reuse them rather than
    // recomputing the pipeline in a second place that could disagree. The role
    // goes with the id so an officer's dashboard counts only their own leads.
    const m = await marketingService.getDashboard(userId, role);

    return {
      // The caller's actual role, not the module name. The frontend picks its
      // dashboard spec off this, and a hardcoded 'MARKETING' would give a sales
      // officer the head's tiles — links to bids and targets they cannot open.
      role:  role as DashboardData['role'],
      stats: {
        totalProspects:   m.stats.totalProspects,
        inPipeline:       m.stats.inPipeline,
        won:              m.stats.won,
        lost:             m.stats.lost,
        activeBids:       m.stats.activeBids,
        upcomingExpiries: m.stats.upcomingExpiries,
        conversionRate:   m.stats.conversionRate,
        targetProgress:   m.stats.targetProgress ?? 0,
      },
      feeds: {
        recentActivity: m.recentActivity.map(a => ({
          id:        a.id,
          primary:   a.companyName,
          secondary: `${a.fromStatus ? `${a.fromStatus.replace(/_/g, ' ')} → ` : ''}` +
                     `${a.toStatus.replace(/_/g, ' ')} · ${a.changedBy.name}`,
          badge:     new Date(a.createdAt).toLocaleDateString('en-GB'),
        })),
        pipelineStages: m.prospectsByStatus.map(s => ({
          id:        s.status,
          primary:   s.label,
          secondary: `${s.count} prospect${s.count === 1 ? '' : 's'}`,
          badge:     String(s.count),
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
      prisma.invoice.count({ where: { status: { in: [...OUTSTANDING_STATUSES] } } }),
      // What is owed, not what was billed: summing totalAmount left a part-paid
      // invoice contributing its full value to outstanding AR.
      prisma.invoice.aggregate({ _sum: { outstandingBalance: true }, where: { status: { in: [...OUTSTANDING_STATUSES] } } }),
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
        totalOutstanding: round2(outstandingAgg._sum.outstandingBalance ?? 0),
        paidThisMonth:    round2(paidAgg._sum.totalAmount ?? 0),
        overdueInvoices:  overdueCount,
        pendingRequisitions,
        payrollRunsPending,
      },
      feeds: {
        overdueInvoices: overdueInvoices.map(i => ({
          id:        i.id,
          primary:   i.client.clientName,
          secondary: `${formatUgx(i.totalAmount)} · due ${new Date(i.dueDate).toLocaleDateString('en-GB')}`,
          badge:     i.status,
        })),
        recentInvoices: recentInvoices.map(i => ({
          id:        i.id,
          primary:   i.client.clientName,
          secondary: formatUgx(i.totalAmount),
          badge:     i.status,
        })),
      },
    };
  }

  // ── Administrator — system health ────────────────────────────────────────────

  private async getAdminStats(): Promise<DashboardData> {
    const [totalUsers, activeStaff, openSystemErrors, totalGuards, totalClients, recentErrors, recentUsers] =
      await Promise.all([
        prisma.user.count(),
        // Internal accounts only — guards and client portal logins are counted
        // elsewhere and would drown the staff head-count.
        prisma.user.count({ where: { status: 'ACTIVE', role: { notIn: ['GUARD', 'CLIENT'] } } }),
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
      stats: { totalUsers, activeStaff, openSystemErrors, totalGuards, totalClients },
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
        prisma.invoice.count({ where: { clientId, status: { in: [...OUTSTANDING_STATUSES] } } }),
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
          secondary: formatUgx(i.totalAmount),
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
