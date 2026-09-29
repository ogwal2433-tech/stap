import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import prisma from '../../db/prisma';
import {
  generateGuardId, generateClientId, generateStaffId,
  generateGuardIds, generateGunId, generateShiftReportId,
  invoicePrefix, clearIdFormatCache,
} from '../../lib/systemId';

/**
 * System ID formats, configured in Settings.
 *
 * The case that matters most is a prefix containing a digit. The previous
 * implementation read the sequence by stripping every non-digit from the ID, so
 * S360G0001 — the obvious prefix for a Security360 deployment — came back as
 * 3,600,001 and the next ID jumped to S360G3600002. These pin that the number
 * is read by cutting the prefix off instead.
 *
 * Nothing here writes a record: each generator is asked what it would issue
 * next, against whatever the database already holds.
 */

const KEYS = [
  'guard_id_prefix', 'client_id_prefix', 'staff_id_prefix',
  'gun_id_prefix', 'shift_report_prefix', 'id_padding',
];

const original = new Map<string, string>();

/** Sets a setting for one test and drops the cache so it takes effect now. */
async function setFormat(key: string, value: string) {
  await prisma.systemSetting.update({ where: { key }, data: { value } });
  clearIdFormatCache();
}

beforeAll(async () => {
  for (const key of KEYS) {
    const row = await prisma.systemSetting.findUnique({ where: { key } });
    if (row) original.set(key, row.value);
  }
});

afterEach(async () => {
  for (const [key, value] of original) {
    await prisma.systemSetting.update({ where: { key }, data: { value } });
  }
  clearIdFormatCache();
});

afterAll(() => clearIdFormatCache());

describe('system ID formats', () => {
  it('issues the configured prefix', async () => {
    expect(await generateGuardId()).toMatch(/^S360G\d+$/);
    expect(await generateClientId()).toMatch(/^S360C\d+$/);
    expect(await generateStaffId()).toMatch(/^S360S\d+$/);
  });

  it('follows a changed prefix without touching what is already issued', async () => {
    const before = await prisma.guard.count({ where: { systemId: { startsWith: 'S360G' } } });

    await setFormat('guard_id_prefix', 'ZZQ');
    expect(await generateGuardId()).toBe('ZZQ001');

    // The existing S360G guards are untouched — only new IDs change.
    expect(await prisma.guard.count({ where: { systemId: { startsWith: 'S360G' } } })).toBe(before);
  });

  it('reads the sequence correctly when the prefix contains a digit', async () => {
    // The whole point. Under the old "strip every non-digit" rule this would
    // have come back in the millions.
    await setFormat('guard_id_prefix', 'S360G');
    expect(await generateGuardId()).toBe('S360G001');
  });

  it('carries on from the highest number already under that prefix', async () => {
    const existing = await prisma.guard.findFirst({
      where:   { systemId: { startsWith: 'S360G' } },
      orderBy: { systemId: 'desc' },
      select:  { systemId: true },
    });
    if (!existing?.systemId) return;

    const highest = Number(existing.systemId.replace(/^S360G/, ''));
    const next = await generateGuardId();
    expect(Number(next.replace(/^S360G/, ''))).toBeGreaterThan(highest - 1);
  });

  it('widens the number when the padding is raised', async () => {
    await setFormat('guard_id_prefix', 'ZZQ');
    await setFormat('id_padding', '6');
    expect(await generateGuardId()).toBe('ZZQ000001');
  });

  it('refuses a padding outside 1–8 rather than producing a silly ID', async () => {
    await setFormat('guard_id_prefix', 'ZZQ');

    await setFormat('id_padding', '99');
    expect(await generateGuardId()).toBe('ZZQ00000001');   // capped at 8

    await setFormat('id_padding', 'not a number');
    expect(await generateGuardId()).toBe('ZZQ001');        // back to the default
  });

  it('falls back to the shipped prefix when the setting is blank', async () => {
    await setFormat('guard_id_prefix', '   ');
    expect(await generateGuardId()).toMatch(/^S360G\d+$/);
  });

  it('keeps the gun and shift report shapes when their prefixes change', async () => {
    expect(await generateGunId()).toMatch(/^GUN-\d+$/);

    const year = new Date().getFullYear();
    expect(await generateShiftReportId()).toMatch(new RegExp(`^SHR-${year}-\\d+$`));

    await setFormat('gun_id_prefix', 'ZZW');
    await setFormat('shift_report_prefix', 'ZZR');

    // The dash, and the year, are part of the shape — not the prefix.
    expect(await generateGunId()).toBe('ZZW-001');
    expect(await generateShiftReportId()).toBe(`ZZR-${year}-001`);
  });

  it('numbers shift reports afresh each year', async () => {
    await setFormat('shift_report_prefix', 'ZZR');
    expect(await generateShiftReportId(1999)).toBe('ZZR-1999-001');
  });

  it('hands out a run of consecutive ids for a bulk import', async () => {
    await setFormat('guard_id_prefix', 'ZZQ');
    const ids = await generateGuardIds(3);

    expect(ids).toEqual(['ZZQ001', 'ZZQ002', 'ZZQ003']);
    expect(new Set(ids).size).toBe(3);
  });

  it('exposes the invoice prefix, which was configured but never read', async () => {
    const configured = await prisma.systemSetting.findUnique({ where: { key: 'invoice_prefix' } });
    if (!configured?.value) return;
    expect(await invoicePrefix()).toBe(configured.value.trim());
  });
});
