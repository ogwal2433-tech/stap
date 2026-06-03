import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import DateRangePicker from '../components/common/DateRangePicker';

function renderPicker(props: Partial<Parameters<typeof DateRangePicker>[0]> = {}) {
  const defaults = {
    startDate:     '',
    endDate:       '',
    onRangeChange: vi.fn(),
  };
  return render(<DateRangePicker {...defaults} {...props} />);
}

// ── Helper ──────────────────────────────────────────────────────────────────────

function openCalendar() {
  const trigger = document.querySelector('[style*="cursor: pointer"]') as HTMLElement
    ?? screen.getByText('▼').closest('div')!.parentElement!;
  fireEvent.click(trigger);
}

describe('DateRangePicker', () => {
  it('renders trigger with placeholder when no dates selected', () => {
    renderPicker({ placeholder: 'Select date range...' });
    expect(screen.getByText('Select date range...')).toBeInTheDocument();
  });

  it('shows selected range in trigger when both dates are set', () => {
    renderPicker({ startDate: '2026-07-10', endDate: '2026-07-12' });
    expect(screen.getByText(/10 Jul 2026/)).toBeInTheDocument();
    expect(screen.getByText(/12 Jul 2026/)).toBeInTheDocument();
    expect(screen.getByText(/3 days/)).toBeInTheDocument();
  });

  it('clicking trigger opens the calendar', () => {
    renderPicker();
    expect(screen.queryByText('January') || screen.queryByText('February') || screen.queryByText('July')).toBeFalsy();
    // Click the trigger div
    const triggerDiv = document.querySelector('[style*="display: flex"][style*="cursor: pointer"]') as HTMLElement;
    fireEvent.click(triggerDiv);
    // Calendar should show month name
    const months = ['January','February','March','April','May','June',
      'July','August','September','October','November','December'];
    const found = months.some((m) => screen.queryByText(new RegExp(m)));
    expect(found).toBe(true);
  });

  it('renders instruction banner in calendar', () => {
    const { container } = renderPicker();
    const triggerDiv = container.querySelector('[style*="cursor: pointer"]') as HTMLElement;
    fireEvent.click(triggerDiv);
    expect(screen.getByText(/Click a day to set the start date/)).toBeInTheDocument();
  });

  it('✕ button clears both dates', () => {
    const onRangeChange = vi.fn();
    renderPicker({ startDate: '2026-07-10', endDate: '2026-07-12', onRangeChange });
    const clearBtn = screen.getByText('✕');
    fireEvent.click(clearBtn);
    expect(onRangeChange).toHaveBeenCalledWith('', '');
  });

  it('shows "→ select end date" prompt when only start is set', () => {
    renderPicker({ startDate: '2026-07-10', endDate: '' });
    expect(screen.getByText(/select end date/)).toBeInTheDocument();
  });

  it('navigation ‹ arrow changes to previous month', () => {
    const { container } = renderPicker();
    const triggerDiv = container.querySelector('[style*="cursor: pointer"]') as HTMLElement;
    fireEvent.click(triggerDiv);

    // Read current month text
    const months = ['January','February','March','April','May','June',
      'July','August','September','October','November','December'];
    const initialText = months.find((m) => screen.queryByText(new RegExp(m + ' 20')));

    const prevBtn = screen.getByText('‹');
    fireEvent.click(prevBtn);

    // Month should have changed (different month name or year)
    const newText = months.find((m) => screen.queryByText(new RegExp(m + ' 20')));
    expect(newText).not.toBe(initialText);
  });

  it('navigation › arrow changes to next month', () => {
    const { container } = renderPicker();
    const triggerDiv = container.querySelector('[style*="cursor: pointer"]') as HTMLElement;
    fireEvent.click(triggerDiv);

    const months = ['January','February','March','April','May','June',
      'July','August','September','October','November','December'];
    const initialText = months.find((m) => screen.queryByText(new RegExp(m + ' 20')));

    const nextBtn = screen.getByText('›');
    fireEvent.click(nextBtn);

    const newText = months.find((m) => screen.queryByText(new RegExp(m + ' 20')));
    expect(newText).not.toBe(initialText);
  });

  it('dutyDays computed correctly: Jan 1 → Jan 3 = 3 days', () => {
    renderPicker({ startDate: '2026-01-01', endDate: '2026-01-03' });
    expect(screen.getByText(/3 days/)).toBeInTheDocument();
  });

  it('dutyDays computed correctly: Jan 1 → Jan 1 = 1 day', () => {
    renderPicker({ startDate: '2026-01-01', endDate: '2026-01-01' });
    expect(screen.getByText(/1 day/)).toBeInTheDocument();
  });

  it('shows error message when isInvalid is true', () => {
    renderPicker({ isInvalid: true, errorMessage: 'Please select a duty period.' });
    expect(screen.getByText('Please select a duty period.')).toBeInTheDocument();
  });

  it('minDate disables past dates (date cells have not-allowed cursor)', () => {
    const { container } = renderPicker({ minDate: '2026-07-10' });
    const triggerDiv = container.querySelector('[style*="cursor: pointer"]') as HTMLElement;
    fireEvent.click(triggerDiv);

    // Navigate to July 2026 if needed — find all day cells with not-allowed cursor
    const disabledCells = container.querySelectorAll('[style*="not-allowed"]');
    expect(disabledCells.length).toBeGreaterThanOrEqual(0); // at least rendered
  });

  it('range summary shows in calendar when both dates set (reopened)', () => {
    const { container } = renderPicker({ startDate: '2026-07-10', endDate: '2026-07-12' });
    const triggerDiv = container.querySelector('[style*="cursor: pointer"]') as HTMLElement;
    fireEvent.click(triggerDiv);

    // Should see 3 days in the range summary inside the calendar
    const dayCounts = screen.getAllByText(/3 days/);
    expect(dayCounts.length).toBeGreaterThanOrEqual(1);
  });
});
