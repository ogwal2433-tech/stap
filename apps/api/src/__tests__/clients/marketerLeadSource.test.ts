import { describe, it, expect } from 'vitest';
import {
  CreateClientSchema,
  UpdateClientSchema,
  ClientFormSchema,
  LEAD_SOURCES,
  MARKETER_LEAD_SOURCE,
} from '@security360/shared';

const base = {
  clientName:      'Acme Holdings',
  contactPerson:   'John Mugisha',
  contactPhone:    '256700000000',
  physicalAddress: 'Kampala',
  billingTerms:    30,
  contractStatus:  'ACTIVE',
};

const create = (o: Record<string, unknown>) => CreateClientSchema.safeParse({ ...base, ...o });

const firstIssue = (r: ReturnType<typeof create>) =>
  r.success ? null : r.error.issues[0];

describe('MARKETER is a lead source', () => {
  it('is offered alongside the others', () => {
    expect(LEAD_SOURCES).toHaveProperty('MARKETER', 'Marketer');
    expect(MARKETER_LEAD_SOURCE).toBe('MARKETER');
  });

  it('is accepted by the schema with a name', () => {
    expect(create({ leadSource: 'MARKETER', marketerName: 'John Okello' }).success).toBe(true);
  });
});

describe('a marketer lead must name the marketer', () => {
  it.each([
    ['missing',    undefined],
    ['empty',      ''],
    ['whitespace', '   '],
  ])('rejects a %s name', (_label, marketerName) => {
    const result = create({ leadSource: 'MARKETER', marketerName });
    expect(result.success).toBe(false);
    const issue = firstIssue(result);
    // Reported against the field, so the form can show it under the input
    // rather than as a form-level error the user has to hunt for.
    expect(issue?.path).toEqual(['marketerName']);
    expect(issue?.message).toMatch(/marketer/i);
  });

  it('applies on update too, not only on create', () => {
    const r = UpdateClientSchema.safeParse({ leadSource: 'MARKETER' });
    expect(r.success).toBe(false);
  });

  it('applies in the form resolver, so it is caught before submit', () => {
    const r = ClientFormSchema.safeParse({ ...base, leadSource: 'MARKETER' });
    expect(r.success).toBe(false);
  });
});

describe('every other source is unaffected', () => {
  it.each(Object.keys(LEAD_SOURCES).filter((k) => k !== MARKETER_LEAD_SOURCE))(
    '%s needs no marketer name',
    (source) => {
      expect(create({ leadSource: source }).success).toBe(true);
    },
  );

  it('no source at all is still fine — the field is optional', () => {
    expect(create({}).success).toBe(true);
    // An unselected <select> submits '', which must not be an enum error.
    expect(create({ leadSource: '' }).success).toBe(true);
  });

  it('a partial update touching neither field is not rejected', () => {
    // The rule spans two fields; a PATCH of the billing terms sends neither and
    // must not be judged against it.
    expect(UpdateClientSchema.safeParse({ billingTerms: 60 }).success).toBe(true);
  });

  it('tolerates a stray name on a non-marketer source — the service clears it', () => {
    expect(create({ leadSource: 'REFERRAL', marketerName: 'Left over' }).success).toBe(true);
  });
});

describe('name length', () => {
  it('accepts a realistic name', () => {
    expect(create({ leadSource: 'MARKETER', marketerName: 'A'.repeat(100) }).success).toBe(true);
  });

  it('rejects one past the column width', () => {
    expect(create({ leadSource: 'MARKETER', marketerName: 'A'.repeat(101) }).success).toBe(false);
  });
});
