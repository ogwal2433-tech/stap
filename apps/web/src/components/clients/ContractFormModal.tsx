import { useState, useEffect } from 'react';
import { Alert, Button, Form, InputGroup, Modal, Spinner, Table } from 'react-bootstrap';
import ContractDurationPicker from '../common/ContractDurationPicker';
import { useCreateContract, useUpdateContract } from '../../hooks/useContracts';
import { SHIFT_PATTERNS } from '@stap/shared';
import type { ContractResponse, ShiftPattern, ContractGuardRateResponse } from '@stap/shared';

const GUARD_TYPES = ['UNARMED', 'ARMED', 'SUPERVISOR', 'OTHER'] as const;

interface ContractFormModalProps {
  clientId: string;
  contract?: ContractResponse;
  onClose: () => void;
  onSuccess: () => void;
}

function formatWithCommas(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  return parseInt(digits, 10).toLocaleString();
}

function parseBilling(value: string): number {
  return parseInt(value.replace(/\D/g, ''), 10) || 0;
}


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
  const [guardsRequired, setGuardsRequired] = useState(
    contract ? String(contract.guardsRequired) : '1',
  );
  const [billingDisplay, setBillingDisplay] = useState(
    contract ? formatWithCommas(String(contract.billingPerGuard)) : '',
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
  const [guardRates, setGuardRates] = useState<Omit<ContractGuardRateResponse, 'id'>[]>(
    contract?.guardRates?.map(({ guardType, guardsCount, ratePerGuard }) => ({ guardType, guardsCount, ratePerGuard })) ?? [],
  );
  const [error, setError] = useState('');

  const billingPerGuard = parseBilling(billingDisplay);
  const guards = parseInt(guardsRequired, 10) || 0;
  const monthlyValue = guards * billingPerGuard;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (error) return;
    if (!contractStart || !contractEnd) return setError('Start and end dates are required.');
    if (billingPerGuard <= 0) return setError('Billing per guard must be positive.');
    if (guards < 1) return setError('Guards required must be at least 1.');

    const weapons = parseInt(weaponsAllocation, 10);
    const payload = {
      contractStart:     `${contractStart}T00:00:00.000Z`,
      contractEnd:       `${contractEnd}T23:59:59.999Z`,
      guardsRequired:    guards,
      billingPerGuard,
      ...(isEdit && { status }),
      weaponsAllocation: weaponsAllocation !== '' && !isNaN(weapons) ? weapons : undefined,
      shiftPattern:      shiftPattern || undefined,
      guardRates:        guardRates.length > 0 ? guardRates : undefined,
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

            {/* Guards Required */}
            <div className="col-md-4">
              <Form.Label className="small fw-semibold">Guards Required *</Form.Label>
              <Form.Control
                type="number"
                min={1}
                value={guardsRequired}
                onChange={(e) => setGuardsRequired(e.target.value)}
                required
              />
            </div>

            {/* Billing Per Guard */}
            <div className="col-md-4">
              <Form.Label className="small fw-semibold">Billing Per Guard (UGX) *</Form.Label>
              <InputGroup>
                <InputGroup.Text>UGX</InputGroup.Text>
                <Form.Control
                  type="text"
                  inputMode="numeric"
                  value={billingDisplay}
                  onChange={(e) => setBillingDisplay(e.target.value.replace(/[^\d,]/g, ''))}
                  onBlur={() => setBillingDisplay(formatWithCommas(billingDisplay))}
                  placeholder="0"
                  required
                />
              </InputGroup>
            </div>

            {/* Monthly Value (computed) */}
            <div className="col-md-4">
              <Form.Label className="small fw-semibold">Monthly Value (auto)</Form.Label>
              <Form.Control
                type="text"
                value={monthlyValue > 0 ? `UGX ${monthlyValue.toLocaleString()}` : '—'}
                readOnly
                className="bg-light text-muted"
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
            <div className={isEdit ? 'col-md-6' : 'col-md-6'}>
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

            {/* Guard Rates table */}
            <div className="col-12">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <Form.Label className="small fw-semibold mb-0">Guard Rates (optional)</Form.Label>
                <Button
                  size="sm"
                  variant="outline-primary"
                  onClick={() => setGuardRates((prev) => [...prev, { guardType: 'UNARMED', guardsCount: 1, ratePerGuard: 0 }])}
                >
                  + Add Rate Line
                </Button>
              </div>
              {guardRates.length > 0 && (
                <Table size="sm" bordered className="small mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>Guard Type</th>
                      <th>Count</th>
                      <th>Rate / Guard (UGX)</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {guardRates.map((row, i) => (
                      <tr key={i}>
                        <td>
                          <Form.Select
                            size="sm"
                            value={row.guardType}
                            onChange={(e) => setGuardRates((prev) => prev.map((r, idx) => idx === i ? { ...r, guardType: e.target.value } : r))}
                          >
                            {GUARD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                          </Form.Select>
                        </td>
                        <td>
                          <Form.Control
                            size="sm" type="number" min={1}
                            value={row.guardsCount}
                            onChange={(e) => setGuardRates((prev) => prev.map((r, idx) => idx === i ? { ...r, guardsCount: parseInt(e.target.value, 10) || 1 } : r))}
                          />
                        </td>
                        <td>
                          <Form.Control
                            size="sm" type="number" min={0}
                            value={row.ratePerGuard}
                            onChange={(e) => setGuardRates((prev) => prev.map((r, idx) => idx === i ? { ...r, ratePerGuard: parseInt(e.target.value, 10) || 0 } : r))}
                          />
                        </td>
                        <td>
                          <Button
                            size="sm" variant="outline-danger"
                            onClick={() => setGuardRates((prev) => prev.filter((_, idx) => idx !== i))}
                          >
                            ×
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
              <Form.Text className="text-muted">
                Variable billing rates per guard type. Leave empty to use the flat Billing Per Guard rate above.
              </Form.Text>
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
