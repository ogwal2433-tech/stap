import { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { computeDuration } from '@stap/shared';
import type { MotorcycleReport, PendingMatter } from '@stap/shared';
import { PendingMattersSection, MotorcycleSection } from '../pages/controlRoom/shiftReportParts';

/** Both sections are controlled, so the test owns the state the form owns. */
function Pending({ initial = [], readOnly }: { initial?: PendingMatter[]; readOnly?: boolean }) {
  const [items, setItems] = useState<PendingMatter[]>(initial);
  return <PendingMattersSection items={items} onChange={setItems} readOnly={readOnly} />;
}

function Motorcycles({ initial = [], readOnly }: { initial?: MotorcycleReport[]; readOnly?: boolean }) {
  const [items, setItems] = useState<MotorcycleReport[]>(initial);
  return <MotorcycleSection items={items} onChange={setItems} readOnly={readOnly} />;
}

const matter = (o: Partial<PendingMatter> = {}): PendingMatter => ({
  id: 'pm-1', description: 'Gate lock broken', responsiblePerson: 'Okello',
  priority: 'HIGH', addedAt: '2026-09-12T04:00:00.000Z', ...o,
});

const motorcycle = (o: Partial<MotorcycleReport> = {}): MotorcycleReport => ({
  id: 'mc-1', zone: 'Zone 1', motorcycleId: 'UBD 123X', riderName: 'Mukasa',
  unreachablePeriods: [], longParkedPeriods: [], ...o,
});

describe('computeDuration', () => {
  it('reads a period within one day', () => {
    expect(computeDuration('14:30', '15:15')).toBe('45m');
    expect(computeDuration('16:00', '17:30')).toBe('1h 30m');
  });

  it('treats an end before the start as running past midnight', () => {
    // The night shift is 18:00–06:00, so this is 40 minutes, not negative.
    expect(computeDuration('23:40', '00:20')).toBe('40m');
  });

  it('says nothing until both times are set', () => {
    expect(computeDuration('', '15:15')).toBe('');
    expect(computeDuration('14:30', '')).toBe('');
    expect(computeDuration('not a time', '15:15')).toBe('');
  });
});

describe('pending matters', () => {
  it('prompts when empty and adds an item', () => {
    render(<Pending />);
    expect(screen.getByText(/No pending matters/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Add Item/i }));
    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(screen.queryByText(/No pending matters/i)).not.toBeInTheDocument();
  });

  it('edits description, responsible person and priority', () => {
    render(<Pending initial={[matter({ description: '', responsiblePerson: '', priority: 'MEDIUM' })]} />);

    const description = screen.getByPlaceholderText(/What needs attention next shift/i);
    fireEvent.change(description, { target: { value: 'Torch batteries flat' } });
    expect(description).toHaveValue('Torch batteries flat');

    const person = screen.getByPlaceholderText(/Name of person responsible/i);
    fireEvent.change(person, { target: { value: 'Nakato' } });
    expect(person).toHaveValue('Nakato');

    const priority = screen.getByLabelText(/Priority for item 1/i);
    fireEvent.change(priority, { target: { value: 'HIGH' } });
    expect(priority).toHaveValue('HIGH');
  });

  it('removes the item that was clicked', () => {
    render(<Pending initial={[matter(), matter({ id: 'pm-2', description: 'Second matter' })]} />);
    fireEvent.click(screen.getByRole('button', { name: /Remove item 1/i }));

    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(screen.queryByText('Item 2')).not.toBeInTheDocument();
    expect(screen.getByText('Second matter')).toBeInTheDocument();
  });

  it('shows a handed-over report as text with no controls', () => {
    render(<Pending initial={[matter()]} readOnly />);

    expect(screen.getByText('Gate lock broken')).toBeInTheDocument();
    expect(screen.getByText('Okello')).toBeInTheDocument();
    expect(screen.getByText(/High Priority/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add Item/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remove item/i })).not.toBeInTheDocument();
  });
});

describe('motorcycle report', () => {
  it('prompts when empty and adds a motorcycle', () => {
    render(<Motorcycles />);
    expect(screen.getByText(/No motorcycles added/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Add Motorcycle/i }));
    expect(screen.getByText(/Motorcycle 1/)).toBeInTheDocument();
    expect(screen.getByText(/No unreachable periods recorded/i)).toBeInTheDocument();
    expect(screen.getByText(/No long parked periods recorded/i)).toBeInTheDocument();
  });

  it('adds an unreachable period and shows its duration', () => {
    render(<Motorcycles initial={[motorcycle()]} />);

    const unreachable = screen.getByRole('group', { name: 'Unreachable Periods' });
    fireEvent.click(within(unreachable).getByRole('button', { name: /Add Period/i }));

    const [from, to] = within(unreachable).getAllByDisplayValue('');
    fireEvent.change(from, { target: { value: '14:30' } });
    fireEvent.change(to,   { target: { value: '15:15' } });

    expect(within(unreachable).getByText(/Period 1 \(45m\)/)).toBeInTheDocument();
  });

  it('stores the computed duration on a long parked period', () => {
    let latest: MotorcycleReport[] = [];
    function Capture() {
      const [items, setItems] = useState<MotorcycleReport[]>([
        motorcycle({ longParkedPeriods: [{ id: 'lp-1', from: '', to: '', location: '', duration: '' }] }),
      ]);
      latest = items;
      return <MotorcycleSection items={items} onChange={setItems} />;
    }
    render(<Capture />);

    const parked = screen.getByRole('group', { name: 'Long Parked Periods' });
    const [from, to] = within(parked).getAllByDisplayValue('');
    fireEvent.change(from, { target: { value: '16:00' } });
    fireEvent.change(to,   { target: { value: '17:30' } });

    expect(latest[0].longParkedPeriods[0].duration).toBe('1h 30m');
    expect(within(parked).getByText(/1h 30m parked/)).toBeInTheDocument();
  });

  it('removes a motorcycle', () => {
    render(<Motorcycles initial={[motorcycle(), motorcycle({ id: 'mc-2', zone: 'Zone 2' })]} />);
    fireEvent.click(screen.getByRole('button', { name: /Remove motorcycle 1/i }));

    expect(screen.queryByText(/Motorcycle 1 — Zone 1/)).not.toBeInTheDocument();
    expect(screen.getByText(/Motorcycle 1 — Zone 2/)).toBeInTheDocument();
  });

  it('shows a handed-over report as text with no controls', () => {
    render(<Motorcycles readOnly initial={[motorcycle({
      unreachablePeriods: [{ id: 'u-1', from: '14:30', to: '15:15', reason: 'Phone off' }],
      longParkedPeriods:  [{ id: 'lp-1', from: '16:00', to: '17:30', location: 'Main gate', duration: '1h 30m' }],
    })]} />);

    expect(screen.getByText('Zone 1 — UBD 123X — (Mukasa)')).toBeInTheDocument();
    expect(screen.getByText(/14:30 — 15:15 \(45m\) · Phone off/)).toBeInTheDocument();
    expect(screen.getByText(/16:00 — 17:30 \(1h 30m parked\) · Main gate/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add Period/i })).not.toBeInTheDocument();
  });
});
