import { useState } from 'react';
import { Alert, Button, Col, Form, Row } from 'react-bootstrap';
import { computeDisplayDuration, daysUntilExpiry } from '../../lib/dateUtils';

const DURATION_OPTIONS = [
  { label: '1 Month',  months: 1  },
  { label: '3 Months', months: 3  },
  { label: '6 Months', months: 6  },
  { label: '1 Year',   months: 12 },
  { label: '2 Years',  months: 24 },
  { label: '3 Years',  months: 36 },
  { label: 'Custom',   months: 0  },
];

interface ContractDurationPickerProps {
  startDateValue:    string;
  endDateValue:      string;
  onStartDateChange: (date: string) => void;
  onEndDateChange:   (date: string) => void;
  startDateLabel?:   string;
  endDateLabel?:     string;
  isRequired?:       boolean;
  startDateError?:   string;
  endDateError?:     string;
  minStartDate?:     string;
}

function calculateEndDate(startDate: string, months: number): string {
  if (!startDate || months === 0) return '';
  const start = new Date(startDate);
  const end   = new Date(start);
  end.setMonth(end.getMonth() + months);
  // Handle month overflow (e.g. Jan 31 + 1 month → Feb 28, not Mar 3)
  if (end.getDate() !== start.getDate()) {
    end.setDate(0);
  }
  return end.toISOString().split('T')[0];
}

export default function ContractDurationPicker({
  startDateValue,
  endDateValue,
  onStartDateChange,
  onEndDateChange,
  startDateLabel = 'Contract Start',
  endDateLabel   = 'Contract End',
  isRequired,
  startDateError,
  endDateError,
  minStartDate,
}: ContractDurationPickerProps) {
  const [activeDuration, setActiveDuration] = useState<number | null>(null);

  const handleStartDateChange = (newStart: string) => {
    onStartDateChange(newStart);
    if (activeDuration && activeDuration > 0) {
      onEndDateChange(calculateEndDate(newStart, activeDuration));
    }
  };

  const handleDurationClick = (months: number) => {
    if (months === 0) {
      setActiveDuration(null);
      return;
    }
    setActiveDuration(months);
    if (startDateValue) {
      onEndDateChange(calculateEndDate(startDateValue, months));
    }
  };

  const handleEndDateChange = (newEnd: string) => {
    setActiveDuration(null);
    onEndDateChange(newEnd);
  };

  const expiryDays = endDateValue ? daysUntilExpiry(endDateValue) : null;

  return (
    <div>
      {/* Row 1: Start date + Duration picker */}
      <Row className="g-3 mb-3">
        <Col md={5}>
          <Form.Label className="fw-bold small">
            {startDateLabel}{isRequired && <span className="text-danger"> *</span>}
          </Form.Label>
          <Form.Control
            type="date"
            value={startDateValue}
            min={minStartDate}
            onChange={(e) => handleStartDateChange(e.target.value)}
            isInvalid={!!startDateError}
          />
          {startDateError && (
            <Form.Control.Feedback type="invalid">{startDateError}</Form.Control.Feedback>
          )}
        </Col>
        <Col md={7}>
          <Form.Label className="fw-bold small">Duration</Form.Label>
          <div className="d-flex flex-wrap gap-1">
            {DURATION_OPTIONS.map((opt) => (
              <Button
                key={opt.months}
                type="button"
                size="sm"
                variant={
                  opt.months === 0
                    ? activeDuration === null && endDateValue
                      ? 'secondary'
                      : 'outline-secondary'
                    : activeDuration === opt.months
                    ? 'primary'
                    : 'outline-secondary'
                }
                onClick={() => handleDurationClick(opt.months)}
                style={{ fontSize: '0.78rem' }}
              >
                {opt.label}
              </Button>
            ))}
          </div>
          {!startDateValue && (
            <Form.Text className="text-muted">
              Select a start date first to use duration shortcuts
            </Form.Text>
          )}
        </Col>
      </Row>

      {/* Row 2: End date + Computed duration */}
      <Row className="g-3">
        <Col md={5}>
          <Form.Label className="fw-bold small">
            {endDateLabel}{isRequired && <span className="text-danger"> *</span>}
          </Form.Label>
          <Form.Control
            type="date"
            value={endDateValue}
            min={startDateValue || undefined}
            onChange={(e) => handleEndDateChange(e.target.value)}
            isInvalid={!!endDateError}
            style={{ borderColor: endDateValue && activeDuration ? '#0F7B6C' : undefined }}
          />
          {endDateError && (
            <Form.Control.Feedback type="invalid">{endDateError}</Form.Control.Feedback>
          )}
          {endDateValue && !endDateError && (
            <Form.Text style={{ color: '#0F7B6C' }}>
              ✓ Ends:{' '}
              {new Date(endDateValue).toLocaleDateString('en-GB', {
                day: '2-digit', month: 'long', year: 'numeric',
              })}
            </Form.Text>
          )}
        </Col>
        <Col md={7}>
          {startDateValue && endDateValue && (
            <div style={{ paddingTop: '32px' }}>
              <div style={{
                background: '#D0EDE9', borderRadius: '0.375rem',
                padding: '8px 14px', display: 'inline-flex', alignItems: 'center', gap: '8px',
              }}>
                <span style={{ fontSize: '1rem' }}>📅</span>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#0F7B6C', fontWeight: 600 }}>
                    Contract Duration
                  </div>
                  <div style={{ fontSize: '0.9rem', color: '#1B3A6B', fontWeight: 700 }}>
                    {computeDisplayDuration(startDateValue, endDateValue)}
                  </div>
                </div>
              </div>
            </div>
          )}
          {startDateValue && !endDateValue && (
            <div style={{ paddingTop: '32px' }}>
              <div style={{ fontSize: '0.8rem', color: '#6c757d' }}>
                Select a duration above or enter an end date manually
              </div>
            </div>
          )}
        </Col>
      </Row>

      {/* Expiry warning */}
      {expiryDays !== null && (
        expiryDays < 0 ? (
          <Alert variant="danger" className="mt-2 py-2 mb-0">
            <small>⚠️ This contract end date is in the past.</small>
          </Alert>
        ) : expiryDays <= 30 ? (
          <Alert variant="warning" className="mt-2 py-2 mb-0">
            <small>
              ⚠️ This contract expires in <strong>{expiryDays} day(s)</strong>.
            </small>
          </Alert>
        ) : null
      )}
    </div>
  );
}
