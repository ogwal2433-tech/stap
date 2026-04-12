import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert, Breadcrumb, Button, Card, Col, Form, InputGroup, Row, Spinner,
} from 'react-bootstrap';
import { useGuard, useCreateGuard, useUpdateGuard } from '../../hooks/useGuards';
import { guardsApi } from '../../lib/guards.api';
import { useAuth } from '../../context/AuthContext';
import RoleGuard from '../../components/RoleGuard';
import InitialsAvatar from '../../components/ui/InitialsAvatar';
import { useToast } from '../../context/ToastContext';
import { CreateGuardSchema, GUARD_WRITE_ROLES, type CreateGuardInput, type UserRole } from '@stap/shared';

function maxDobDate(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 18);
  return d.toISOString().split('T')[0];
}

function calcAge(dob: string): number | null {
  if (!dob) return null;
  const diff = Date.now() - new Date(dob).getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}

export default function GuardFormPage() {
  const { id } = useParams<{ id?: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user } = useAuth();

  const { data: existing, isLoading: loadingExisting } = useGuard(id ?? '');
  const { mutateAsync: createGuard } = useCreateGuard();
  const { mutateAsync: updateGuard } = useUpdateGuard();

  const [apiError, setApiError] = useState('');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateGuardInput>({
    resolver: zodResolver(CreateGuardSchema),
  });

  // Populate form in edit mode
  useEffect(() => {
    if (isEdit && existing) {
      reset({
        firstName: existing.firstName,
        lastName: existing.lastName,
        otherNames: existing.otherNames ?? undefined,
        nationalId: existing.nationalId,
        phone: existing.phone,
        dateOfBirth: existing.dateOfBirth,
        nextOfKinName: existing.nextOfKinName,
        nextOfKinPhone: existing.nextOfKinPhone,
        bankName: existing.bankName ?? undefined,
        salaryRate: existing.salaryRate,
        contractStart: existing.contractStart,
        contractEnd: existing.contractEnd ?? undefined,
        psoCertNumber: existing.psoCertNumber ?? undefined,
      });
      if (existing.photoUrl) setPhotoPreview(existing.photoUrl);
    }
  }, [isEdit, existing, reset]);

  const dobValue = watch('dateOfBirth');
  const age = dobValue ? calcAge(dobValue.split('T')[0]) : null;

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;

    // Immediate preview
    const reader = new FileReader();
    reader.onload = (ev) => setPhotoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    // Upload
    setPhotoUploading(true);
    try {
      const result = await guardsApi.uploadPhoto(id, file);
      setPhotoPreview(result.photoUrl);
      showToast('Photo updated', 'success');
    } finally {
      setPhotoUploading(false);
    }
  };

  const onSubmit = async (data: CreateGuardInput) => {
    setApiError('');
    try {
      if (isEdit && id) {
        await updateGuard({ id, data });
        showToast('Changes saved', 'success');
      } else {
        const created = await createGuard(data);
        showToast('Guard created successfully', 'success');
        navigate(`/guards/${created.id}`, { replace: true });
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: { error?: string } } };
      if (axiosErr.response?.status === 409) {
        setError('nationalId', { message: 'A guard with this National ID already exists' });
      } else {
        setApiError(axiosErr.response?.data?.error ?? 'An unexpected error occurred');
      }
    }
  };

  if (isEdit && loadingExisting) {
    return (
      <div className="d-flex justify-content-center py-5">
        <Spinner animation="border" variant="primary" />
      </div>
    );
  }

  const fullName = existing ? existing.fullName : 'New Guard';

  return (
    <div>
      <Breadcrumb className="mb-4 small">
        <Breadcrumb.Item onClick={() => navigate('/dashboard')} style={{ cursor: 'pointer' }}>
          Dashboard
        </Breadcrumb.Item>
        <Breadcrumb.Item onClick={() => navigate('/guards')} style={{ cursor: 'pointer' }}>
          Guards
        </Breadcrumb.Item>
        <Breadcrumb.Item active>
          {isEdit ? `Edit: ${fullName}` : 'Create New Guard'}
        </Breadcrumb.Item>
      </Breadcrumb>

      {apiError && (
        <Alert variant="danger" className="mb-3">
          {apiError}
        </Alert>
      )}

      {Object.keys(errors).length > 0 && (
        <Alert variant="warning" className="mb-3 small">
          Please fix the errors below before submitting.
        </Alert>
      )}

      <Form noValidate onSubmit={handleSubmit(onSubmit)}>
        <Row className="g-4">
          {/* Photo card */}
          <Col lg={4}>
            <Card className="border-0 shadow-sm h-100">
              <Card.Header className="bg-white fw-semibold">Photo</Card.Header>
              <Card.Body className="d-flex flex-column align-items-center gap-3 py-4">
                <div style={{ position: 'relative' }}>
                  {photoPreview ? (
                    <img
                      src={photoPreview}
                      alt="Guard photo"
                      width={160}
                      height={160}
                      className="rounded-circle object-fit-cover"
                    />
                  ) : (
                    <InitialsAvatar name={fullName} size={160} />
                  )}
                  {photoUploading && (
                    <div
                      style={{
                        position: 'absolute', inset: 0, borderRadius: '50%',
                        background: 'rgba(0,0,0,0.4)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <Spinner animation="border" variant="light" />
                    </div>
                  )}
                </div>
                {isEdit && (
                  <>
                    <Button
                      variant="outline-secondary"
                      size="sm"
                      onClick={() => photoInputRef.current?.click()}
                      disabled={photoUploading}
                    >
                      Change Photo
                    </Button>
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/jpeg,image/png"
                      className="d-none"
                      onChange={handlePhotoSelect}
                    />
                  </>
                )}
                {!isEdit && (
                  <p className="text-muted small text-center">
                    Photo can be uploaded after saving the guard profile.
                  </p>
                )}
              </Card.Body>
            </Card>
          </Col>

          {/* Form sections */}
          <Col lg={8} className="d-flex flex-column gap-4">
            {/* Section 1 — Personal Information */}
            <Card className="border-0 shadow-sm">
              <Card.Header className="bg-white fw-semibold">Personal Information</Card.Header>
              <Card.Body>
                <Row className="g-3">
                  <Col md={4}>
                    <Form.Group>
                      <Form.Label>First Name *</Form.Label>
                      <Form.Control
                        {...register('firstName')}
                        isInvalid={!!errors.firstName}
                        placeholder="John"
                      />
                      <Form.Control.Feedback type="invalid">
                        {errors.firstName?.message}
                      </Form.Control.Feedback>
                    </Form.Group>
                  </Col>
                  <Col md={4}>
                    <Form.Group>
                      <Form.Label>Last Name *</Form.Label>
                      <Form.Control
                        {...register('lastName')}
                        isInvalid={!!errors.lastName}
                        placeholder="Doe"
                      />
                      <Form.Control.Feedback type="invalid">
                        {errors.lastName?.message}
                      </Form.Control.Feedback>
                    </Form.Group>
                  </Col>
                  <Col md={4}>
                    <Form.Group>
                      <Form.Label>Other Names</Form.Label>
                      <Form.Control {...register('otherNames')} placeholder="Middle name(s)" />
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group>
                      <Form.Label>National ID *</Form.Label>
                      <Form.Control
                        {...register('nationalId')}
                        isInvalid={!!errors.nationalId}
                        placeholder="CM90210..."
                      />
                      <Form.Control.Feedback type="invalid">
                        {errors.nationalId?.message}
                      </Form.Control.Feedback>
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group>
                      <Form.Label>Date of Birth *</Form.Label>
                      <Form.Control
                        type="date"
                        max={maxDobDate()}
                        {...register('dateOfBirth', {
                          setValueAs: (v) =>
                            v ? new Date(v).toISOString() : v,
                        })}
                        isInvalid={!!errors.dateOfBirth}
                      />
                      {age !== null && (
                        <Form.Text className="text-muted">Age: {age} years</Form.Text>
                      )}
                      <Form.Control.Feedback type="invalid">
                        {errors.dateOfBirth?.message}
                      </Form.Control.Feedback>
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group>
                      <Form.Label>Phone *</Form.Label>
                      <Form.Control
                        {...register('phone')}
                        isInvalid={!!errors.phone}
                        placeholder="+256 7XX XXX XXX"
                      />
                      <Form.Control.Feedback type="invalid">
                        {errors.phone?.message}
                      </Form.Control.Feedback>
                    </Form.Group>
                  </Col>
                </Row>
              </Card.Body>
            </Card>

            {/* Section 2 — Next of Kin */}
            <Card className="border-0 shadow-sm">
              <Card.Header className="bg-white fw-semibold">Next of Kin</Card.Header>
              <Card.Body>
                <Row className="g-3">
                  <Col md={6}>
                    <Form.Group>
                      <Form.Label>Full Name *</Form.Label>
                      <Form.Control
                        {...register('nextOfKinName')}
                        isInvalid={!!errors.nextOfKinName}
                      />
                      <Form.Control.Feedback type="invalid">
                        {errors.nextOfKinName?.message}
                      </Form.Control.Feedback>
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group>
                      <Form.Label>Phone *</Form.Label>
                      <Form.Control
                        {...register('nextOfKinPhone')}
                        isInvalid={!!errors.nextOfKinPhone}
                        placeholder="+256..."
                      />
                      <Form.Control.Feedback type="invalid">
                        {errors.nextOfKinPhone?.message}
                      </Form.Control.Feedback>
                    </Form.Group>
                  </Col>
                </Row>
              </Card.Body>
            </Card>

            {/* Section 3 — Employment Details */}
            <Card className="border-0 shadow-sm">
              <Card.Header className="bg-white fw-semibold">Employment Details</Card.Header>
              <Card.Body>
                <Row className="g-3">
                  <Col md={4}>
                    <Form.Group>
                      <Form.Label>Contract Start *</Form.Label>
                      <Form.Control
                        type="date"
                        {...register('contractStart', {
                          setValueAs: (v) => (v ? new Date(v).toISOString() : v),
                        })}
                        isInvalid={!!errors.contractStart}
                      />
                      <Form.Control.Feedback type="invalid">
                        {errors.contractStart?.message}
                      </Form.Control.Feedback>
                    </Form.Group>
                  </Col>
                  <Col md={4}>
                    <Form.Group>
                      <Form.Label>Contract End</Form.Label>
                      <Form.Control
                        type="date"
                        {...register('contractEnd', {
                          setValueAs: (v) => (v ? new Date(v).toISOString() : undefined),
                        })}
                      />
                    </Form.Group>
                  </Col>
                  <Col md={4}>
                    <Form.Group>
                      <Form.Label>PSO Certificate No.</Form.Label>
                      <Form.Control {...register('psoCertNumber')} placeholder="Optional" />
                    </Form.Group>
                  </Col>
                  <RoleGuard allowedRoles={GUARD_WRITE_ROLES as UserRole[]}>
                    <Col md={6}>
                      <Form.Group>
                        <Form.Label>Salary Rate (UGX) *</Form.Label>
                        <InputGroup>
                          <InputGroup.Text>UGX</InputGroup.Text>
                          <Form.Control
                            type="number"
                            step={1000}
                            min={0}
                            {...register('salaryRate', { valueAsNumber: true })}
                            isInvalid={!!errors.salaryRate}
                            placeholder="450000"
                          />
                          <Form.Control.Feedback type="invalid">
                            {errors.salaryRate?.message}
                          </Form.Control.Feedback>
                        </InputGroup>
                      </Form.Group>
                    </Col>
                  </RoleGuard>
                </Row>
              </Card.Body>
            </Card>

            {/* Section 4 — Bank Details (privileged only) */}
            <RoleGuard allowedRoles={GUARD_WRITE_ROLES as UserRole[]}>
              <Card className="border-0 shadow-sm">
                <Card.Header className="bg-white fw-semibold">Bank Details</Card.Header>
                <Card.Body>
                  <Row className="g-3">
                    <Col md={6}>
                      <Form.Group>
                        <Form.Label>Bank Name</Form.Label>
                        <Form.Control {...register('bankName')} placeholder="Stanbic, Centenary…" />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group>
                        <Form.Label>Account Number</Form.Label>
                        <Form.Control {...register('accountNumber')} placeholder="Optional" />
                        <Form.Text className="text-muted">
                          ⚠️ Bank details are encrypted at rest
                        </Form.Text>
                      </Form.Group>
                    </Col>
                  </Row>
                </Card.Body>
              </Card>
            </RoleGuard>
          </Col>
        </Row>

        {/* Footer buttons */}
        <div className="d-flex gap-2 justify-content-end mt-4">
          <Button variant="secondary" onClick={() => navigate('/guards')} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            style={{ backgroundColor: '#1B3A6B', borderColor: '#1B3A6B' }}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <Spinner as="span" animation="border" size="sm" className="me-2" />
            ) : null}
            {isEdit ? 'Save Changes' : 'Create Guard'}
          </Button>
        </div>
      </Form>
    </div>
  );
}
