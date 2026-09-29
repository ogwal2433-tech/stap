import { useState } from 'react';
import { Modal, Form, Button, Row, Col, Alert, InputGroup } from 'react-bootstrap';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CreateDeductionSchema } from '@security360/shared';
import type { CreateDeductionInput, DeductionTypeResponse } from '@security360/shared';
import { useCreateDeduction } from '../../hooks/useFinance';
import { useDeductionTypes } from '../../hooks/useSettings';
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

export default function DeductionFormModal({ guardId, guardName, onClose }: Props) {
  const { showToast } = useToast();
  const createDeduction = useCreateDeduction();
  const { data: deductionTypes = [], isLoading: typesLoading } = useDeductionTypes(true);

  const [selectedType, setSelectedType] = useState<DeductionTypeResponse | null>(null);

  function handleTypeChange(code: string) {
    const found = deductionTypes.find((t) => t.code === code) ?? null;
    setSelectedType(found);

    // Fill the amount from the type's default, which is what the settings page
    // tells administrators a default amount does. An amount already typed is
    // left alone — the "Reset to default" link below puts it back.
    const current = getValues('amount');
    if (found?.defaultAmount != null && !current) {
      setValue('amount', found.defaultAmount, { shouldValidate: true });
    }
  }

  const {
    register,
    control,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<CreateDeductionInput>({
    resolver: zodResolver(CreateDeductionSchema),
    defaultValues: {
      guardId,
      // No default type: deduction types are configurable, and the one that
      // used to be hardcoded here could be deactivated or deleted — leaving the
      // dropdown blank while the form still held that value, and recording a
      // charge against a retired type on submit.
      type:          '',
      effectiveDate: firstOfNextMonth(),
    },
  });

  const watchedAmount        = useWatch({ control, name: 'amount' });
  const watchedEffectiveDate = useWatch({ control, name: 'effectiveDate' });

  const onSubmit = async (values: CreateDeductionInput) => {
    try {
      await createDeduction.mutateAsync(values);
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
              <Form.Group controlId="deduction-type">
                <Form.Label>Type <span className="text-danger">*</span></Form.Label>
                <Form.Select
                  {...register('type')}
                  disabled={typesLoading}
                  isInvalid={!!errors.type}
                  onChange={(e) => {
                    register('type').onChange(e);
                    handleTypeChange(e.target.value);
                  }}
                >
                  <option value="">
                    {typesLoading ? 'Loading...' : 'Select deduction type'}
                  </option>
                  {deductionTypes.map((t) => (
                    <option key={t.id} value={t.code}>
                      {t.name}{t.isAutomatic ? ' (system)' : ''}
                    </option>
                  ))}
                </Form.Select>
                {errors.type && (
                  <Form.Control.Feedback type="invalid">{errors.type.message}</Form.Control.Feedback>
                )}
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group controlId="deduction-amount">
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
                {selectedType?.defaultAmount != null && (
                  <Form.Text className="text-muted">
                    Default: UGX {selectedType.defaultAmount.toLocaleString()}.{' '}
                    <span
                      role="button"
                      className="text-primary text-decoration-underline"
                      style={{ cursor: 'pointer' }}
                      onClick={() => setValue('amount', selectedType.defaultAmount!)}
                    >
                      Reset to default
                    </span>
                  </Form.Text>
                )}
                {selectedType?.description && (
                  <Form.Text className="text-muted d-block">{selectedType.description}</Form.Text>
                )}
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
              <Form.Group controlId="deduction-description">
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
