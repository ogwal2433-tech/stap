import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The guards export must carry the filters the table is under.
 *
 * The bug this exists for: the Excel button always fetched the entire roll, so a
 * screen filtered to twelve suspended guards produced a workbook of two hundred
 * and forty-eight — read as complete by whoever received it. Nothing failed
 * loudly, because both the filter and the export worked; they just answered
 * different questions.
 *
 * Two layers are pinned here. The API client must actually send the filters, and
 * the page must hand the *same* filter object to the table and to both downloads
 * — a second copy of the filter list on the page is how the two drift apart
 * again next time a filter is added.
 */

vi.mock('../lib/api', () => ({
  default: { get: vi.fn() },
}));

// The workbook writer is covered by guardExport.test.tsx; here the question is
// only which rows it was handed.
vi.mock('../lib/exportToExcel', () => ({
  exportGuardsList: vi.fn(),
}));

import api from '../lib/api';
import { guardsApi } from '../lib/guards.api';

const mockGet = api.get as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockGet.mockResolvedValue({ data: { success: true, data: { guards: [], exportedAt: new Date().toISOString() } } });
  // jsdom has neither; downloadRollPdf would throw without them.
  URL.createObjectURL = (() => 'blob:mock') as typeof URL.createObjectURL;
  URL.revokeObjectURL = (() => undefined) as typeof URL.revokeObjectURL;
});

describe('guardsApi — the export requests carry the filters', () => {
  it('sends the filters to the spreadsheet endpoint', async () => {
    await guardsApi.exportAll({ status: 'SUSPENDED', search: 'ka' });
    expect(mockGet).toHaveBeenCalledWith(
      '/guards/export',
      { params: { status: 'SUSPENDED', search: 'ka' } },
    );
  });

  it('sends the same filters to the PDF endpoint, as a blob', async () => {
    mockGet.mockResolvedValue({ data: new Blob(['%PDF-1.4 stub']) });
    await guardsApi.downloadRollPdf({ status: 'SUSPENDED' });
    expect(mockGet).toHaveBeenCalledWith('/guards/export/pdf', {
      params: { status: 'SUSPENDED' },
      responseType: 'blob',
    });
  });

  it('asks for the whole roll when nothing is filtered', async () => {
    await guardsApi.exportAll();
    expect(mockGet).toHaveBeenCalledWith('/guards/export', { params: undefined });
  });
});

// ── The page: one filter object, shared ────────────────────────────────────────

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');
const listPage = read('pages/guards/GuardsListPage.tsx');

describe('GuardsListPage — table and exports read from one filter object', () => {
  const body = listPage.slice(listPage.indexOf('const activeFilters'));

  it('holds the filters in a single value', () => {
    expect(listPage).toContain('const activeFilters: GuardExportQuery = {');
  });

  it('passes that object to the table and to both downloads', () => {
    expect(body).toMatch(/useGuardList\(\{\s*\.\.\.activeFilters,/);
    expect(body).toContain('guardsApi.exportAll(activeFilters)');
    expect(body).toContain('guardsApi.downloadRollPdf(activeFilters)');
  });

  it('does not restate the filters inline for either export', () => {
    // A second list of filter fields, however brief, is the drift waiting to
    // happen: the next filter added to the table would not reach the download.
    const exportCalls = body.match(/(exportAll|downloadRollPdf)\(([^)]*)\)/g) ?? [];
    expect(exportCalls.length).toBe(2);
    for (const call of exportCalls) {
      expect(call).toMatch(/\(activeFilters\)/);
    }
  });

  it('offers both formats from one Export control', () => {
    expect(listPage).toContain('Excel — full workbook, every column');
    expect(listPage).toContain('PDF — printed list, ready to sign');
  });

  it('no longer claims the export ignores the screen', () => {
    // The comment that used to justify the old behaviour, and would now mislead
    // anyone reading this file.
    expect(listPage).not.toMatch(/asks the server for the whole roll/);
    expect(listPage).not.toMatch(/Exporting asks the server/);
  });
});
