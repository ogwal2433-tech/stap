import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../index';
import prisma from '../../db/prisma';
import { signAccessToken } from '../../lib/jwt';
import { ROLES } from '@stap/shared';
import {
  assertRequiredGuardFields, guardFieldRules, clearGuardFieldCache,
  CONFIGURABLE_GUARD_FIELDS, ALWAYS_REQUIRED_GUARD_FIELDS, settingKeyFor,
} from '../../lib/guardFieldRules';

/**
 * Which guard fields a deployment insists on.
 *
 * Two things are worth holding down. Only fields the database allows to be
 * absent are configurable — firstName, dateOfBirth, salaryRate and the rest are
 * NOT NULL, so a switch offering to make them optional would be offering
 * something the database will refuse. And the rule is enforced in the service,
 * not only in the form: a requirement only the browser applies is one any other
 * caller ignores.
 */

const bearer = `Bearer ${signAccessToken({
  sub: 'ci-guard-fields', role: ROLES.DIRECTOR, name: 'CI', email: 'ci@test.local',
} as never)}`;

const originals = new Map<string, string>();

async function setRequired(field: string, required: boolean) {
  await prisma.systemSetting.update({
    where: { key: settingKeyFor(field) },
    data:  { value: String(required) },
  });
  clearGuardFieldCache();
}

beforeAll(async () => {
  const rows = await prisma.systemSetting.findMany({ where: { group: 'GUARD_FIELDS' } });
  for (const row of rows) originals.set(row.key, row.value);
});

afterEach(async () => {
  for (const [key, value] of originals) {
    await prisma.systemSetting.update({ where: { key }, data: { value } });
  }
  clearGuardFieldCache();
});

afterAll(() => clearGuardFieldCache());

/** A guard payload with every configurable field left out. */
const bare = { firstName: 'Bare', lastName: 'Guard', salaryRate: 300_000 };

describe('configurable guard fields', () => {
  it('requires nothing extra by default', async () => {
    await expect(assertRequiredGuardFields(bare)).resolves.toBeUndefined();
  });

  it('refuses a guard missing a field that was switched on', async () => {
    await setRequired('phone', true);

    await expect(assertRequiredGuardFields(bare)).rejects.toThrow(/Phone number is required/i);
    await expect(assertRequiredGuardFields({ ...bare, phone: '+256700000001' }))
      .resolves.toBeUndefined();
  });

  it('treats blank and whitespace as missing', async () => {
    await setRequired('phone', true);

    await expect(assertRequiredGuardFields({ ...bare, phone: '' })).rejects.toThrow();
    await expect(assertRequiredGuardFields({ ...bare, phone: '   ' })).rejects.toThrow();
  });

  it('names every missing field at once, rather than one per attempt', async () => {
    await setRequired('phone', true);
    await setRequired('gender', true);
    await setRequired('nextOfKinName', true);

    await expect(assertRequiredGuardFields(bare)).rejects.toThrow(
      /Phone number, Gender, Next of kin name are required/i,
    );
  });

  it('points at the setting so the message can be acted on', async () => {
    await setRequired('phone', true);
    await expect(assertRequiredGuardFields(bare)).rejects.toThrow(/Settings → Guard Fields/);
  });

  it('on an update, only judges fields the payload actually carries', async () => {
    await setRequired('phone', true);

    // A PATCH that does not mention phone means "leave it alone", not "clear it".
    await expect(assertRequiredGuardFields({ lastName: 'Okello' }, { partial: true }))
      .resolves.toBeUndefined();

    // Clearing it explicitly is what the rule refuses.
    await expect(assertRequiredGuardFields({ phone: '' }, { partial: true }))
      .rejects.toThrow(/Phone number/i);
  });

  it('offers only fields the database allows to be absent', async () => {
    const configurable = Object.keys(CONFIGURABLE_GUARD_FIELDS);

    // Anything NOT NULL must not appear as a choice.
    for (const always of ALWAYS_REQUIRED_GUARD_FIELDS) {
      expect(configurable, `${always} is NOT NULL and cannot be optional`).not.toContain(always);
    }

    // And every configurable field is a real column on Guard.
    const columns = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'Guard'
    `;
    const names = new Set(columns.map((c) => c.column_name));
    for (const field of configurable) {
      expect(names, `${field} is not a column on Guard`).toContain(field);
    }
  });

  it('reports the rules, the labels and what is always required', async () => {
    await setRequired('gender', true);

    const res = await request(app).get('/api/v1/settings/guard-fields').set('Authorization', bearer);

    expect(res.status).toBe(200);
    expect(res.body.data.required.gender).toBe(true);
    expect(res.body.data.required.phone).toBe(false);
    expect(res.body.data.labels.phone).toBe('Phone number');
    expect(res.body.data.alwaysRequired).toContain('firstName');
    expect(res.body.data.alwaysRequired).toContain('salaryRate');
  });

  it('picks up a change without waiting for the cache to lapse', async () => {
    expect((await guardFieldRules()).district).toBe(false);
    await setRequired('district', true);
    expect((await guardFieldRules()).district).toBe(true);
  });
});
