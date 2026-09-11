import { describe, it, expect } from 'vitest';
import { CreateClientSchema, UpdateClientSchema, ClientFormSchema, ClientContactSchema } from '@stap/shared';

/**
 * A client may have no email address, and saying so must not block the form.
 *
 * This was broken once: `z.string().email().optional()` rejects '', because an
 * empty string is not undefined, and '' is exactly what an untouched text input
 * submits. The field was labelled optional and could not be left blank. Fixed
 * in 2cd4f1f by accepting the empty string alongside the address.
 *
 * The service layer is covered elsewhere; these pin the validation itself,
 * which is the layer that actually refused, and they cover every route in —
 * create, update, the form resolver and a contact person.
 */

const base = {
  clientName:      'Blank Email Ltd',
  contactPerson:   'Jane Nakato',
  contactPhone:    '256700000000',
  physicalAddress: 'Kampala',
  billingTerms:    30,
  contractStatus:  'ACTIVE' as const,
};

describe('a client can be saved without an email', () => {
  it.each([
    ['omitted',      {}],
    ['empty string', { email: '' }],
    ['null',         { email: null }],
    ['undefined',    { email: undefined }],
    ['only spaces',  { email: '   ' }],
  ])('accepts an email that is %s', (_label, patch) => {
    const result = CreateClientSchema.safeParse({ ...base, ...patch });
    expect(
      result.success,
      result.success ? '' : JSON.stringify(result.error.issues),
    ).toBe(true);
  });

  it('accepts a real address too', () => {
    expect(CreateClientSchema.safeParse({ ...base, email: 'ops@acme.co.ug' }).success).toBe(true);
  });
});

describe('format is still checked when something was typed', () => {
  // The only email rule that should exist: not "you must give one", but
  // "if you give one, it has to be an address".
  it.each(['notanemail', 'missing@domain', 'two@@at.com', 'no-at-sign.com'])(
    'rejects %s',
    (email) => {
      const result = CreateClientSchema.safeParse({ ...base, email });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.path).toEqual(['email']);
      }
    },
  );
});

describe('every route in behaves the same', () => {
  it('the form resolver lets a blank through', () => {
    // What react-hook-form validates against as the user types. If this
    // disagreed with the API, the form would block on a value the server
    // would have accepted — which is the bug in its original form.
    expect(ClientFormSchema.safeParse({ ...base, email: '' }).success).toBe(true);
  });

  it('an update can clear an email that was set', () => {
    for (const email of ['', null]) {
      expect(UpdateClientSchema.safeParse({ email }).success).toBe(true);
    }
  });

  it('a contact person may have no email either', () => {
    expect(ClientContactSchema.safeParse({ name: 'Jane Nakato', email: '' }).success).toBe(true);
    expect(ClientContactSchema.safeParse({ name: 'Jane Nakato' }).success).toBe(true);
  });

  it('a contact with a malformed email is still rejected', () => {
    expect(ClientContactSchema.safeParse({ name: 'Jane', email: 'nope' }).success).toBe(false);
  });
});

describe('what the API is left holding', () => {
  it('passes the blank through as an empty string, for the service to normalise', () => {
    // Deliberately not turned into null here. blankToNull() in clientService is
    // the single place that happens, so the column never holds an empty string
    // — and doing it in both would put one rule in two places.
    const result = CreateClientSchema.safeParse({ ...base, email: '' });
    expect(result.success && result.data.email).toBe('');
  });

  it('normalises a whitespace-only field to that same blank', () => {
    const result = CreateClientSchema.safeParse({ ...base, email: '   ' });
    expect(result.success && result.data.email).toBe('');
  });

  it('trims a real address rather than storing the stray space', () => {
    const result = CreateClientSchema.safeParse({ ...base, email: '  ops@acme.co.ug ' });
    expect(result.success && result.data.email).toBe('ops@acme.co.ug');
  });
});
