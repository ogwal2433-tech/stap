import { useState } from 'react';
import { Modal, Form, Button, Row, Col, Alert, InputGroup } from 'react-bootstrap';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CreateDeductionSchema } from '@stap/shared';
import type { CreateDeductionInput, DeductionTypeResponse } from '@stap/shared';
import { useCreateDeduction } from '../../hooks/useFinance';
import { useDeductionTypes } from '../../hooks/useSettings';
import { useToast } from '../../context/ToastContext';

interface Props {
  guardId: string;
  prefilledType?: DeductionTypeResponse | null;
  onClose: () => void;
}

export default function DeductionFormModal({ guardId, prefilledType, onClose }: Props) {
  const { showToast } = useToast();
  const createDeduction = useCreateDeduction();
  const { data: deductionTypes = [], isLoading: typesLoading } = useDeductionTypes(true);

  const [selectedType, setSelectedType] = useState<DeductionTypeResponse | null>(prefilledType ?? null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateDeductionInput>({
    resolver: zodResolver(CreateDeductionSchema),
    defaultValues: {
      guardId,
      type:   prefilledType?.code ?? '',
      amount: prefilledType?.defaultAmount ?? undefined,
    },
  });

  const onSubmit = async (values: CreateDeductionInput) => {
    try {
      await createDeduction.mutateAsync(values);
      showToast('Deduction added', 'success');
      onClose();
    } catch {
      showToast('Failed to add deduction', 'danger');
    }
  };

  const handleTypeChange = (code: string) => {
    const found = deductionTypes.find((t) => t.code === code) ?? null;
    setSelectedType(found);
    if (found?.defaultAmount != null) {
      setValue('amount', found.defaultAmount);
    } else {
      setValue('amount', undefined as any);
    }
  };

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
              <Form.Group>
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
                <Form.Label>Effective Date <span className="text-danger">*</span></Form.Label>
                <Form.Control
                  type="date"
                  {...register('effectiveDate', {
                    setValueAs: (v: string) => (v ? new Date(v).toISOString() : v),
                  })}
                  isInvalid={!!errors.effectiveDate}
                />
                <Form.Control.Feedback type="invalid">{errors.effectiveDate?.message}</Form.Control.Feedback>
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
          <Alert variant="info" className="mt-3 mb-0 small">
            This deduction of{' '}
            {selectedType ? (
              <>
                UGX {'{amount}'} — <strong>{selectedType.name}</strong>
              </>
            ) : 'the selected type'}{' '}
            will be applied in the next payroll run.
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
