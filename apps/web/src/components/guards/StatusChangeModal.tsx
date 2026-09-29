import { useState } from 'react';
import { Alert, Button, Form, Modal, Spinner } from 'react-bootstrap';
import { useUpdateGuardStatus } from '../../hooks/useGuards';
import { useToast } from '../../context/ToastContext';
import { GUARD_STATUS_CONFIG, guardStatusLabel, EXITED_STATUSES, type GuardEmploymentStatus } from '@security360/shared';

interface StatusChangeModalProps {
  guardId: string;
  guardName: string;
  currentStatus: string;
  targetStatus: GuardEmploymentStatus;
  onClose: () => void;
  onSuccess: () => void;
}

const CONFIRM_VARIANT: Record<string, string> = Object.fromEntries(
  Object.entries(GUARD_STATUS_CONFIG).map(([value, cfg]) => [value, cfg.colour]),
);

export default function StatusChangeModal({
  guardId,
  guardName,
  targetStatus,
  onClose,
  onSuccess,
}: StatusChangeModalProps) {
  const [reason, setReason] = useState('');
  const { mutateAsync, isPending } = useUpdateGuardStatus();
  const { showToast } = useToast();

  const handleConfirm = async () => {
    await mutateAsync({ id: guardId, status: targetStatus, reason });
    showToast(`${guardName} is now ${guardStatusLabel(targetStatus)}`, 'success');
    onSuccess();
    onClose();
  };

  return (
    <Modal show onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: '1.1rem' }}>
          Set {guardName} to {guardStatusLabel(targetStatus)}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="text-muted small">{GUARD_STATUS_CONFIG[targetStatus]?.description}</p>

        {targetStatus === 'ON_LEAVE' && (
          <Alert variant="info" className="py-2 small">
            {guardName} will be excluded from new rosters until set back to Active,
            but stays on the payroll run.
          </Alert>
        )}
        {targetStatus === 'SUSPENDED' && (
          <Alert variant="warning" className="py-2 small">
            {guardName} cannot be deployed while suspended and is removed from the payroll run.
          </Alert>
        )}
        {EXITED_STATUSES.includes(targetStatus) && (
          <Alert variant="danger" className="py-2 small">
            <i className="bi bi-exclamation-triangle-fill me-1" />
            This ends {guardName}&apos;s employment — their contract end date is set to today
            and they can no longer be deployed, transferred or promoted. Reversing it requires
            a re-instatement.
          </Alert>
        )}
        <Form.Group>
          <Form.Label>
            Reason <span className="text-danger">*</span>
          </Form.Label>
          <Form.Control
            as="textarea"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Provide a detailed reason..."
            isInvalid={reason.trim().length > 0 && reason.trim().length < 10}
          />
          <Form.Control.Feedback type="invalid">
            Reason must be at least 10 characters.
          </Form.Control.Feedback>
        </Form.Group>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
        <Button
          variant={CONFIRM_VARIANT[targetStatus] ?? 'primary'}
          onClick={handleConfirm}
          disabled={isPending || reason.trim().length < 10}
        >
          {isPending ? (
            <Spinner as="span" animation="border" size="sm" className="me-2" />
          ) : null}
          Confirm
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
