import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Breadcrumb, Button, ButtonGroup, Card, Col, Form, Row, Spinner,
} from 'react-bootstrap';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CreateClientSchema } from '@stap/shared';
import { useClient, useCreateClient, useUpdateClient } from '../../hooks/useClients';
import { useToast } from '../../context/ToastContext';
import type { CreateClientInput } from '@stap/shared';

const QUICK_TERMS = [7, 14, 30, 45, 60];

export default function ClientFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const isEdit = Boolean(id);

  const { data: existing, isLoading } = useClient(id ?? '');
  const createClient = useCreateClient();
  const updateClient = useUpdateClient();

  const [sameAddress, setSameAddress] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateClientInput>({
    resolver: zodResolver(CreateClientSchema),
    defaultValues: { contractStatus: 'ACTIVE', billingTerms: 30 },
  });

  const physicalAddress = watch('physicalAddress');

  useEffect(() => {
    if (existing) {
      reset({
        clientName: existing.clientName,
        contactPerson: existing.contactPerson,
        contactPhone: existing.contactPhone,
        email: existing.email ?? undefined,
        physicalAddress: existing.physicalAddress,
        billingAddress: existing.billingAddress ?? undefined,
        billingTerms: existing.billingTerms,
        contractStatus: existing.contractStatus,
      });
    }
  }, [existing, reset]);

  useEffect(() => {
    if (sameAddress) {
      setValue('billingAddress', physicalAddress);
    }
  }, [sameAddress, physicalAddress, setValue]);

  const onSubmit = async (data: CreateClientInput) => {
    try {
      if (isEdit && id) {
        await updateClient.mutateAsync({ id, data });
        showToast('Client updated', 'success');
        navigate(`/clients/${id}`);
      } else {
        const created = await createClient.mutateAsync(data);
        showToast('Client created', 'success');
        navigate(`/clients/${created.id}`);
      }
    } catch {
      showToast('Failed to save client', 'danger');
    }
  };

  if (isEdit && isLoading) {
    return (
      <div className="py-5 text-center">
        <Spinner animation="border" variant="primary" />
      </div>
    );
  }

  return (
    <div>
      <Breadcrumb className="mb-3 small">
        <Breadcrumb.Item onClick={() => navigate('/dashboard')} style={{ cursor: 'pointer' }}>Dashboard</Breadcrumb.Item>
        <Breadcrumb.Item onClick={() => navigate('/clients')} style={{ cursor: 'pointer' }}>Clients</Breadcrumb.Item>
        <Breadcrumb.Item active>{isEdit ? 'Edit Client' : 'New Client'}</Breadcrumb.Item>
      </Breadcrumb>

      <div className="d-flex justify-content-between align-items-center mb-4">
        <h4 className="fw-bold mb-0" style={{ color: '#1B3A6B' }}>
          {isEdit ? `Edit: ${existing?.clientName}` : 'Add New Client'}
        </h4>
        <Button variant="outline-secondary" size="sm" onClick={() => navigate(isEdit ? `/clients/${id}` : '/clients')}>
          ← Cancel
        </Button>
      </div>

      <Form onSubmit={handleSubmit(onSubmit)}>
        {/* Section 1 — Company Information */}
        <Card className="border-0 shadow-sm mb-4">
          <Card.Header className="bg-white fw-semibold" style={{ color: '#1B3A6B' }}>
            Company Information
          </Card.Header>
          <Card.Body>
            <Row className="g-3">
              <Col md={12}>
                <Form.Group>
                  <Form.Label>Client / Company Name <span className="text-danger">*</span></Form.Label>
                  <Form.Control
                    size="lg"
                    {...register('clientName')}
                    isInvalid={!!errors.clientName}
                    placeholder="e.g. Kampala Capital City Authority"
                  />
                  <Form.Control.Feedback type="invalid">{errors.clientName?.message}</Form.Control.Feedback>
                </Form.Group>
              </Col>

              <Col md={12}>
                <Form.Group>
                  <Form.Label>Physical Address <span className="text-danger">*</span></Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={2}
                    {...register('physicalAddress')}
                    isInvalid={!!errors.physicalAddress}
                    placeholder="e.g. City Hall, Parliament Avenue, Kampala"
                  />
                  <Form.Control.Feedback type="invalid">{errors.physicalAddress?.message}</Form.Control.Feedback>
                </Form.Group>
              </Col>

              <Col md={12}>
                <div className="d-flex align-items-center gap-2 mb-2">
                  <Form.Label className="mb-0">Billing Address <span className="text-muted small">(optional)</span></Form.Label>
                  <Form.Check
                    type="checkbox"
                    label="Same as physical address"
                    className="small ms-auto"
                    checked={sameAddress}
                    onChange={(e) => setSameAddress(e.target.checked)}
                  />
                </div>
                <Form.Control
                  as="textarea"
                  rows={2}
                  {...register('billingAddress')}
                  isInvalid={!!errors.billingAddress}
                  disabled={sameAddress}
                  placeholder="Leave blank if same as physical address"
                />
                <Form.Control.Feedback type="invalid">{errors.billingAddress?.message}</Form.Control.Feedback>
              </Col>
            </Row>
          </Card.Body>
        </Card>

        {/* Section 2 — Contact Details */}
        <Card className="border-0 shadow-sm mb-4">
          <Card.Header className="bg-white fw-semibold" style={{ color: '#1B3A6B' }}>
            Contact Details
          </Card.Header>
          <Card.Body>
            <Row className="g-3">
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Contact Person <span className="text-danger">*</span></Form.Label>
                  <Form.Control
                    {...register('contactPerson')}
                    isInvalid={!!errors.contactPerson}
                    placeholder="e.g. James Sserwanga"
                  />
                  <Form.Control.Feedback type="invalid">{errors.contactPerson?.message}</Form.Control.Feedback>
                </Form.Group>
              </Col>

              <Col md={6}>
                <Form.Group>
                  <Form.Label>Contact Phone <span className="text-danger">*</span></Form.Label>
                  <Form.Control
                    type="tel"
                    {...register('contactPhone')}
                    isInvalid={!!errors.contactPhone}
                    placeholder="+256…"
                  />
                  <Form.Control.Feedback type="invalid">{errors.contactPhone?.message}</Form.Control.Feedback>
                </Form.Group>
              </Col>

              <Col md={6}>
                <Form.Group>
                  <Form.Label>Email <span className="text-muted small">(optional)</span></Form.Label>
                  <Form.Control
                    type="email"
                    {...register('email')}
                    isInvalid={!!errors.email}
                    placeholder="e.g. security@company.go.ug"
                  />
                  <Form.Control.Feedback type="invalid">{errors.email?.message}</Form.Control.Feedback>
                </Form.Group>
              </Col>
            </Row>
          </Card.Body>
        </Card>

        {/* Section 3 — Contract & Billing */}
        <Card className="border-0 shadow-sm mb-4">
          <Card.Header className="bg-white fw-semibold" style={{ color: '#1B3A6B' }}>
            Contract &amp; Billing
          </Card.Header>
          <Card.Body>
            <Row className="g-3">
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Contract Status</Form.Label>
                  <Form.Select {...register('contractStatus')} isInvalid={!!errors.contractStatus}>
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                    <option value="EXPIRED">Expired</option>
                  </Form.Select>
                  <Form.Control.Feedback type="invalid">{errors.contractStatus?.message}</Form.Control.Feedback>
                </Form.Group>
              </Col>

              <Col md={6}>
                <Form.Group>
                  <Form.Label>Billing Terms (days) <span className="text-danger">*</span></Form.Label>
                  <Form.Control
                    type="number"
                    min={1}
                    max={90}
                    {...register('billingTerms', { valueAsNumber: true })}
                    isInvalid={!!errors.billingTerms}
                  />
                  <Form.Text className="text-muted">Invoice payment due within X days of issue</Form.Text>
                  <Form.Control.Feedback type="invalid">{errors.billingTerms?.message}</Form.Control.Feedback>
                  <div className="d-flex flex-wrap gap-1 mt-2">
                    {QUICK_TERMS.map((days) => (
                      <Button
                        key={days}
                        size="sm"
                        variant="outline-secondary"
                        type="button"
                        onClick={() => setValue('billingTerms', days)}
                      >
                        {days} days
                      </Button>
                    ))}
                  </div>
                </Form.Group>
              </Col>
            </Row>
          </Card.Body>
        </Card>

        <div className="d-flex justify-content-end gap-2">
          <Button variant="secondary" onClick={() => navigate(isEdit ? `/clients/${id}` : '/clients')}>
            Cancel
          </Button>
          <Button
            type="submit"
            style={{ backgroundColor: '#1B3A6B', borderColor: '#1B3A6B' }}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Client'}
          </Button>
        </div>
      </Form>
    </div>
  );
}
