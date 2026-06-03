import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import ContractDurationPicker from '../components/common/ContractDurationPicker';
import { computeDisplayDuration, daysUntilExpiry } from '../lib/dateUtils';

// ── Helpers ───────────────────────────────────────────────────────────────────

function addDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

function renderPicker(
  startDate = '',
  endDate   = '',
  onStart   = vi.fn(),
  onEnd     = vi.fn(),
) {
  render(
    <ContractDurationPicker
      startDateValue={startDate}
      endDateValue={endDate}
      onStartDateChange={onStart}
      onEndDateChange={onEnd}
      isRequired
    />,
  );
  return { onStart, onEnd };
}

// ── TEST 1 — "1 Year" auto-fills end date exactly 1 year later ────────────────

describe('TEST 1 — 1 Year button', () => {
  it('calls onEndDateChange with start + 12 months', () => {
    const onEnd = vi.fn();
    renderPicker('2026-01-15', '', vi.fn(), onEnd);

    fireEvent.click(screen.getByText('1 Year'));
    expect(onEnd).toHaveBeenCalledWith('2027-01-15');
  });
});

// ── TEST 2 — "6 Months" ───────────────────────────────────────────────────────

describe('TEST 2 — 6 Months button', () => {
  it('calls onEndDateChange with start + 6 months', () => {
    const onEnd = vi.fn();
    renderPicker('2026-01-31', '', vi.fn(), onEnd);

    fireEvent.click(screen.getByText('6 Months'));
    expect(onEnd).toHaveBeenCalledWith('2026-07-31');
  });
});

// ── TEST 3 — Month overflow (Jan 31 + 1 Month → Feb 28) ──────────────────────

describe('TEST 3 — month overflow', () => {
  it('clamps to last day of month instead of overflowing to March', () => {
    const onEnd = vi.fn();
    renderPicker('2026-01-31', '', vi.fn(), onEnd);

    fireEvent.click(screen.getByText('1 Month'));
    expect(onEnd).toHaveBeenCalledWith('2026-02-28');
  });
});

// ── TEST 4 — Changing start date recalculates end when duration active ────────

function ControlledPicker() {
  const [start, setStart] = useState('2026-01-01');
  const [end,   setEnd]   = useState('');
  return (
    <ContractDurationPicker
      startDateValue={start}
      endDateValue={end}
      onStartDateChange={setStart}
      onEndDateChange={setEnd}
    />
  );
}

describe('TEST 4 — start date change recalculates end', () => {
  it('re-calculates end date when start changes while 3 Months is active', () => {
    render(<ControlledPicker />);

    // Activate 3 Months → end becomes 2026-04-01
    fireEvent.click(screen.getByText('3 Months'));
    expect(screen.getByDisplayValue('2026-04-01')).toBeInTheDocument();

    // Change start to 2026-03-01 — end should recalculate to 2026-06-01
    const startInput = screen.getByDisplayValue('2026-01-01');
    fireEvent.change(startInput, { target: { value: '2026-03-01' } });
    expect(screen.getByDisplayValue('2026-06-01')).toBeInTheDocument();
  });
});

// ── TEST 5 — Custom clears active duration, end date stays ───────────────────

describe('TEST 5 — Custom button', () => {
  it('deactivates the active duration button when Custom is clicked', () => {
    const onEnd = vi.fn();
    renderPicker('2026-01-01', '2027-01-01', vi.fn(), onEnd);

    // Activate 1 Year
    fireEvent.click(screen.getByText('1 Year'));

    // Click Custom — should not clear end date but remove active highlight
    // We can verify by checking onEndDateChange is NOT called with empty string
    onEnd.mockClear();
    fireEvent.click(screen.getByText('Custom'));
    expect(onEnd).not.toHaveBeenCalled();
  });
});

// ── TEST 6 — Manually editing end date switches to Custom mode ────────────────

describe('TEST 6 — manual end date edit', () => {
  it('calls onEndDateChange with the manually entered value', () => {
    const onEnd = vi.fn();
    renderPicker('2026-01-01', '2027-01-01', vi.fn(), onEnd);

    // Activate 1 Year first
    fireEvent.click(screen.getByText('1 Year'));
    onEnd.mockClear();

    // Manually change end date
    const endInput = screen.getAllByDisplayValue('2027-01-01')[0];
    fireEvent.change(endInput, { target: { value: '2027-06-01' } });
    expect(onEnd).toHaveBeenCalledWith('2027-06-01');
  });
});

// ── TEST 7 — computeDisplayDuration ──────────────────────────────────────────

describe('TEST 7 — computeDisplayDuration()', () => {
  it('returns "1 year" for exactly 1 year', () => {
    expect(computeDisplayDuration('2026-01-01', '2027-01-01')).toBe('1 year');
  });

  it('returns "1 year and 6 months" for 18 months', () => {
    expect(computeDisplayDuration('2026-01-01', '2027-07-01')).toBe('1 year and 6 months');
  });

  it('returns "3 months" for 3 months', () => {
    expect(computeDisplayDuration('2026-01-01', '2026-04-01')).toBe('3 months');
  });

  it('returns "Invalid range" for same date', () => {
    expect(computeDisplayDuration('2026-01-01', '2026-01-01')).toBe('Invalid range');
  });

  it('returns "Invalid range" when end is before start', () => {
    expect(computeDisplayDuration('2026-06-01', '2026-01-01')).toBe('Invalid range');
  });
});

// ── TEST 8 — daysUntilExpiry ──────────────────────────────────────────────────

describe('TEST 8 — daysUntilExpiry()', () => {
  it('returns a negative number for yesterday', () => {
    expect(daysUntilExpiry(addDays(-1))).toBeLessThan(0);
  });

  it('returns ~30 for 30 days from now', () => {
    const result = daysUntilExpiry(addDays(30));
    expect(result).toBeGreaterThanOrEqual(29);
    expect(result).toBeLessThanOrEqual(31);
  });
});

// ── TEST 9 — Expiry warning shown for near-future date ───────────────────────

describe('TEST 9 — expiry warning', () => {
  it('shows "Expires in" warning when end date is 10 days away', () => {
    renderPicker('2020-01-01', addDays(10));
    expect(screen.getByText(/Expires in/i)).toBeInTheDocument();
  });
});

// ── TEST 10 — Past date shows danger alert ────────────────────────────────────

describe('TEST 10 — past end date warning', () => {
  it('shows "contract end date is in the past" when end is yesterday', () => {
    renderPicker('2020-01-01', addDays(-1));
    expect(screen.getByText(/contract end date is in the past/i)).toBeInTheDocument();
  });
});

// ── TEST 11 — minStartDate applied to start input ────────────────────────────

describe('TEST 11 — minStartDate attribute', () => {
  it('sets the min attribute on the start date input', () => {
    const today = new Date().toISOString().split('T')[0];
    render(
      <ContractDurationPicker
        startDateValue=""
        endDateValue=""
        onStartDateChange={vi.fn()}
        onEndDateChange={vi.fn()}
        minStartDate={today}
      />,
    );
    const inputs = document.querySelectorAll('input[type="date"]');
    const startEl = Array.from(inputs).find((el) => (el as HTMLInputElement).min === today);
    expect(startEl).toBeTruthy();
  });
});

// ── TEST 12 — Callbacks called with correct values ───────────────────────────

describe('TEST 12 — callback values', () => {
  it('calls onEndDateChange with "2026-12-01" when 6 Months clicked with start 2026-06-01', () => {
    const onEnd = vi.fn();
    renderPicker('2026-06-01', '', vi.fn(), onEnd);

    fireEvent.click(screen.getByText('6 Months'));
    expect(onEnd).toHaveBeenCalledWith('2026-12-01');
  });
});
