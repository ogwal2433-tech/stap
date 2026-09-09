import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ContractResponse } from '@stap/shared';
import ContractExpiryPanels from '../components/clients/ContractExpiryPanels';

const alerts = vi.hoisted(() => ({ value: { expiring: [] as ContractResponse[], expired: [] as ContractResponse[] }, loading: false }));

vi.mock('../hooks/useContracts', () => ({
  useContractExpiryAlerts: () => ({ data: alerts.value, isLoading: alerts.loading }),
}));

const contract = (o: Partial<ContractResponse> & { id: string }): ContractResponse => ({
  client:            { id: `client-${o.id}`, clientName: 'Acme Holdings' },
  contractStart:     '2025-01-01T00:00:00.000Z',
  contractEnd:       '2026-01-01T00:00:00.000Z',
  guardsRequired:    4,
  totalMonthlyValue: 1_000_000,
  status:            'ACTIVE',
  daysRemaining:     10,
  daysSinceExpiry:   null,
  weaponsAllocation: null,
  shiftPattern:      null,
  guardRates:        [],
  amendmentCount:    0,
  billingNote:       null,
  createdAt:         '2025-01-01T00:00:00.000Z',
  updatedAt:         '2025-01-01T00:00:00.000Z',
  ...o,
});

const draw = () =>
  render(<MemoryRouter><ContractExpiryPanels /></MemoryRouter>);

/**
 * The panel a heading belongs to: heading → header bar → panel container.
 * Scoped rather than global, so "Today" in one panel cannot satisfy an
 * assertion meant for the other.
 */
const panel = (title: string) =>
  screen.getByText(title).parentElement!.parentElement!;

beforeEach(() => {
  alerts.value = { expiring: [], expired: [] };
  alerts.loading = false;
});

describe('both panels are always present', () => {
  it('shows an empty state for each rather than hiding the section', () => {
    // A missing panel reads as "nothing to report" only if you knew it could
    // appear. An explicit empty state says it was checked.
    draw();
    expect(screen.getByText('Expiring Soon')).toBeInTheDocument();
    expect(screen.getByText('Expired Contracts')).toBeInTheDocument();
    expect(screen.getByText('No contracts expiring in the next 30 days')).toBeInTheDocument();
    expect(screen.getByText('No expired contracts')).toBeInTheDocument();
  });

  it('counts each list in its header', () => {
    alerts.value = {
      expiring: [contract({ id: 'a' }), contract({ id: 'b' })],
      expired:  [contract({ id: 'c', daysSinceExpiry: 3 })],
    };
    draw();
    expect(screen.getByText('2 contracts')).toBeInTheDocument();
    expect(screen.getByText('1 contract')).toBeInTheDocument();
  });
});

describe('expiring badges', () => {
  it.each([
    [10, '10d left'],
    [1,  'Tomorrow'],
    [0,  'Today'],
  ])('%i days remaining reads "%s"', (days, label) => {
    alerts.value = { expiring: [contract({ id: 'a', daysRemaining: days })], expired: [] };
    draw();
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('the panel helper really scopes to one panel', () => {
    // Guards the assertion below. If panel() returned the whole document, a
    // badge in either panel would satisfy it and the test would prove nothing.
    alerts.value = {
      expiring: [contract({ id: 'a', daysRemaining: 0 })],
      expired:  [contract({ id: 'b', daysSinceExpiry: 0 })],
    };
    draw();
    expect(within(panel('Expiring Soon')).queryByText('Expired Contracts')).toBeNull();
    expect(within(panel('Expired Contracts')).queryByText('Expiring Soon')).toBeNull();
    // Both render "Today"; each panel sees exactly its own.
    expect(within(panel('Expiring Soon')).getAllByText('Today')).toHaveLength(1);
    expect(within(panel('Expired Contracts')).getAllByText('Today')).toHaveLength(1);
  });

  it('a contract ending today is expiring, not expired', () => {
    // The two windows meet at now; today belongs to the side that can still
    // be acted on before the date passes.
    alerts.value = { expiring: [contract({ id: 'a', daysRemaining: 0 })], expired: [] };
    draw();
    expect(within(panel('Expiring Soon')).getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('No expired contracts')).toBeInTheDocument();
  });
});

describe('expired badges', () => {
  it.each([
    [45, '45d ago'],
    [1,  'Yesterday'],
    [0,  'Today'],
  ])('%i days since expiry reads "%s"', (days, label) => {
    alerts.value = { expiring: [], expired: [contract({ id: 'a', status: 'EXPIRED', daysSinceExpiry: days })] };
    draw();
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('offers a way to act, not just a number', () => {
    alerts.value = { expiring: [], expired: [contract({ id: 'a', daysSinceExpiry: 5 })] };
    draw();
    expect(screen.getByText('Renew')).toBeInTheDocument();
    expect(screen.getByText('View all expired')).toHaveAttribute(
      'href', '/clients?contractFilter=expired',
    );
  });

  it('shows no call to action when there is nothing to chase', () => {
    draw();
    expect(screen.queryByText('View all expired')).not.toBeInTheDocument();
  });

  it('links each row to its client', () => {
    alerts.value = { expiring: [], expired: [contract({ id: 'a', daysSinceExpiry: 2 })] };
    draw();
    expect(screen.getByText('Acme Holdings')).toHaveAttribute('href', '/clients/client-a');
  });
});

describe('row detail', () => {
  it('singularises a one-guard contract', () => {
    alerts.value = { expiring: [contract({ id: 'a', guardsRequired: 1 })], expired: [] };
    draw();
    expect(screen.getByText(/^1 guard ·/)).toBeInTheDocument();
  });

  it('says "Ends" for expiring and "Expired" for expired', () => {
    alerts.value = {
      expiring: [contract({ id: 'a' })],
      expired:  [contract({ id: 'b', daysSinceExpiry: 1 })],
    };
    draw();
    expect(screen.getByText(/· Ends /)).toBeInTheDocument();
    expect(screen.getByText(/· Expired /)).toBeInTheDocument();
  });
});

describe('while loading', () => {
  it('shows neither an empty state nor stale rows', () => {
    // "No expired contracts" shown before the answer arrives is a wrong answer.
    alerts.loading = true;
    draw();
    expect(screen.queryByText('No expired contracts')).not.toBeInTheDocument();
    expect(screen.queryByText('No contracts expiring in the next 30 days')).not.toBeInTheDocument();
  });
});
