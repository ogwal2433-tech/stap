import { useState } from 'react';
import { Alert, Button, Form, Modal, Spinner } from 'react-bootstrap';
import { useUpdateGuardStatus } from '../../hooks/useGuards';
import { useToast } from '../../context/ToastContext';

interface StatusChangeModalProps {
  guardId: string;
  guardName: string;
  currentStatus: string;
  targetStatus: 'ACTIVE' | 'SUSPENDED' | 'TERMINATED';
  onClose: () => void;
  onSuccess: () => void;
}

const CONFIRM_VARIANT: Record<string, string> = {
  ACTIVE: 'success',
  SUSPENDED: 'warning',
  TERMINATED: 'danger',
};

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
    showToast(`${guardName} status updated to ${targetStatus}`, 'success');
    onSuccess();
    onClose();
  };

  return (
    <Modal show onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title>
          Confirm: {targetStatus} — {guardName}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {targetStatus === 'SUSPENDED' && (
          <Alert variant="warning">
            The guard will be unable to be deployed while suspended.
          </Alert>
        )}
        {targetStatus === 'TERMINATED' && (
          <Alert variant="danger">
            <i className="bi bi-exclamation-triangle-fill me-1" />This action will terminate the guard&apos;s contract. This cannot be easily
            reversed.
          </Alert>
        )}
        <Form.Group>
          <Form.Label>
            Reason for {targetStatus} <span className="text-danger">*</span>
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
          variant={CONFIRM_VARIANT[targetStatus]}
          onClick={handleConfirm}
          disabled={isPending || reason.trim().length < 10}
        >
          {isPending ? (
            <Spinner as="span" animation="border" size="sm" className="me-2" />
          ) : null}
          Confirm {targetStatus}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
