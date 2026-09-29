import { beforeEach, describe, expect, it, vi } from 'vitest';

const publishReportTitleChange = vi.fn();
vi.mock('../../db/prisma', () => ({ default: { systemSetting: {
  findUnique: vi.fn(), upsert: vi.fn(), delete: vi.fn(), findMany: vi.fn(),
} } }));
vi.mock('../../lib/reportTitleCacheBus', () => ({ publishReportTitleChange: (...args: any[]) => publishReportTitleChange(...args) }));
vi.mock('../../jobs/QueueService', () => ({ QueueService: { logAudit: vi.fn().mockResolvedValue(undefined) } }));
vi.mock('../../lib/redis', () => ({ default: { del: vi.fn().mockResolvedValue(undefined) }, redisConnection: { del: vi.fn().mockResolvedValue(undefined) } }));
vi.mock('bcryptjs', () => ({ default: { hash: vi.fn() } }));

import prisma from '../../db/prisma';
import { REPORT_TITLE_DEFAULTS, resolveReportTitle } from '@security360/shared';
import { settingsService } from '../../services/settingsService';
const db = prisma as any;

describe('report title resolution and settings', () => {
  beforeEach(() => { vi.clearAllMocks(); settingsService.clearReportTitleCache(); });
  it('uses overrides, falls back for missing and blank strings', () => {
    expect(resolveReportTitle('invoice', { invoice: { ...REPORT_TITLE_DEFAULTS.invoice, title: 'Custom Invoice' } }).title).toBe('Custom Invoice');
    expect(resolveReportTitle('invoice', {}).title).toBe(REPORT_TITLE_DEFAULTS.invoice.title);
    expect(resolveReportTitle('invoice', { invoice: { ...REPORT_TITLE_DEFAULTS.invoice, title: '  ' } }).title).toBe(REPORT_TITLE_DEFAULTS.invoice.title);
  });
  it('publishes invalidation, removes one override and returns the default', async () => {
    db.systemSetting.findUnique.mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'row', value: JSON.stringify({ invoice: { title: 'Custom' } }) })
      .mockResolvedValueOnce({ id: 'row', value: JSON.stringify({ invoice: { title: 'Custom' } }) })
      .mockResolvedValueOnce({ id: 'row', value: JSON.stringify({ invoice: { title: 'Custom' } }) })
      .mockResolvedValueOnce(null);
    db.systemSetting.upsert.mockResolvedValue({ id: 'row' });
    await settingsService.updateReportTitles({ invoice: { title: 'Custom' } }, 'actor');
    expect(publishReportTitleChange).toHaveBeenCalled();
    const result = await settingsService.resetReportTitle('invoice', 'actor');
    expect(db.systemSetting.delete).toHaveBeenCalledWith({ where: { key: 'report_titles' } });
    expect(result.invoice.title).toBe(REPORT_TITLE_DEFAULTS.invoice.title);
  });
  it('deletes the override row when resetting all', async () => {
    db.systemSetting.findUnique.mockResolvedValue({ id: 'row', value: '{"invoice":{"title":"Custom"}}' });
    db.systemSetting.delete.mockResolvedValue({});
    await settingsService.resetAllReportTitles('actor');
    expect(db.systemSetting.delete).toHaveBeenCalledWith({ where: { key: 'report_titles' } });
  });
});
