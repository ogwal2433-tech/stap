import { Modal, Form, Button, Alert } from 'react-bootstrap';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ApproveRequisitionSchema } from '@stap/shared';
import type { ApproveRequisitionInput, RequisitionResponse } from '@stap/shared';
import { useApproveRequisition } from '../../hooks/useRequisitions';
import { useToast } from '../../context/ToastContext';

interface Props {
  requisition: RequisitionResponse;
  action: 'APPROVE' | 'REJECT';
  onClose: () => void;
}

export default function ApprovalModal({ requisition, action, onClose }: Props) {
  const { showToast } = useToast();
  const approve = useApproveRequisition();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ApproveRequisitionInput>({
    resolver: zodResolver(ApproveRequisitionSchema),
    defaultValues: { action },
  });

  const onSubmit = async (values: ApproveRequisitionInput) => {
    try {
      await approve.mutateAsync({ id: requisition.id, data: { ...values, action } });
      showToast(action === 'APPROVE' ? 'Requisition approved' : 'Requisition rejected', 'success');
      onClose();
    } catch {
      showToast('Action failed', 'danger');
    }
  };

  return (
    <Modal show onHide={onClose}>
      <Modal.Header closeButton>
        <Modal.Title>{action === 'APPROVE' ? 'Approve' : 'Reject'} Requisition</Modal.Title>
      </Modal.Header>
      <Form onSubmit={handleSubmit(onSubmit)}>
        <Modal.Body>
          <Alert variant={action === 'APPROVE' ? 'success' : 'danger'} className="small">
            <strong>{requisition.category}</strong> — {requisition.description}
            <div className="mt-1">Est. Total: <strong>UGX {requisition.estimatedTotal.toLocaleString()}</strong></div>
          </Alert>

          {action === 'REJECT' && (
            <Form.Group className="mt-3">
              <Form.Label>Rejection Reason <span className="text-danger">*</span></Form.Label>
              <Form.Control
                as="textarea" rows={3}
                {...register('rejectionReason')}
                isInvalid={!!errors.rejectionReason}
              />
              <Form.Control.Feedback type="invalid">{errors.rejectionReason?.message}</Form.Control.Feedback>
            </Form.Group>
          )}

          <Form.Group className="mt-3">
            <Form.Label>Comments <span className="text-muted small">(optional)</span></Form.Label>
            <Form.Control as="textarea" rows={2} {...register('comments')} />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button
            type="submit"
            variant={action === 'APPROVE' ? 'success' : 'danger'}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Processing…' : action === 'APPROVE' ? 'Confirm Approval' : 'Confirm Rejection'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
