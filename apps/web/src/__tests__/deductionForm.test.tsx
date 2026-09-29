import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { DeductionTypeResponse } from '@security360/shared';
import DeductionFormModal from '../components/finance/DeductionFormModal';

/**
 * Adding a deduction to a guard.
 *
 * Two things this form used to get wrong. It opened with a hardcoded type
 * selected, which breaks once types are configurable — that type can be
 * deactivated or deleted, leaving the dropdown blank while the form still held
 * the value, and recording a charge against a retired type on submit. And the
 * settings page tells administrators a default amount "pre-fills the form when
 * that type is selected", which it did not do.
 */

const h = vi.hoisted(() => ({
  created: [] as any[],
  types: [] as any[],
}));

const type = (over: Partial<DeductionTypeResponse>): DeductionTypeResponse => ({
  id: 't1', name: 'Uniform Recovery', code: 'UNIFORM_RECOVERY',
  defaultAmount: null, description: null, isAutomatic: false,
  displayOrder: 1, isActive: true, createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
} as DeductionTypeResponse);

vi.mock('../hooks/useSettings', () => ({
  useDeductionTypes: () => ({ data: h.types, isLoading: false }),
}));

vi.mock('../hooks/useFinance', () => ({
  useCreateDeduction: () => ({
    mutateAsync: (v: any) => { h.created.push(v); return Promise.resolve({ id: 'd1' }); },
    isPending: false,
  }),
}));

vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

const draw = () => render(<DeductionFormModal guardId="g1" guardName="John Okello" onClose={() => {}} />);

const typeField   = () => screen.getByLabelText(/^Type/i) as HTMLSelectElement;
const amountField = () => screen.getByLabelText(/Amount/i) as HTMLInputElement;

beforeEach(() => {
  h.created = [];
  h.types = [
    type({ id: 't1', name: 'Uniform Recovery', code: 'UNIFORM_RECOVERY', defaultAmount: null }),
    type({ id: 't2', name: 'Food', code: 'FOOD', defaultAmount: 2000, description: 'UGX 2,000 per plate' }),
    type({ id: 't3', name: 'Late Coming', code: 'LATE_COMING', defaultAmount: 10000 }),
  ];
});

describe('add deduction form', () => {
  it('opens with no type chosen, rather than assuming one', () => {
    draw();
    expect(typeField().value).toBe('');
  });

  it('offers every active type, by code', () => {
    draw();
    const values = Array.from(typeField().options).map((o) => o.value);
    expect(values).toContain('UNIFORM_RECOVERY');
    expect(values).toContain('FOOD');
    expect(values).toContain('LATE_COMING');
  });

  it('fills the amount from the type default when one is picked', () => {
    draw();
    fireEvent.change(typeField(), { target: { value: 'FOOD' } });
    expect(amountField().value).toBe('2000');
  });

  it('leaves an amount already typed alone', () => {
    draw();
    fireEvent.change(amountField(), { target: { value: '7500' } });
    fireEvent.change(typeField(), { target: { value: 'LATE_COMING' } });
    expect(amountField().value).toBe('7500');
  });

  it('puts nothing in the amount for a type with no default', () => {
    draw();
    fireEvent.change(typeField(), { target: { value: 'UNIFORM_RECOVERY' } });
    expect(amountField().value).toBe('');
  });

  it('shows the type default as a hint that can be restored', () => {
    draw();
    fireEvent.change(typeField(), { target: { value: 'FOOD' } });
    fireEvent.change(amountField(), { target: { value: '5000' } });

    fireEvent.click(screen.getByText(/Reset to default/i));
    expect(amountField().value).toBe('2000');
  });

  it('sends the type code, which is what a deduction record stores', async () => {
    draw();
    fireEvent.change(typeField(), { target: { value: 'FOOD' } });
    fireEvent.change(screen.getByLabelText(/Reason|Description|Notes/i), {
      target: { value: 'Two plates on the night shift' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Add|Save/i }));

    await waitFor(() => expect(h.created).toHaveLength(1));
    expect(h.created[0].type).toBe('FOOD');
    expect(h.created[0].amount).toBe(2000);
    expect(h.created[0].guardId).toBe('g1');
  });

  it('will not submit without a type', async () => {
    draw();
    fireEvent.change(amountField(), { target: { value: '5000' } });
    fireEvent.click(screen.getByRole('button', { name: /Add|Save/i }));

    // The old hardcoded default would have let this through as UNIFORM_RECOVERY.
    await waitFor(() => expect(h.created).toHaveLength(0));
  });
});
