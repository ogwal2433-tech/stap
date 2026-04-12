import { Alert, Button, Form, Modal, Row, Col } from 'react-bootstrap';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CreateDisciplinarySchema } from '@stap/shared';
import { useCreateDisciplinaryRecord } from '../../hooks/useDisciplinary';
import { useToast } from '../../context/ToastContext';
import type { DisciplinaryResponse } from '@stap/shared';
import { z } from 'zod';

const FormSchema = CreateDisciplinarySchema.omit({ guardId: true });
type FormValues = z.infer<typeof FormSchema>;

interface Props {
  guardId: string;
  guardName: string;
  existingRecords: DisciplinaryResponse[];
  onClose: () => void;
  onSuccess: () => void;
}

export default function DisciplinaryRecordModal({
  guardId,
  guardName,
  existingRecords,
  onClose,
  onSuccess,
}: Props) {
  const { showToast } = useToast();
  const createRecord = useCreateDisciplinaryRecord();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      incidentDate: new Date().toISOString().split('T')[0] + 'T00:00:00.000Z',
      type: 'VERBAL_WARNING',
    },
  });

  const selectedType = watch('type');

  const hasVerbalWarning = existingRecords.some((r) => r.type === 'VERBAL_WARNING');
  const showEscalationWarning =
    selectedType === 'WRITTEN_WARNING' && !hasVerbalWarning;

  const onSubmit = async (values: FormValues) => {
    try {
      await createRecord.mutateAsync({
        guardId,
        data: {
          ...values,
          incidentDate: new Date(values.incidentDate).toISOString(),
        },
      });
      showToast('Disciplinary record saved', 'success');
      onSuccess();
      onClose();
    } catch {
      showToast('Failed to save record', 'danger');
    }
  };

  return (
    <Modal show onHide={onClose} size="lg">
      <Modal.Header closeButton>
        <Modal.Title>Add Disciplinary Record — {guardName}</Modal.Title>
      </Modal.Header>
      <Form onSubmit={handleSubmit(onSubmit)}>
        <Modal.Body>
          <Row className="g-3">
            <Col md={6}>
              <Form.Group>
                <Form.Label>Incident Date <span className="text-danger">*</span></Form.Label>
                <Form.Control
                  type="date"
                  {...register('incidentDate', {
                    setValueAs: (v: string) => v ? new Date(v).toISOString() : '',
                  })}
                  isInvalid={!!errors.incidentDate}
                />
                <Form.Control.Feedback type="invalid">{errors.incidentDate?.message}</Form.Control.Feedback>
              </Form.Group>
            </Col>

            <Col md={6}>
              <Form.Group>
                <Form.Label>Type <span className="text-danger">*</span></Form.Label>
                <Form.Select {...register('type')} isInvalid={!!errors.type}>
                  <option value="VERBAL_WARNING">Verbal Warning</option>
                  <option value="WRITTEN_WARNING">Written Warning</option>
                  <option value="SUSPENSION">Suspension</option>
                  <option value="TERMINATION">Termination</option>
                </Form.Select>
                <Form.Control.Feedback type="invalid">{errors.type?.message}</Form.Control.Feedback>
              </Form.Group>
            </Col>

            {showEscalationWarning && (
              <Col md={12}>
                <Alert variant="warning" className="py-2 mb-0">
                  <i className="bi bi-exclamation-triangle-fill me-1" />
                  No verbal warning on record. Are you sure you want to issue a written warning directly?
                </Alert>
              </Col>
            )}

            <Col md={12}>
              <Form.Group>
                <Form.Label>Reason <span className="text-danger">*</span></Form.Label>
                <Form.Control
                  as="textarea"
                  rows={4}
                  placeholder="Describe the incident or misconduct in detail…"
                  {...register('reason')}
                  isInvalid={!!errors.reason}
                />
                <Form.Control.Feedback type="invalid">{errors.reason?.message}</Form.Control.Feedback>
              </Form.Group>
            </Col>

            <Col md={12}>
              <Form.Group>
                <Form.Label>Outcome / Action Taken <span className="text-danger">*</span></Form.Label>
                <Form.Control
                  as="textarea"
                  rows={3}
                  placeholder="Describe what was decided or communicated to the guard…"
                  {...register('outcome')}
                  isInvalid={!!errors.outcome}
                />
                <Form.Control.Feedback type="invalid">{errors.outcome?.message}</Form.Control.Feedback>
              </Form.Group>
            </Col>

            <Col md={12}>
              <Alert variant="info" className="py-2 mb-0 small">
                <i className="bi bi-info-circle me-1" />
                After saving, you can generate a formal letter for this record from the{' '}
                <strong>Generate Letter</strong> button.
              </Alert>
            </Col>
          </Row>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            style={{ backgroundColor: '#1B3A6B', borderColor: '#1B3A6B' }}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Saving…' : 'Save Record'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
