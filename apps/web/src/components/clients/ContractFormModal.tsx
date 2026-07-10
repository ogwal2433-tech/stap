import { useState } from 'react';
import { Alert, Button, Form, InputGroup, Modal, Spinner, Table } from 'react-bootstrap';
import ContractDurationPicker from '../common/ContractDurationPicker';
import { useCreateContract, useUpdateContract } from '../../hooks/useContracts';
import { SHIFT_PATTERNS } from '@stap/shared';
import type { ContractResponse, ShiftPattern } from '@stap/shared';

interface ContractFormModalProps {
  clientId: string;
  contract?: ContractResponse;
  onClose: () => void;
  onSuccess: () => void;
}

interface RateLine {
  guardType:    string;
  guardsCount:  number;
  ratePerGuard: number;
}

const FIXED_GUARD_TYPES = ['Armed Guard', 'Unarmed Guard', 'Supervisor', 'Guard'];

export default function ContractFormModal({
  clientId,
  contract,
  onClose,
  onSuccess,
}: ContractFormModalProps) {
  const isEdit = Boolean(contract);
  const createContract = useCreateContract(clientId);
  const updateContract = useUpdateContract(clientId);

  const [contractStart, setContractStart] = useState(
    contract ? contract.contractStart.slice(0, 10) : '',
  );
  const [contractEnd, setContractEnd] = useState(
    contract ? contract.contractEnd.slice(0, 10) : '',
  );
  const [status, setStatus] = useState<'DRAFT' | 'ACTIVE' | 'EXPIRING' | 'EXPIRED'>(
    contract?.status ?? 'ACTIVE',
  );
  const [weaponsAllocation, setWeaponsAllocation] = useState(
    contract?.weaponsAllocation != null ? String(contract.weaponsAllocation) : '',
  );
  const [shiftPattern, setShiftPattern] = useState<ShiftPattern | ''>(
    (contract?.shiftPattern as ShiftPattern | null) ?? '',
  );
  // Rate lines are the ONLY billing mechanism — starts empty on create, no default row.
  const [guardRates, setGuardRates] = useState<RateLine[]>(
    contract?.guardRates?.map(({ guardType, guardsCount, ratePerGuard }) => ({ guardType, guardsCount, ratePerGuard })) ?? [],
  );
  const [billingNote, setBillingNote] = useState(contract?.billingNote ?? '');
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const addRateLine = () =>
    setGuardRates((prev) => [...prev, { guardType: '', guardsCount: 1, ratePerGuard: 0 }]);

  const updateRate = (i: number, field: keyof RateLine, value: string | number) =>
    setGuardRates((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));

  const removeRate = (i: number) =>
    setGuardRates((prev) => prev.filter((_, idx) => idx !== i));

  const totalGuards = guardRates.reduce((s, r) => s + (r.guardsCount || 0), 0);
  const totalMonthlyValue = guardRates.reduce((s, r) => s + (r.guardsCount || 0) * (r.ratePerGuard || 0), 0);
  const hasEmptyGuardType = guardRates.some((r) => !r.guardType.trim());
  const hasInvalidRate = guardRates.some((r) => r.ratePerGuard <= 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (error) return;
    if (!contractStart || !contractEnd) return setError('Start and end dates are required.');
    if (guardRates.length === 0 || hasEmptyGuardType || hasInvalidRate) return;

    const weapons = parseInt(weaponsAllocation, 10);
    const payload = {
      contractStart: `${contractStart}T00:00:00.000Z`,
      contractEnd:   `${contractEnd}T23:59:59.999Z`,
      ...(isEdit && { status }),
      weaponsAllocation: weaponsAllocation !== '' && !isNaN(weapons) ? weapons : undefined,
      shiftPattern:      shiftPattern || undefined,
      guardRates: guardRates.map((r) => ({
        guardType:    r.guardType.trim(),
        guardsCount:  r.guardsCount,
        ratePerGuard: r.ratePerGuard,
      })),
      billingNote: billingNote.trim() || null,
    };

    try {
      if (isEdit && contract) {
        await updateContract.mutateAsync({ id: contract.id, data: payload });
      } else {
        await createContract.mutateAsync({ clientId, ...payload });
      }
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save contract');
    }
  }

  const isPending = createContract.isPending || updateContract.isPending;

  return (
    <Modal show onHide={onClose} size="lg" centered>
      <Modal.Header closeButton style={{ backgroundColor: '#1B3A6B', color: '#fff' }}>
        <Modal.Title className="fs-6 fw-semibold">
          {isEdit ? 'Edit Contract' : 'Add Contract'}
        </Modal.Title>
      </Modal.Header>

      <Form onSubmit={handleSubmit}>
        <Modal.Body>
          {error && <Alert variant="danger" className="small">{error}</Alert>}

          <div className="row g-3">
            {/* Contract dates with duration picker */}
            <div className="col-12">
              <ContractDurationPicker
                startDateValue={contractStart}
                endDateValue={contractEnd}
                onStartDateChange={setContractStart}
                onEndDateChange={setContractEnd}
                startDateLabel="Contract Start Date"
                endDateLabel="Contract End Date"
                isRequired
                startDateError={
                  contractStart && contractEnd && contractEnd <= contractStart
                    ? 'End date must be after start date'
                    : undefined
                }
              />
            </div>

            {/* Status — edit mode only; on create it's auto-set from dates */}
            {isEdit && (
              <div className="col-md-6">
                <Form.Label className="small fw-semibold">Status</Form.Label>
                <Form.Select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as typeof status)}
                >
                  <option value="DRAFT">Draft</option>
                  <option value="ACTIVE">Active</option>
                  <option value="EXPIRING">Expiring</option>
                  <option value="EXPIRED">Expired</option>
                </Form.Select>
                <Form.Text className="text-muted">Auto-computed from dates on create.</Form.Text>
              </div>
            )}

            {/* Shift Pattern */}
            <div className="col-md-6">
              <Form.Label className="small fw-semibold">Shift Pattern</Form.Label>
              <Form.Select
                value={shiftPattern}
                onChange={(e) => setShiftPattern(e.target.value as ShiftPattern | '')}
              >
                <option value="">— Not specified —</option>
                {Object.entries(SHIFT_PATTERNS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </Form.Select>
              <Form.Text className="text-muted">How guard shifts are arranged at this client's sites.</Form.Text>
            </div>

            {/* Weapons Allocation */}
            <div className="col-md-6">
              <Form.Label className="small fw-semibold">Weapons Allocation</Form.Label>
              <InputGroup>
                <Form.Control
                  type="number"
                  min={0}
                  value={weaponsAllocation}
                  onChange={(e) => setWeaponsAllocation(e.target.value)}
                  placeholder="0"
                />
                <InputGroup.Text>weapons</InputGroup.Text>
              </InputGroup>
              <Form.Text className="text-muted">Number of weapons allocated under this contract (leave blank if none).</Form.Text>
            </div>

            {/* Guard Rate Breakdown — the only billing mechanism */}
            <div className="col-12">
              <Alert variant="warning" className="py-2 mb-3">
                <small>
                  <strong>⚠️ Billing Note:</strong> Guards have varying salaries — totals shown are
                  estimates and may not match actual payroll figures. Rates can be adjusted per
                  contract as needed.
                </small>
              </Alert>

              <div className="d-flex align-items-center justify-content-between mb-1">
                <div>
                  <Form.Label className="fw-bold mb-0">
                    Guard Rate Breakdown <span className="text-danger">*</span>
                  </Form.Label>
                  <div className="text-muted" style={{ fontSize: '0.78rem' }}>
                    Define each guard type, count and rate. The contract total is calculated from these lines.
                  </div>
                </div>
                <Button type="button" variant="outline-primary" size="sm" onClick={addRateLine}>
                  + Add Guard Type
                </Button>
              </div>

              {guardRates.length === 0 && (
                <div style={{
                  border: '2px dashed #ced4da', borderRadius: '0.375rem', padding: '20px',
                  textAlign: 'center', color: '#6c757d', fontSize: '0.82rem',
                }}>
                  No guard types added yet. Click "+ Add Guard Type" to define the billing breakdown for this contract.
                </div>
              )}

              {guardRates.length > 0 && (
                <Table size="sm" bordered className="mb-2">
                  <thead style={{ background: '#F2F4F7' }}>
                    <tr>
                      <th>Guard Type</th>
                      <th style={{ width: '80px' }}>Count</th>
                      <th style={{ width: '140px' }}>Rate / Guard (UGX)</th>
                      <th style={{ width: '130px' }}>Monthly Total</th>
                      <th style={{ width: '36px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {guardRates.map((rate, i) => (
                      <tr key={i}>
                        <td>
                          <Form.Select
                            size="sm"
                            value={FIXED_GUARD_TYPES.includes(rate.guardType) ? rate.guardType : 'Other'}
                            onChange={(e) => updateRate(i, 'guardType', e.target.value === 'Other' ? '' : e.target.value)}
                          >
                            <option value="">— Select guard type —</option>
                            {FIXED_GUARD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                            <option value="Other">Other…</option>
                          </Form.Select>
                          {!FIXED_GUARD_TYPES.includes(rate.guardType) && (
                            <Form.Control
                              size="sm"
                              className="mt-1"
                              placeholder="Enter custom guard type"
                              value={rate.guardType}
                              onChange={(e) => updateRate(i, 'guardType', e.target.value)}
                              isInvalid={submitted && !rate.guardType.trim()}
                            />
                          )}
                        </td>
                        <td>
                          <Form.Control
                            size="sm"
                            type="number"
                            min={1}
                            value={rate.guardsCount}
                            onChange={(e) => updateRate(i, 'guardsCount', parseInt(e.target.value, 10) || 1)}
                            style={{ textAlign: 'center' }}
                          />
                        </td>
                        <td>
                          <Form.Control
                            size="sm"
                            type="number"
                            min={0}
                            value={rate.ratePerGuard}
                            onChange={(e) => updateRate(i, 'ratePerGuard', parseInt(e.target.value, 10) || 0)}
                            isInvalid={submitted && rate.ratePerGuard <= 0}
                          />
                        </td>
                        <td style={{
                          textAlign: 'right', fontWeight: 600, fontSize: '0.82rem', verticalAlign: 'middle',
                          color: rate.guardsCount > 0 && rate.ratePerGuard > 0 ? '#1B3A6B' : '#6c757d',
                        }}>
                          {rate.guardsCount > 0 && rate.ratePerGuard > 0
                            ? `UGX ${(rate.guardsCount * rate.ratePerGuard).toLocaleString()}`
                            : '—'}
                        </td>
                        <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                          <button
                            type="button"
                            onClick={() => removeRate(i)}
                            disabled={guardRates.length === 1}
                            style={{
                              background: 'none', border: 'none', fontSize: '1rem',
                              color:  guardRates.length === 1 ? '#ced4da' : '#dc3545',
                              cursor: guardRates.length === 1 ? 'not-allowed' : 'pointer',
                            }}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#D0EDE9' }}>
                      <td colSpan={2} style={{ fontWeight: 600, fontSize: '0.82rem', color: '#0F7B6C' }}>
                        Total Guards: {totalGuards}
                      </td>
                      <td style={{ fontWeight: 600, fontSize: '0.82rem', color: '#0F7B6C' }}>
                        Monthly Total:
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, fontSize: '0.9rem', color: '#0F7B6C' }}>
                        UGX {totalMonthlyValue.toLocaleString()}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </Table>
              )}

              {submitted && guardRates.length === 0 && (
                <div style={{ color: '#dc3545', fontSize: '0.875rem', marginTop: '4px' }}>
                  At least one guard rate line is required.
                </div>
              )}
              {submitted && guardRates.length > 0 && hasInvalidRate && (
                <div style={{ color: '#dc3545', fontSize: '0.875rem', marginTop: '4px' }}>
                  All rate lines must have a rate greater than zero.
                </div>
              )}
              {submitted && guardRates.length > 0 && hasEmptyGuardType && (
                <div style={{ color: '#dc3545', fontSize: '0.875rem', marginTop: '4px' }}>
                  All rate lines must have a guard type.
                </div>
              )}

              <Form.Group className="mt-3">
                <Form.Label className="small fw-semibold">
                  Additional Billing Notes
                  <span className="text-muted fw-normal ms-1">(optional)</span>
                </Form.Label>
                <Form.Control
                  as="textarea"
                  rows={2}
                  size="sm"
                  placeholder="Any extra context on billing for this contract…"
                  value={billingNote}
                  onChange={(e) => setBillingNote(e.target.value)}
                  maxLength={1000}
                />
              </Form.Group>
            </div>
          </div>
        </Modal.Body>

        <Modal.Footer>
          <Button variant="outline-secondary" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            type="submit"
            style={{ backgroundColor: '#1B3A6B', borderColor: '#1B3A6B' }}
            disabled={isPending || Boolean(error)}
          >
            {isPending
              ? <><Spinner size="sm" animation="border" className="me-2" />Saving...</>
              : isEdit ? 'Save Changes' : 'Add Contract'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
