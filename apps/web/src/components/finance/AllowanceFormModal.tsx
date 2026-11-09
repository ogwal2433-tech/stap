import { useState } from 'react';
import { Modal, Form, Button, Row, Col, Alert, InputGroup } from 'react-bootstrap';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CreateAllowanceSchema } from '@security360/shared';
import type { CreateAllowanceInput } from '@security360/shared';
import { useCreateAllowance } from '../../hooks/useFinance';
import { useToast } from '../../context/ToastContext';

interface Props {
  guardId:   string;
  guardName?: string;
  onClose:   () => void;
}

function firstOfNextMonth(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 1)
    .toISOString()
    .split('T')[0];
}

function formatMonth(dateStr: string): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

const ALLOWANCE_TYPES = [
  { code: 'INCHARGE', label: 'Incharge Allowance' },
  { code: 'TENURE_2YR', label: 'Tenure Benefit (>2 years)' },
  { code: 'HOUSING', label: 'Housing Allowance' },
  { code: 'TRANSPORT', label: 'Transport Allowance' },
  { code: 'OTHER', label: 'Other' },
];

export default function AllowanceFormModal({ guardId, guardName, onClose }: Props) {
  const { showToast } = useToast();
  const createAllowance = useCreateAllowance();
  const [selectedType, setSelectedType] = useState('');

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<CreateAllowanceInput>({
    resolver: zodResolver(CreateAllowanceSchema),
    defaultValues: {
      guardId,
      type: '',
      effectiveDate: firstOfNextMonth(),
    },
  });

  const onSubmit = async (values: CreateAllowanceInput) => {
    try {
      await createAllowance.mutateAsync(values);
      showToast('Allowance added', 'success');
      onClose();
    } catch {
      showToast('Failed to add allowance', 'danger');
    }
  };

  const watchedEffectiveDate = (getValues('effectiveDate') as string) || firstOfNextMonth();
  const payrollMonth = formatMonth(watchedEffectiveDate);

  return (
    <Modal show onHide={onClose}>
      <Modal.Header closeButton>
        <Modal.Title>Add Allowance / Benefit</Modal.Title>
      </Modal.Header>
      <Form onSubmit={handleSubmit(onSubmit)}>
        <Modal.Body>
          <Row className="g-3">
            <Col md={12}>
              <Form.Group controlId="allowance-type">
                <Form.Label>Type <span className="text-danger">*</span></Form.Label>
                <Form.Select
                  {...register('type')}
                  isInvalid={!!errors.type}
                  onChange={(e) => {
                    register('type').onChange(e);
                    setSelectedType(e.target.value);
                  }}
                >
                  <option value="">Select allowance type</option>
                  {ALLOWANCE_TYPES.map((t) => (
                    <option key={t.code} value={t.code}>{t.label}</option>
                  ))}
                </Form.Select>
                {errors.type && (
                  <Form.Control.Feedback type="invalid">{errors.type.message}</Form.Control.Feedback>
                )}
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group controlId="allowance-amount">
                <Form.Label>Amount (UGX) <span className="text-danger">*</span></Form.Label>
                <InputGroup>
                  <InputGroup.Text>UGX</InputGroup.Text>
                  <Form.Control
                    type="number" min={1}
                    {...register('amount', { valueAsNumber: true })}
                    isInvalid={!!errors.amount}
                  />
                  <Form.Control.Feedback type="invalid">{errors.amount?.message}</Form.Control.Feedback>
                </InputGroup>
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group>
                <Form.Label>
                  Effective From <span className="text-danger">*</span>
                </Form.Label>
                <Form.Control
                  type="date"
                  {...register('effectiveDate')}
                  isInvalid={!!errors.effectiveDate}
                />
                <Form.Control.Feedback type="invalid">{errors.effectiveDate?.message}</Form.Control.Feedback>
                <Form.Text className="text-muted">
                  Allowances set to {payrollMonth} will be applied in the {payrollMonth} payroll.
                </Form.Text>
              </Form.Group>
            </Col>
            <Col md={12}>
              <Form.Group controlId="allowance-description">
                <Form.Label>Description <span className="text-danger">*</span></Form.Label>
                <Form.Control
                  as="textarea" rows={2}
                  {...register('description')}
                  isInvalid={!!errors.description}
                />
                <Form.Control.Feedback type="invalid">{errors.description?.message}</Form.Control.Feedback>
              </Form.Group>
            </Col>
          </Row>

          <Alert variant="info" className="mt-3 mb-0">
            <small>
              This allowance will be automatically added to <strong>{guardName ?? 'this guard'}</strong>'s
              salary in the <strong>{payrollMonth}</strong> payroll run.
            </small>
          </Alert>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button variant="success" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Add Allowance'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
