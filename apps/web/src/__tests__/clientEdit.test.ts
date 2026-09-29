import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ClientFormSchema, UpdateClientSchema, normaliseClientPhone, CLIENT_PHONE_PATTERN,
} from '@security360/shared';

/**
 * Two ways client edit failed, both silent.
 *
 * The form's own validator rejected contactPhone — a field with no input,
 * derived from the contact card — whenever the card's phone was blank (every
 * imported client) or typed with spaces. Save then did nothing at all.
 *
 * The edit page, its buttons and the API checked a role list, so a role granted
 * clients.edit in the Roles page was still refused.
 */

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

/** Values the edit form loads for a client created by the Excel import. */
const imported = {
  clientName:      'Kampala Heights Ltd',
  contactPerson:   'To be confirmed',
  contactPhone:    '',
  physicalAddress: 'Plot 14 Kira Road',
  billingTerms:    30,
  contractStatus:  'ACTIVE' as const,
  vatRegistered:   false,
  leadStatus:      'CONVERTED' as const,
};

describe('client phone validation', () => {
  it('lets the form save an imported client that has no phone', () => {
    expect(ClientFormSchema.safeParse(imported).success).toBe(true);
    expect(UpdateClientSchema.safeParse(imported).success).toBe(true);
  });

  it.each([
    ['0772 123 456',    '0772123456'],
    ['+256-417-444444', '+256417444444'],
    ['(0772) 123.456',  '0772123456'],
  ])('reads "%s" as %s', (typed, digits) => {
    expect(normaliseClientPhone(typed)).toBe(digits);
    const parsed = UpdateClientSchema.safeParse({ contactPhone: typed });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.contactPhone).toBe(digits);
  });

  it('still rejects what is not a phone number', () => {
    for (const bad of ['12345', 'call reception', '+256 772 123 456 789 000']) {
      expect(UpdateClientSchema.safeParse({ contactPhone: bad }).success, bad).toBe(false);
    }
  });

  it('stores only what a payment request can dial', () => {
    // contactPhone is the MSISDN mobile money charges.
    expect(CLIENT_PHONE_PATTERN.test(normaliseClientPhone('+256 772-123 456'))).toBe(true);
  });

  it('adds no defaults to a one-field update', () => {
    const parsed = UpdateClientSchema.safeParse({ billingTerms: 45 });
    expect(parsed.success && Object.keys(parsed.data)).toEqual(['billingTerms']);
  });
});

describe('the form never fails silently', () => {
  const form = read('pages/clients/ClientFormPage.tsx');

  it('handles a refused save instead of ignoring it', () => {
    expect(form).toContain('handleSubmit(onSubmit, onInvalid)');
    expect(form).toMatch(/const onInvalid = \(formErrors/);
  });

  it('names the derived contact fields and brings the message into view', () => {
    expect(form).toContain("contactPhone:    'Primary contact phone'");
    const onInvalid = form.slice(form.indexOf('const onInvalid'));
    expect(onInvalid.slice(0, 700)).toContain('window.scrollTo');
  });
});

describe('client write gates use permissions, not a role list', () => {
  const app    = read('App.tsx');
  const list   = read('pages/clients/ClientsListPage.tsx');
  const detail = read('pages/clients/ClientDetailPage.tsx');

  function routeFor(path: string): string {
    const m = app.match(new RegExp(`<Route\\s+path="${path.replace(/[/:]/g, (c) => `\\${c}`)}"[^\\n]*`));
    if (!m) throw new Error(`no route for ${path}`);
    return m[0];
  }

  /** The permission on the nearest PermissionGuard opened before `needle`. */
  function gateBefore(source: string, needle: string): string | null {
    const at = source.indexOf(needle);
    if (at === -1) throw new Error(`"${needle}" not found`);
    const before = source.slice(0, at);
    const open   = before.lastIndexOf('<PermissionGuard permission="');
    const close  = before.lastIndexOf('</PermissionGuard>');
    if (open === -1 || close > open) return null;
    return before.slice(open).match(/permission="([^"]+)"/)![1];
  }

  it.each([
    ['/clients/new',      'clients.create'],
    ['/clients/:id/edit', 'clients.edit'],
  ])('%s requires %s', (path, permission) => {
    const route = routeFor(path);
    expect(route).toContain(`<PermissionGuard permission="${permission}"`);
    expect(route).not.toContain('RoleGuard');
  });

  it('Add Client and Import ask for clients.create', () => {
    expect(gateBefore(list, "navigate('/clients/new')")).toBe('clients.create');
    expect(gateBefore(list, 'setShowImport(true)')).toBe('clients.create');
  });

  it('both Edit buttons ask for clients.edit', () => {
    expect(gateBefore(list, 'navigate(`/clients/${c.id}/edit`)')).toBe('clients.edit');
    expect(gateBefore(detail, 'navigate(`/clients/${id}/edit`)')).toBe('clients.edit');
  });

  it('contact editing on the detail page follows clients.edit', () => {
    expect(detail).toContain("const canEditClient = useHasPermission('clients.edit')");
    expect(detail).not.toContain('CLIENT_WRITE_ROLES');
    expect(list).not.toContain('CLIENT_WRITE_ROLES');
  });
});
