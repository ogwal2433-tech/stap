import { useEffect, useRef, useState } from 'react';

interface DateRangePickerProps {
  startDate:     string;
  endDate:       string;
  onRangeChange: (start: string, end: string) => void;
  minDate?:      string;
  maxDate?:      string;
  isInvalid?:    boolean;
  errorMessage?: string;
  label?:        string;
  placeholder?:  string;
}

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const DAY_LABELS = ['Su','Mo','Tu','We','Th','Fr','Sa'];

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}
function firstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}
function toDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export default function DateRangePicker({
  startDate, endDate, onRangeChange,
  minDate, maxDate,
  isInvalid, errorMessage,
  placeholder,
}: DateRangePickerProps) {
  const now = new Date();
  const [viewYear, setViewYear]     = useState(now.getFullYear());
  const [viewMonth, setViewMonth]   = useState(now.getMonth());
  const [isOpen, setIsOpen]         = useState(false);
  const [hoverDate, setHoverDate]   = useState('');
  const [selectingEnd, setSelectingEnd] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const todayStr = now.toISOString().split('T')[0];

  const dutyDays = startDate && endDate
    ? Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1
    : 0;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSelectingEnd(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function isInRange(date: string): boolean {
    if (!startDate) return false;
    const end = selectingEnd && hoverDate ? hoverDate : endDate;
    if (!end) return false;
    return date > startDate && date < end;
  }

  function handleDayClick(date: string) {
    if (!startDate || (startDate && endDate)) {
      onRangeChange(date, '');
      setSelectingEnd(true);
    } else if (selectingEnd) {
      if (date < startDate) {
        onRangeChange(date, startDate);
      } else {
        onRangeChange(startDate, date);
      }
      setSelectingEnd(false);
      setIsOpen(false);
    }
  }

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  }

  const borderColor = isInvalid ? '#dc3545' : isOpen ? '#86b7fe' : '#ced4da';
  const boxShadow = isOpen ? '0 0 0 0.25rem rgba(13,110,253,0.25)' : 'none';

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {/* Trigger */}
      <div
        onClick={() => setIsOpen((prev) => !prev)}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '0.375rem 0.75rem',
          border: `1px solid ${borderColor}`,
          borderRadius: '0.375rem',
          background: '#fff', cursor: 'pointer',
          minHeight: '38px', boxShadow,
        }}
      >
        <span style={{ fontSize: '1rem' }}>📅</span>
        <div style={{ flex: 1 }}>
          {startDate && endDate ? (
            <span style={{ fontSize: '0.88rem', color: '#1A1A1A', fontWeight: 500 }}>
              {new Date(startDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
              {' → '}
              {new Date(endDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
              {' '}
              <span style={{ color: '#0F7B6C', fontSize: '0.78rem' }}>
                ({dutyDays} day{dutyDays !== 1 ? 's' : ''})
              </span>
            </span>
          ) : startDate && !endDate ? (
            <span style={{ fontSize: '0.88rem', color: '#1B3A6B' }}>
              {new Date(startDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
              {' '}
              <span style={{ color: '#6c757d', fontSize: '0.82rem' }}>→ select end date</span>
            </span>
          ) : (
            <span style={{ color: '#6c757d', fontSize: '0.88rem' }}>
              {placeholder ?? 'Select date range...'}
            </span>
          )}
        </div>
        {(startDate || endDate) && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRangeChange('', ''); setSelectingEnd(false); }}
            style={{ background: 'none', border: 'none', color: '#6c757d', cursor: 'pointer', padding: '0 4px', fontSize: '1rem' }}
          >
            ✕
          </button>
        )}
        <span style={{ color: '#6c757d', fontSize: '0.75rem' }}>{isOpen ? '▲' : '▼'}</span>
      </div>

      {/* Calendar dropdown */}
      {isOpen && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 1060,
          background: '#fff', border: '1px solid #ced4da', borderRadius: '0.5rem',
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)', padding: '16px',
          minWidth: '300px', userSelect: 'none',
        }}>
          {/* Instruction banner */}
          <div style={{
            background: '#D6E0F0', borderRadius: '4px', padding: '6px 10px',
            marginBottom: '12px', fontSize: '0.78rem', color: '#1B3A6B', fontWeight: 500,
          }}>
            {!startDate || (startDate && endDate)
              ? '📅 Click a day to set the start date'
              : '📅 Click a day to set the end date'}
          </div>

          {/* Month navigation */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <button type="button" onClick={prevMonth} style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px',
              fontSize: '1rem', color: '#1B3A6B', fontWeight: 'bold',
            }}>‹</button>
            <span style={{ fontWeight: 700, color: '#1B3A6B', fontSize: '0.95rem' }}>
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>
            <button type="button" onClick={nextMonth} style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px',
              fontSize: '1rem', color: '#1B3A6B', fontWeight: 'bold',
            }}>›</button>
          </div>

          {/* Day name headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: '4px' }}>
            {DAY_LABELS.map((d) => (
              <div key={d} style={{ textAlign: 'center', fontSize: '0.72rem', fontWeight: 600, color: '#6c757d', padding: '2px 0' }}>
                {d}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px' }}>
            {Array(firstDayOfMonth(viewYear, viewMonth)).fill(null).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array(daysInMonth(viewYear, viewMonth)).fill(null).map((_, i) => {
              const day     = i + 1;
              const dateStr = toDateStr(viewYear, viewMonth, day);
              const isStart = dateStr === startDate;
              const isEnd   = dateStr === endDate;
              const inRange = isInRange(dateStr);
              const isToday = dateStr === todayStr;
              const disabled = (!!minDate && dateStr < minDate) || (!!maxDate && dateStr > maxDate);
              const isHovered = selectingEnd && hoverDate && startDate
                ? dateStr > startDate && dateStr <= hoverDate
                : false;

              return (
                <div
                  key={dateStr}
                  onClick={() => { if (!disabled) handleDayClick(dateStr); }}
                  onMouseEnter={() => { if (selectingEnd) setHoverDate(dateStr); }}
                  onMouseLeave={() => setHoverDate('')}
                  style={{
                    textAlign: 'center', padding: '5px 2px',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    fontSize: '0.82rem',
                    borderRadius: isStart || isEnd ? '50%' : '0',
                    background: isStart || isEnd ? '#1B3A6B' : (inRange || isHovered) ? '#D6E0F0' : 'transparent',
                    color: isStart || isEnd ? '#fff' : disabled ? '#ced4da' : isToday ? '#0F7B6C' : '#1A1A1A',
                    fontWeight: isStart || isEnd || isToday ? 700 : 400,
                    outline: isToday ? '1px solid #0F7B6C' : 'none',
                    outlineOffset: '-2px',
                    transition: 'all 0.1s',
                  }}
                >
                  {day}
                </div>
              );
            })}
          </div>

          {/* Range summary */}
          {startDate && endDate && (
            <div style={{
              marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #e9ecef',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.8rem',
            }}>
              <span style={{ color: '#6c757d' }}>
                {new Date(startDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                {' → '}
                {new Date(endDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
              </span>
              <span style={{ background: '#D0EDE9', color: '#0F7B6C', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>
                {dutyDays} day{dutyDays !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>
      )}

      {isInvalid && errorMessage && (
        <div style={{ color: '#dc3545', fontSize: '0.875rem', marginTop: '4px' }}>
          {errorMessage}
        </div>
      )}
    </div>
  );
}
