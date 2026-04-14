import { useState, useEffect } from 'react';
import { Alert, Button, Form, InputGroup, Modal, Spinner } from 'react-bootstrap';
import { useCreateContract, useUpdateContract } from '../../hooks/useContracts';
import type { ContractResponse } from '@stap/shared';

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

function diffDays(start: string, end: string): number | null {
  if (!start || !end) return null;
  const s = new Date(start);
  const e = new Date(end);
  const diff = Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : null;
}

function diffMonths(days: number): string {
  const months = Math.floor(days / 30);
  const remainder = days % 30;
  if (months === 0) return `${remainder} day(s)`;
  if (remainder === 0) return `${months} month(s)`;
  return `${months} month(s) ${remainder} day(s)`;
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
    contract ? (contract.status as 'DRAFT' | 'ACTIVE' | 'EXPIRING' | 'EXPIRED') : 'ACTIVE',
  );
  const [error, setError] = useState('');

  const billingPerGuard = parseBilling(billingDisplay);
  const guards = parseInt(guardsRequired, 10) || 0;
  const monthlyValue = guards * billingPerGuard;
  const duration = diffDays(contractStart, contractEnd);

  useEffect(() => {
    if (contractEnd && contractStart && contractEnd <= contractStart) {
      setError('End date must be after start date.');
    } else {
      setError('');
    }
  }, [contractStart, contractEnd]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (error) return;
    if (!contractStart || !contractEnd) return setError('Start and end dates are required.');
    if (billingPerGuard <= 0) return setError('Billing per guard must be positive.');
    if (guards < 1) return setError('Guards required must be at least 1.');

    const payload = {
      contractStart: `${contractStart}T00:00:00.000Z`,
      contractEnd: `${contractEnd}T23:59:59.999Z`,
      guardsRequired: guards,
      billingPerGuard,
      status,
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
            {/* Contract Start */}
            <div className="col-md-6">
              <Form.Label className="small fw-semibold">Contract Start *</Form.Label>
              <Form.Control
                type="date"
                value={contractStart}
                onChange={(e) => setContractStart(e.target.value)}
                required
              />
            </div>

            {/* Contract End */}
            <div className="col-md-6">
              <Form.Label className="small fw-semibold">Contract End *</Form.Label>
              <Form.Control
                type="date"
                value={contractEnd}
                min={contractStart || undefined}
                onChange={(e) => setContractEnd(e.target.value)}
                required
                isInvalid={Boolean(contractEnd && contractStart && contractEnd <= contractStart)}
              />
              {duration !== null && (
                <Form.Text className="text-muted">
                  Duration: {diffMonths(duration)}
                </Form.Text>
              )}
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

            {/* Status */}
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
              <Form.Text className="text-muted">Status is auto-computed on save based on dates.</Form.Text>
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
