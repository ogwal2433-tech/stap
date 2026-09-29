import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { COMPANY_BRANDING_DEFAULTS } from '@stap/shared';
import CompanyBrandingPanel from '../components/settings/CompanyBrandingPanel';

/**
 * Settings > Company Branding.
 *
 * The fields looked read-only to administrators who held settings.edit: every
 * keystroke was written to the draft and then immediately put back. The hook
 * handed out a freshly resolved object on each render, and the panel re-seeds
 * its draft whenever that object changes, so it re-seeded on every render.
 */

const h = vi.hoisted(() => ({
  permissions: ['settings.view', 'settings.edit'] as string[],
  saved: [] as any[],
}));

vi.mock('../context/AuthContext', () => ({
  useHasPermission: (...keys: string[]) => keys.every((k) => h.permissions.includes(k)),
}));

vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('../lib/settings.api', () => ({
  settingsApi: {
    getCompanyBranding: () => Promise.resolve({ ...COMPANY_BRANDING_DEFAULTS }),
    updateCompanyBranding: (values: any) => {
      h.saved.push(values);
      return Promise.resolve({ ...COMPANY_BRANDING_DEFAULTS, ...values });
    },
    resetCompanyBranding: () => Promise.resolve({ ...COMPANY_BRANDING_DEFAULTS }),
  },
}));

const draw = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <CompanyBrandingPanel />
  </QueryClientProvider>,
);

const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

beforeEach(() => {
  h.permissions = ['settings.view', 'settings.edit'];
  h.saved = [];
});

describe('CompanyBrandingPanel', () => {
  it('keeps what an editor types in every field', async () => {
    draw();
    await waitFor(() => expect(field('Company name').value).toBe(COMPANY_BRANDING_DEFAULTS.company_name));

    for (const label of ['Company name', 'Company short name', 'Company address', 'Company phone', 'Registration number', 'Tax ID']) {
      fireEvent.change(field(label), { target: { value: `${label} edited` } });
      await waitFor(() => expect(field(label).value).toBe(`${label} edited`));
    }
  });

  it('saves the edited values', async () => {
    draw();
    await waitFor(() => expect(field('Company name').value).toBe(COMPANY_BRANDING_DEFAULTS.company_name));

    fireEvent.change(field('Company name'), { target: { value: 'Acme Guarding Ltd' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(h.saved).toHaveLength(1));
    expect(h.saved[0].company_name).toBe('Acme Guarding Ltd');
    await waitFor(() => expect(field('Company name').value).toBe('Acme Guarding Ltd'));
  });

  it('is read-only without settings.edit', async () => {
    h.permissions = ['settings.view'];
    draw();
    await waitFor(() => expect(field('Company name').disabled).toBe(true));
    expect(screen.queryByRole('button', { name: /save changes/i })).toBeNull();
  });
});
