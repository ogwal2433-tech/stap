import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SiteFormModal from '../components/clients/SiteFormModal';

/**
 * A site could only be put in a zone from the zone's own "Manage sites" modal —
 * the site form had no zone field at all, so assigning one while creating or
 * editing a site was impossible.
 *
 * These check the field lists the zones, saves the chosen one, and sends null
 * rather than an empty string when the zone is cleared.
 */

const h = vi.hoisted(() => ({
  createArgs: [] as any[],
  updateArgs: [] as any[],
  zones: [
    { id: 'z1', name: 'Kampala Central' },
    { id: 'z2', name: 'Northern Region' },
  ] as any[],
  zonesLoading: false,
  zoneParams: [] as any[],
}));

vi.mock('../hooks/useZones', () => ({
  useZones: (params: any) => {
    h.zoneParams.push(params);
    return { data: { data: h.zones, pagination: { hasNext: false } }, isLoading: h.zonesLoading };
  },
}));

vi.mock('../hooks/useClients', () => ({
  useCreateSite: () => ({
    mutateAsync: (args: any) => { h.createArgs.push(args); return Promise.resolve({ id: 'new' }); },
    isPending: false,
  }),
  useUpdateSite: () => ({
    mutateAsync: (args: any) => { h.updateArgs.push(args); return Promise.resolve({ id: 's1' }); },
    isPending: false,
  }),
}));

vi.mock('../hooks/useSettings', () => ({
  useShiftTypes: () => ({ data: [] }),
}));

vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

const existingSite = {
  id: 's1',
  clientId: 'c1',
  siteName: 'Garden City',
  location: 'Yusuf Lule Road',
  guardsRequired: 2,
  siteType: 'PERMANENT',
  zoneId: 'z1',
} as any;

const draw = (site?: any) =>
  render(<SiteFormModal clientId="c1" site={site} onClose={() => {}} onSuccess={() => {}} />);

const zoneField = () => screen.getByLabelText(/Zone/i) as HTMLSelectElement;
const save = () => fireEvent.click(screen.getByRole('button', { name: /Save|Create|Update/i }));

beforeEach(() => {
  h.createArgs = [];
  h.updateArgs = [];
  h.zonesLoading = false;
  h.zoneParams = [];
  h.zones = [
    { id: 'z1', name: 'Kampala Central' },
    { id: 'z2', name: 'Northern Region' },
  ];
});

describe('site form — zone field', () => {
  it('lists every active zone', () => {
    draw();

    const options = Array.from(zoneField().options).map((o) => o.textContent);
    expect(options).toContain('Kampala Central');
    expect(options).toContain('Northern Region');
  });

  it('asks only for active zones, and enough of them', () => {
    draw();
    expect(h.zoneParams[0]).toMatchObject({ isActive: true, limit: 200 });
  });

  it('opens on the zone the site is already in', () => {
    draw(existingSite);
    expect(zoneField().value).toBe('z1');
  });

  it('saves the chosen zone', async () => {
    draw(existingSite);

    fireEvent.change(zoneField(), { target: { value: 'z2' } });
    save();

    await waitFor(() => expect(h.updateArgs).toHaveLength(1));
    expect(h.updateArgs[0].data.zoneId).toBe('z2');
  });

  it('sends null, not an empty string, when the zone is cleared', async () => {
    draw(existingSite);

    fireEvent.change(zoneField(), { target: { value: '' } });
    save();

    await waitFor(() => expect(h.updateArgs).toHaveLength(1));
    expect(h.updateArgs[0].data.zoneId).toBeNull();
  });

  it('starts with no zone on a new site', () => {
    draw();
    expect(zoneField().value).toBe('');
  });

  it('says so when there are no zones to choose from', () => {
    h.zones = [];
    draw();

    expect(screen.getByText(/No zones yet/i)).toBeInTheDocument();
  });
});
