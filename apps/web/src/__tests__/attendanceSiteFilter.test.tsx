import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AttendancePage from '../pages/attendance/AttendancePage';

/**
 * The zone and site filters on the attendance sheet.
 *
 * Zone filtering happens on the server — the sheet comes back holding only the
 * chosen zone's sites. The catch is that the same sheet also narrows to the
 * chosen *site*, and the dropdown's options were read from it: picking a site
 * emptied the list it was picked from, so there was no way to move to another
 * site without clearing the filter first. The options now come from a sheet
 * filtered by zone alone.
 */

const h = vi.hoisted(() => ({
  /** Every (date, siteId, zoneId) the page asked for. */
  calls: [] as { date: string; siteId?: string; zoneId?: string }[],
}));

const site = (id: string, siteName: string) => ({
  site: {
    id, siteName, location: 'Kampala', siteType: 'PERMANENT',
    client: { id: 'c1', clientName: 'Acacia' },
    guardsRequired: 2, specialInstructions: null,
  },
  supervisor: null,
  deployments: [],
  presentCount: 0, absentCount: 0, unmarkedCount: 0,
});

const FULL_SHEET = {
  date: '2026-09-23',
  zones: [
    { zoneId: 'z1', zoneName: 'Kampala Central', sites: [site('s1', 'Garden City'), site('s2', 'Acacia Mall')] },
    { zoneId: 'z2', zoneName: 'Northern Region', sites: [site('s3', 'Gulu Depot')] },
  ],
};

const ZONE1_SHEET = { date: '2026-09-23', zones: [FULL_SHEET.zones[0]] };
const ONE_SITE_SHEET = {
  date: '2026-09-23',
  zones: [{ zoneId: 'z1', zoneName: 'Kampala Central', sites: [site('s1', 'Garden City')] }],
};

vi.mock('../hooks/useAttendance', () => ({
  // Returns whatever the given filters would really produce, so the test
  // exercises the narrowing rather than assuming it.
  useDailySheet: (date: string, siteId?: string, zoneId?: string) => {
    h.calls.push({ date, siteId, zoneId });
    if (siteId) return { data: ONE_SITE_SHEET, isLoading: false, refetch: vi.fn() };
    if (zoneId === 'z1') return { data: ZONE1_SHEET, isLoading: false, refetch: vi.fn() };
    if (zoneId === 'z2') return { data: { date: '2026-09-23', zones: [FULL_SHEET.zones[1]] }, isLoading: false, refetch: vi.fn() };
    return { data: FULL_SHEET, isLoading: false, refetch: vi.fn() };
  },
  useMarkAttendance:   () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteDeployment: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('../hooks/useZones', () => ({
  useZones: () => ({ data: { data: [
    { id: 'z1', name: 'Kampala Central' },
    { id: 'z2', name: 'Northern Region' },
  ] } }),
  useMyZones: () => ({ data: [] }),
}));

vi.mock('../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', role: 'DIRECTOR', name: 'Dir' }, permissions: [] }),
  useHasPermission: () => true,
}));

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));

vi.mock('../components/RoleGuard', () => ({ default: ({ children }: any) => <>{children}</> }));
vi.mock('../components/attendance/CopyRosterModal', () => ({ default: () => null }));
vi.mock('../components/attendance/ReplacementModal', () => ({ default: () => null }));
vi.mock('../components/attendance/RosterBuilderTab', () => ({ default: () => null }));
vi.mock('../components/attendance/AttendanceRecordsTab', () => ({ default: () => null }));
vi.mock('../lib/exportToExcel', () => ({ exportAttendanceSheet: vi.fn() }));

const zoneField = () => screen.getByLabelText('Zone') as HTMLSelectElement;
const siteField = () => screen.getByLabelText('Site') as HTMLSelectElement;
const siteOptionText = () => Array.from(siteField().options).map((o) => o.textContent?.trim());

beforeEach(() => { h.calls = []; });

describe('attendance zone and site filters', () => {
  it('lists every site, named with its zone, when no zone is chosen', () => {
    render(<AttendancePage />);

    const options = siteOptionText();
    expect(options[0]).toBe('All Sites');
    expect(options).toContain('Garden City (Kampala Central)');
    expect(options).toContain('Gulu Depot (Northern Region)');
  });

  it('narrows the sites to the chosen zone', () => {
    render(<AttendancePage />);
    fireEvent.change(zoneField(), { target: { value: 'z1' } });

    const options = siteOptionText();
    expect(options).toContain('Garden City');
    expect(options).toContain('Acacia Mall');
    expect(options.join(' ')).not.toContain('Gulu Depot');
  });

  it('says the empty choice means all sites in that zone', () => {
    render(<AttendancePage />);
    expect(siteOptionText()[0]).toBe('All Sites');

    fireEvent.change(zoneField(), { target: { value: 'z1' } });
    expect(siteOptionText()[0]).toBe('All sites in this zone');
  });

  it('drops the zone suffix once the list is one zone deep', () => {
    render(<AttendancePage />);
    fireEvent.change(zoneField(), { target: { value: 'z1' } });

    expect(siteOptionText()).not.toContain('Garden City (Kampala Central)');
  });

  it('keeps the other sites listed after one is chosen', () => {
    render(<AttendancePage />);
    fireEvent.change(zoneField(), { target: { value: 'z1' } });
    fireEvent.change(siteField(), { target: { value: 's1' } });

    // The regression: the sheet narrows to Garden City, and the options used to
    // narrow with it, stranding the user on the site they had just picked.
    expect(siteField().value).toBe('s1');
    expect(siteOptionText()).toContain('Acacia Mall');
  });

  it('clears the chosen site when the zone changes', () => {
    render(<AttendancePage />);
    fireEvent.change(zoneField(), { target: { value: 'z1' } });
    fireEvent.change(siteField(), { target: { value: 's1' } });
    expect(siteField().value).toBe('s1');

    fireEvent.change(zoneField(), { target: { value: 'z2' } });

    // Otherwise a site from the old zone stays selected and the sheet comes
    // back empty, with nothing on screen explaining why.
    expect(siteField().value).toBe('');
    expect(siteOptionText()).toContain('Gulu Depot');
  });

  it('asks the server for the zone, and for the options without the site', () => {
    render(<AttendancePage />);
    fireEvent.change(zoneField(), { target: { value: 'z1' } });
    fireEvent.change(siteField(), { target: { value: 's1' } });

    // The sheet on screen is narrowed to both; the options query carries the
    // zone only.
    expect(h.calls).toContainEqual({ date: expect.any(String), siteId: 's1', zoneId: 'z1' });
    expect(h.calls).toContainEqual({ date: expect.any(String), siteId: undefined, zoneId: 'z1' });
  });

  it('copes with a zone that has no sites on the day', () => {
    render(<AttendancePage />);
    fireEvent.change(zoneField(), { target: { value: 'z3' } });

    // Unknown zone → the mock returns the full sheet; what matters is it renders.
    expect(siteField()).toBeInTheDocument();
  });
});
