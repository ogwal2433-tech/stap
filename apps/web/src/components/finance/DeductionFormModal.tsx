import { Modal, Form, Button, Row, Col, Alert } from 'react-bootstrap';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CreateDeductionSchema } from '@stap/shared';
import type { CreateDeductionInput } from '@stap/shared';
import { useCreateDeduction } from '../../hooks/useFinance';
import { useToast } from '../../context/ToastContext';

interface Props {
  guardId:   string;
  guardName?: string;
  onClose:   () => void;
}

const TYPES = [
  { value: 'UNIFORM_RECOVERY',         label: 'Uniform Recovery' },
  { value: 'DAMAGE_LOSS',              label: 'Damage / Loss' },
  { value: 'DISCIPLINARY_PENALTY',     label: 'Disciplinary Penalty' },
  { value: 'SALARY_ADVANCE_REPAYMENT', label: 'Salary Advance Repayment' },
  { value: 'LATE_COMING',              label: 'Late Coming' },
  { value: 'NSSF',                     label: 'NSSF Contribution' },
];

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

export default function DeductionFormModal({ guardId, guardName, onClose }: Props) {
  const { showToast } = useToast();
  const createDeduction = useCreateDeduction();

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateDeductionInput>({
    resolver: zodResolver(CreateDeductionSchema),
    defaultValues: {
      guardId,
      type:          'UNIFORM_RECOVERY',
      effectiveDate: firstOfNextMonth(),
    },
  });

  const watchedAmount        = useWatch({ control, name: 'amount' });
  const watchedEffectiveDate = useWatch({ control, name: 'effectiveDate' });

  const onSubmit = async (values: CreateDeductionInput) => {
    try {
      await createDeduction.mutateAsync({
        ...values,
        effectiveDate: new Date(values.effectiveDate).toISOString(),
      });
      showToast('Deduction added', 'success');
      onClose();
    } catch {
      showToast('Failed to add deduction', 'danger');
    }
  };

  const payrollMonth = formatMonth(watchedEffectiveDate);
  const amountDisplay = watchedAmount
    ? Number(watchedAmount).toLocaleString()
    : '—';

  return (
    <Modal show onHide={onClose}>
      <Modal.Header closeButton>
        <Modal.Title>Add Deduction</Modal.Title>
      </Modal.Header>
      <Form onSubmit={handleSubmit(onSubmit)}>
        <Modal.Body>
          <Row className="g-3">
            <Col md={12}>
              <Form.Group>
                <Form.Label>Type <span className="text-danger">*</span></Form.Label>
                <Form.Select {...register('type')} isInvalid={!!errors.type}>
                  {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </Form.Select>
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group>
                <Form.Label>Amount (UGX) <span className="text-danger">*</span></Form.Label>
                <Form.Control
                  type="number" min={1}
                  {...register('amount', { valueAsNumber: true })}
                  isInvalid={!!errors.amount}
                />
                <Form.Control.Feedback type="invalid">{errors.amount?.message}</Form.Control.Feedback>
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group>
                <Form.Label>
                  Effective From <span className="text-danger">*</span>
                  <span className="text-muted fw-normal ms-1" style={{ fontSize: '0.75rem' }}>
                    (applied in payroll from this date)
                  </span>
                </Form.Label>
                <Form.Control
                  type="date"
                  {...register('effectiveDate')}
                  isInvalid={!!errors.effectiveDate}
                />
                <Form.Control.Feedback type="invalid">{errors.effectiveDate?.message}</Form.Control.Feedback>
                <Form.Text className="text-muted">
                  Deductions set to {payrollMonth} will be applied in the {payrollMonth} payroll.
                </Form.Text>
              </Form.Group>
            </Col>
            <Col md={12}>
              <Form.Group>
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
              This deduction of <strong>UGX {amountDisplay}</strong> will be automatically
              deducted from <strong>{guardName ?? 'this guard'}</strong>'s salary in
              the <strong>{payrollMonth}</strong> payroll run.
            </small>
          </Alert>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button variant="danger" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Add Deduction'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
