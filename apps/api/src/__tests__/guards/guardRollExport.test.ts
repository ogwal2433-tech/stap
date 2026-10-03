import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ROLES } from '@security360/shared';
import type { GuardExportQuery } from '@security360/shared';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('../../db/prisma', () => ({
  default: {
    guard:      { findMany: vi.fn(), count: vi.fn() },
    // list() also looks up today's posting for the rows on the page.
    deployment: { findMany: vi.fn() },
  },
}));

vi.mock('../../jobs/QueueService', () => ({
  QueueService: { logAudit: vi.fn().mockResolvedValue(undefined) },
}));

// Puppeteer must never launch in tests — keep the HTML and the render options it
// was handed so the printed page and the letterhead settings can be asserted.
const mockRenderToPdf = vi.fn().mockResolvedValue(Buffer.from('%PDF-1.4 stub'));
vi.mock('../../lib/pdfBase', () => ({
  renderToPdf: (html: string, opts: unknown) => mockRenderToPdf(html, opts),
}));

import prisma from '../../db/prisma';
import { guardService } from '../../services/guardService';
import { guardExportService } from '../../services/guardExportService';

const mp = prisma as unknown as {
  guard:      { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
  deployment: { findMany: ReturnType<typeof vi.fn> };
};

/** A guard row shaped like Prisma returns it, before listForExport maps it. */
const guardRow = (over = {}) => ({
  id:             'g1',
  systemId:         'SSLG0001',
  firstName:        'David',
  lastName:         'Ochieng',
  otherNames:       null,
  gender:           'MALE',
  dateOfBirth:      new Date('1990-03-15'),
  nationalId:       'CM90210',
  idType:           'OWN_ID',
  phone:            '+256772345678',
  rank:             'GUARD',
  employmentStatus: 'ACTIVE',
  contractType:     'PERMANENT',
  probationStatus:  'CONFIRMED',
  salaryRate:       480000,
  nextOfKinName:    'Mary',
  nextOfKinPhone:   '+256700000000',
  district:         'Wakiso',
  contractStart:    new Date('2024-01-01'),
  contractEnd:      null,
  createdAt:        new Date('2024-01-01'),
  deploymentHistory: [{ site: { siteName: 'Nakoju Store', client: { clientName: 'UCDA' }, zone: { name: 'Central' } } }],
  ...over,
});

/** The `where` the last findMany call was made with. */
const lastWhere = () => (mp.guard.findMany.mock.calls.at(-1)![0] as { where: unknown }).where;

const LIST_DEFAULTS = { page: 1, limit: 20, sortBy: 'createdAt', sortOrder: 'desc' } as const;

beforeEach(() => {
  vi.clearAllMocks();
  mp.guard.findMany.mockResolvedValue([guardRow()]);
  mp.guard.count.mockResolvedValue(1);
  mp.deployment.findMany.mockResolvedValue([]);
});

/**
 * The guards exports and the guards table must answer one question.
 *
 * The bug this suite exists for: the Excel button used to fetch the entire roll
 * whatever the table was filtered to, so a filtered screen produced an
 * unfiltered file. The fix moves the filter translation into a single
 * guardService.filterWhere() that both the list and the export call, so pinning
 * that shared `where` is pinning the user-visible behaviour.
 */
describe('guardService — the export asks the same question as the table', () => {
  it('hands listForExport the same where the list was given', async () => {
    // onLeave is left out and tested on its own below: it stamps the current
    // instant into the clause, so two calls can never compare equal.
    const filters: GuardExportQuery = {
      status: 'ACTIVE',
      rank: 'GUARD',
      contractType: 'TEMPORARY',
      probationStatus: 'ON_PROBATION',
      idType: 'OWN_ID',
      isIncompleteNID: true,
      search: 'ohi',
    };

    await guardService.list({ ...LIST_DEFAULTS, ...filters }, ROLES.DIRECTOR);
    const listWhere = lastWhere();

    await guardService.listForExport(filters);
    expect(lastWhere()).toEqual(listWhere);
  });

  it('hands the export the same on-leave rule as the table', async () => {
    await guardService.list({ ...LIST_DEFAULTS, onLeave: true }, ROLES.DIRECTOR);
    const fromList = lastWhere() as { leaveRequests: { some: Record<string, unknown> } };

    await guardService.listForExport({ onLeave: true });
    const fromExport = lastWhere() as { leaveRequests: { some: Record<string, unknown> } };

    expect(Object.keys(fromExport.leaveRequests)).toEqual(Object.keys(fromList.leaveRequests));
    expect(Object.keys(fromExport.leaveRequests.some).sort())
      .toEqual(Object.keys(fromList.leaveRequests.some).sort());
    expect(fromExport.leaveRequests.some.status).toBe('APPROVED');
  });

  it('narrows the export by status and rank', async () => {
    await guardService.listForExport({ status: 'TERMINATED', rank: 'SUPERVISOR' });
    expect(lastWhere()).toEqual({ employmentStatus: 'TERMINATED', rank: 'SUPERVISOR' });
  });

  it('takes no where clause at all when nothing is filtered', async () => {
    await guardService.listForExport({});
    expect(lastWhere()).toEqual({});
  });

  it('reads search as name, ID, phone or system id', async () => {
    await guardService.listForExport({ search: 'CM902' });
    const or = (lastWhere() as { OR: { nationalId: { contains: string } }[] }).OR;
    expect(or.map((c) => Object.keys(c)[0])).toEqual(
      ['firstName', 'lastName', 'nationalId', 'phone', 'systemId'],
    );
    expect(or[2].nationalId.contains).toBe('CM902');
  });

  it('keeps idType NONE meaning "no document on file"', async () => {
    await guardService.listForExport({ idType: 'NONE' });
    expect(lastWhere()).toEqual({ idType: null });
  });

  it('still resolves the on-leave filter through approved leave', async () => {
    await guardService.listForExport({ onLeave: true });
    const where = lastWhere() as { leaveRequests: { some: Record<string, unknown> } };
    expect(where.leaveRequests.some.status).toBe('APPROVED');
  });

  it('refuses to page an export', async () => {
    await guardService.listForExport({ status: 'ACTIVE' });
    const args = mp.guard.findMany.mock.calls.at(-1)![0] as Record<string, unknown>;
    expect(args).not.toHaveProperty('skip');
    expect(args).not.toHaveProperty('take');
    // The list does page, which is the whole difference being protected here.
    await guardService.list(LIST_DEFAULTS, ROLES.DIRECTOR);
    const paged = mp.guard.findMany.mock.calls.at(-1)![0] as Record<string, unknown>;
    expect(paged).toHaveProperty('skip');
    expect(paged).toHaveProperty('take');
  });
});

describe('guardExportService.buildRollPdf', () => {
  const call = (query: GuardExportQuery, viewerRole = ROLES.DIRECTOR) =>
    guardExportService.buildRollPdf(query, { generatedBy: 'Aisha Director', viewerRole });

  it('passes the filters through to the roll it prints', async () => {
    await call({ status: 'ON_LEAVE', search: 'ka' });
    expect(lastWhere()).toEqual({
      employmentStatus: 'ON_LEAVE',
      OR: expect.any(Array),
    });
    expect((lastWhere() as { OR: unknown[] }).OR).toHaveLength(5);
  });

  it('prints salary only for the roles that see it on the table', async () => {
    await call({}, ROLES.DIRECTOR);
    expect(mockRenderToPdf.mock.calls.at(-1)![0]).toContain('Salary (UGX)');

    await call({}, ROLES.OPERATIONS_SUPERVISOR);
    const html = mockRenderToPdf.mock.calls.at(-1)![0];
    expect(html).not.toContain('Salary (UGX)');
    // And the guard's pay must not appear anywhere else on the page either.
    expect(html).not.toContain('480,000');
  });

  it('says on the page which filters the list was taken under', async () => {
    await call({ status: 'ACTIVE', contractType: 'TEMPORARY', isIncompleteNID: true });
    const html = mockRenderToPdf.mock.calls.at(-1)![0];
    expect(html).toContain('Filtered');
    expect(html).toContain('Active');
    expect(html).toContain('NID pending');

    await call({});
    expect(mockRenderToPdf.mock.calls.at(-1)![0]).toContain('All guards');
  });

  it('describes the document type by its label, and NONE by what it means', async () => {
    await call({ idType: 'OWN_ID' });
    expect(mockRenderToPdf.mock.calls.at(-1)![0]).toContain('Own National ID');

    await call({ idType: 'NONE' });
    expect(mockRenderToPdf.mock.calls.at(-1)![0]).toContain('with no document on file');
  });

  it('counts posted and unassigned guards from the open deployment', async () => {
    mp.guard.findMany.mockResolvedValue([
      guardRow(),
      guardRow({ systemId: 'SSLG0002', lastName: 'Nakato', deploymentHistory: [] }),
    ]);
    await call({});
    const html = mockRenderToPdf.mock.calls.at(-1)![0];
    expect(html).toContain('Unassigned');
    // The posted one names its site; the other says so plainly.
    expect(html).toContain('Nakoju Store');
  });

  it('still prints a page when no guard matches, naming the selection', async () => {
    mp.guard.findMany.mockResolvedValue([]);
    await call({ rank: 'CHIEF_SUPERVISOR' });
    const html = mockRenderToPdf.mock.calls.at(-1)![0];
    expect(html).toContain('No guard matches this selection.');
    // Underscores become spaces — the rank reads the way the table shows it.
    expect(html).toContain('CHIEF SUPERVISOR');
  });

  it('escapes the filter text it echoes back', async () => {
    await call({ search: '<script>evil</script>' });
    const html = mockRenderToPdf.mock.calls.at(-1)![0];
    expect(html).not.toContain('<script>evil</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('prints on the tiger letterhead, without the sales watermark', async () => {
    await call({});
    expect(mockRenderToPdf.mock.calls.at(-1)![1]).toEqual({
      logoFile:  'tiger_logo.jpeg',
      watermark: false,
      logoOnly:  true,
    });
  });

  it('names the file after the roll and the day, not the query string', async () => {
    const { filename } = await call({ status: 'ACTIVE' });
    expect(filename).toMatch(/Guards_\d{4}-\d{2}-\d{2}\.pdf$/);
    expect(filename).not.toContain('ACTIVE');
  });

  it('says who printed it', async () => {
    await call({});
    const html = mockRenderToPdf.mock.calls.at(-1)![0];
    expect(html).toContain('Aisha Director');
    expect(html).toContain('GUARD LIST');
  });
});
