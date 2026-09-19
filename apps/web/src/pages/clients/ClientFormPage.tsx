import type { FieldErrors } from 'react-hook-form';
import { getApiErrorMessage } from '../../lib/api';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Breadcrumb, Button, Card, Col, Form, Row, Spinner,
} from 'react-bootstrap';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ClientFormSchema, LEAD_SOURCES, LEAD_STATUSES, MARKETER_LEAD_SOURCE, generatePassword,
} from '@stap/shared';
import { useClient, useCreateClient, useUpdateClient } from '../../hooks/useClients';
import ContactsEditor from '../../components/clients/ContactsEditor';
import TemporaryPasswordField from '../../components/common/TemporaryPasswordField';
import { emptyContact, type ContactDraft } from '../../components/clients/ContactFields';
import { useToast } from '../../context/ToastContext';
import type { ClientFormInput, CreateClientInput } from '@stap/shared';

const QUICK_TERMS = [7, 14, 30, 45, 60];

/**
 * Readable names for fields that can fail validation. contactPhone and
 * contactPerson have no input of their own — they come from the primary
 * contact card — so their errors are listed rather than shown under a field.
 */
const FIELD_NAMES: Record<string, string> = {
  contactPhone:    'Primary contact phone',
  contactPerson:   'Primary contact name',
  clientName:      'Client name',
  physicalAddress: 'Physical address',
  billingAddress:  'Billing address',
  billingTerms:    'Billing terms',
  contractStatus:  'Contract status',
  email:           'Email',
  tin:             'TIN',
  vatRate:         'VAT rate',
  leadSource:      'Lead source',
  referredBy:      'Referred by',
  marketerName:    'Marketer name',
};

export default function ClientFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const isEdit = Boolean(id);

  // Portal access set up in the same save. Offered on creation only — an
  // existing client's portal is managed from its detail page, where the logins
  // it already holds are listed.
  const [enablePortal, setEnablePortal] = useState(false);
  const [portal, setPortal] = useState({
    contactName: '',
    email:       '',
    password:    generatePassword(),
  });

  const { data: existing, isLoading } = useClient(id ?? '');
  const createClient = useCreateClient();
  const updateClient = useUpdateClient();

  const [contacts, setContacts] = useState<ContactDraft[]>([emptyContact(true)]);
  const [contactsTouched, setContactsTouched] = useState(false);
  const [sameAddress, setSameAddress] = useState(false);
  const [vatRegistered, setVatRegistered] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ClientFormInput>({
    resolver: zodResolver(ClientFormSchema),
    defaultValues: { contractStatus: 'ACTIVE', billingTerms: 30, leadStatus: 'CONVERTED', vatRegistered: false },
  });

  const physicalAddress = watch('physicalAddress');
  const leadSource      = watch('leadSource');
  const isMarketerLead  = leadSource === MARKETER_LEAD_SOURCE;

  // Clearing on change rather than on submit: leaving the value in place would
  // let a hidden field carry a name the visible form no longer explains, and on
  // an edit that name would be silently resubmitted.
  useEffect(() => {
    if (!isMarketerLead) setValue('marketerName', undefined);
  }, [isMarketerLead, setValue]);

  useEffect(() => {
    if (existing) {
      const vat = existing.vatRegistered ?? false;
      setVatRegistered(vat);
      reset({
        clientName:      existing.clientName,
        contactPerson:   existing.contactPerson,
        contactPhone:    existing.contactPhone,
        email:           existing.email ?? undefined,
        physicalAddress: existing.physicalAddress,
        billingAddress:  existing.billingAddress ?? undefined,
        billingTerms:    existing.billingTerms,
        contractStatus:  existing.contractStatus,
        tin:             existing.tin ?? undefined,
        vatRegistered:   vat,
        vatRate:         existing.vatRate ?? undefined,
        leadSource:      existing.leadSource ?? undefined,
        referredBy:      existing.referredBy ?? undefined,
        marketerName:    existing.marketerName ?? undefined,
        leadStatus:      existing.leadStatus ?? 'CONVERTED',
      });

      // Falls back to the denormalised pair for a client saved before contacts
      // existed and somehow missed the backfill — an empty editor would look
      // like the client has no contact when the record plainly names one.
      const loaded = (existing.contacts ?? []).map((c) => ({
        contactType: c.contactType,
        name:        c.name,
        phone:       c.phone ?? '',
        email:       c.email ?? '',
        jobTitle:    c.jobTitle ?? '',
        isPrimary:   c.isPrimary,
        notes:       c.notes ?? '',
      }));
      setContacts(
        loaded.length > 0
          ? loaded
          : [{ ...emptyContact(true), name: existing.contactPerson, phone: existing.contactPhone }],
      );
    }
  }, [existing, reset]);

  useEffect(() => {
    if (sameAddress) {
      setValue('billingAddress', physicalAddress);
    }
  }, [sameAddress, physicalAddress, setValue]);

  /** Contacts with a name typed in. A blank card the user never filled is not one. */
  const filledContacts = contacts.filter((c) => c.name.trim());

  const onSubmit = async (data: ClientFormInput) => {
    setContactsTouched(true);
    if (filledContacts.length === 0) {
      setApiError('Add at least one contact person for this client.');
      return;
    }
    if (!isEdit && enablePortal) {
      if (portal.contactName.trim().length < 2) {
        setApiError('Name the person who will use the portal login, or switch portal access off.');
        return;
      }
      if (!portal.email.trim()) {
        setApiError('A portal login email is required, or switch portal access off.');
        return;
      }
      if (portal.password.trim().length < 8) {
        setApiError('The portal password must be at least 8 characters.');
        return;
      }
    }
    setApiError(null);

    const primary = filledContacts.find((c) => c.isPrimary) ?? filledContacts[0];
    const payload: CreateClientInput = {
      ...data,
      // The API keeps these two columns as the denormalised primary — invoices
      // and MoMo disbursement read them — so they are derived here rather than
      // asked for twice.
      contactPerson: primary.name.trim(),
      contactPhone:  primary.phone.trim(),
      contacts:      filledContacts.map((c) => ({
        ...c,
        isPrimary: c === primary,
      })),
      ...(!isEdit && enablePortal
        ? {
            portal: {
              contactName: portal.contactName.trim(),
              email:       portal.email.trim(),
              password:    portal.password,
            },
          }
        : {}),
    };

    try {
      if (isEdit && id) {
        // Contacts are managed from the client detail page, where each one can
        // be added, edited or removed individually. Sending the array here would
        // have to mean "replace them all", which is how the previous edit path
        // destroyed data it never loaded.
        const { contacts: _omit, ...clientFields } = payload;
        await updateClient.mutateAsync({ id, data: clientFields });
        showToast('Client updated', 'success');
        navigate(`/clients/${id}`);
      } else {
        const created = await createClient.mutateAsync(payload);
        showToast(
          enablePortal
            ? `Client created. Portal login details sent to ${portal.email.trim()}.`
            : 'Client created',
          'success',
          enablePortal ? 6000 : undefined,
        );
        navigate(`/clients/${created.id}`);
      }
    } catch (error) {
      // Names the failing fields on a 400 rather than "Validation failed".
      setApiError(getApiErrorMessage(error, 'Failed to save client. Please try again.'));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  /**
   * Called when the form's own validation refuses a save. Without it an error
   * on a field with no input — contactPhone, derived from the contact card —
   * had nowhere to appear, and clicking Save simply did nothing.
   */
  const onInvalid = (formErrors: FieldErrors<ClientFormInput>) => {
    const problems = Object.entries(formErrors).map(([field, err]) =>
      `${FIELD_NAMES[field] ?? field}: ${(err as { message?: string } | undefined)?.message ?? 'invalid'}`);
    setApiError(`Please check: ${problems.join(' • ')}`);
    // The message renders above the form and Save sits at the bottom of a long
    // page — without this the refusal would still look like nothing happened.
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

      <Form onSubmit={handleSubmit(onSubmit, onInvalid)}>
        {apiError && (
          <Alert variant="danger" dismissible onClose={() => setApiError(null)}>
            <strong>Error:</strong> {apiError}
          </Alert>
        )}

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
                  <Form.Label>
                    Company Email <span className="text-muted small">(optional)</span>
                  </Form.Label>
                  <Form.Control
                    type="email"
                    {...register('email')}
                    isInvalid={!!errors.email}
                    placeholder="e.g. security@company.go.ug"
                  />
                  <Form.Control.Feedback type="invalid">{errors.email?.message}</Form.Control.Feedback>
                  <Form.Text className="text-muted">
                    The company's own address. Each contact person can have their own below.
                  </Form.Text>
                </Form.Group>
              </Col>
            </Row>

            <hr className="my-4" />

            {/*
              This replaces the single Contact Person / Contact Phone pair. The
              primary contact below is written back to those two fields, so
              nothing that reads them changes — but a client with a manager, an
              accounts officer and an operations lead can now hold all three.
            */}
            <ContactsEditor
              contacts={contacts}
              onChange={setContacts}
              disabled={isSubmitting}
              showErrors={contactsTouched}
            />
            {isEdit && (
              <div className="text-muted" style={{ fontSize: '0.74rem', marginTop: 4 }}>
                Contacts are saved from the client's page — use Contact Persons there to
                add, edit or remove them.
              </div>
            )}
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

        {/* Section 4 — Tax & Compliance */}
        <Card className="border-0 shadow-sm mb-4">
          <Card.Header className="bg-white fw-semibold" style={{ color: '#1B3A6B' }}>
            Tax &amp; Compliance
          </Card.Header>
          <Card.Body>
            <Row className="g-3">
              <Col md={6}>
                <Form.Group>
                  <Form.Label>TIN (Tax Identification Number) <span className="text-muted small">(optional)</span></Form.Label>
                  <Form.Control
                    {...register('tin')}
                    isInvalid={!!errors.tin}
                    placeholder="e.g. 1000123456"
                  />
                  <Form.Text className="text-muted">Required for VAT invoicing and compliance</Form.Text>
                  <Form.Control.Feedback type="invalid">{errors.tin?.message}</Form.Control.Feedback>
                </Form.Group>
              </Col>

              <Col md={6}>
                <Form.Group>
                  <Form.Label>VAT Status</Form.Label>
                  <div className="mt-2">
                    <Form.Check
                      type="switch"
                      id="vat-registered"
                      label={vatRegistered ? 'VAT Registered' : 'Not VAT Registered'}
                      checked={vatRegistered}
                      onChange={(e) => {
                        setVatRegistered(e.target.checked);
                        setValue('vatRegistered', e.target.checked);
                        if (!e.target.checked) setValue('vatRate', undefined);
                      }}
                    />
                  </div>
                </Form.Group>
              </Col>

              {vatRegistered && (
                <Col md={6}>
                  <Form.Group>
                    <Form.Label>VAT Rate (%) <span className="text-danger">*</span></Form.Label>
                    <Form.Control
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      {...register('vatRate', { valueAsNumber: true })}
                      isInvalid={!!errors.vatRate}
                      placeholder="e.g. 18"
                    />
                    <Form.Text className="text-muted">Standard Uganda VAT is 18%</Form.Text>
                    <Form.Control.Feedback type="invalid">{errors.vatRate?.message}</Form.Control.Feedback>
                  </Form.Group>
                </Col>
              )}
            </Row>
          </Card.Body>
        </Card>

        {/* Section 5 — Lead Information */}
        <Card className="border-0 shadow-sm mb-4">
          <Card.Header className="bg-white fw-semibold" style={{ color: '#1B3A6B' }}>
            Lead Information
          </Card.Header>
          <Card.Body>
            <Row className="g-3">
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Lead Status</Form.Label>
                  <Form.Select {...register('leadStatus')} isInvalid={!!errors.leadStatus}>
                    {Object.entries(LEAD_STATUSES).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </Form.Select>
                  <Form.Text className="text-muted">Track the progress of this client relationship</Form.Text>
                  <Form.Control.Feedback type="invalid">{errors.leadStatus?.message}</Form.Control.Feedback>
                </Form.Group>
              </Col>

              <Col md={6}>
                <Form.Group>
                  <Form.Label>Lead Source <span className="text-muted small">(optional)</span></Form.Label>
                  <Form.Select {...register('leadSource')} isInvalid={!!errors.leadSource}>
                    <option value="">— Select source —</option>
                    {Object.entries(LEAD_SOURCES).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </Form.Select>
                  <Form.Text className="text-muted">How did this client find us?</Form.Text>
                  <Form.Control.Feedback type="invalid">{errors.leadSource?.message}</Form.Control.Feedback>
                </Form.Group>
              </Col>

              {/* Only asked for when the answer above makes it meaningful. */}
              {isMarketerLead && (
                <Col md={6}>
                  <Form.Group style={{ animation: 'fadeInField 0.2s ease-in' }}>
                    <Form.Label>Marketer Name <span className="text-danger">*</span></Form.Label>
                    <Form.Control
                      {...register('marketerName')}
                      isInvalid={!!errors.marketerName}
                      placeholder="e.g. John Okello"
                      autoFocus
                    />
                    <Form.Text className="text-muted">
                      Which of our marketers brought this client in
                    </Form.Text>
                    <Form.Control.Feedback type="invalid">
                      {errors.marketerName?.message}
                    </Form.Control.Feedback>
                  </Form.Group>
                </Col>
              )}

              <Col md={6}>
                <Form.Group>
                  <Form.Label>Referred By <span className="text-muted small">(optional)</span></Form.Label>
                  <Form.Control
                    {...register('referredBy')}
                    isInvalid={!!errors.referredBy}
                    placeholder="e.g. John Kato or ABC Security Ltd"
                  />
                  <Form.Text className="text-muted">Name of the person or company that referred this client</Form.Text>
                  <Form.Control.Feedback type="invalid">{errors.referredBy?.message}</Form.Control.Feedback>
                </Form.Group>
              </Col>
            </Row>
          </Card.Body>
        </Card>

        {!isEdit && (
          <Card className="border-0 shadow-sm mb-3">
            <Card.Body>
              <div
                role="button"
                tabIndex={0}
                onClick={() => setEnablePortal(p => !p)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setEnablePortal(p => !p);
                  }
                }}
                style={{
                  display:      'flex',
                  alignItems:   'center',
                  gap:          '10px',
                  cursor:       'pointer',
                  marginBottom: enablePortal ? '14px' : '0',
                }}
              >
                <div
                  style={{
                    width:        '40px',
                    height:       '22px',
                    borderRadius: '11px',
                    background:   enablePortal ? '#1B3A6B' : '#ced4da',
                    position:     'relative',
                    transition:   'background 0.2s',
                    flexShrink:   0,
                  }}
                >
                  <div
                    style={{
                      position:     'absolute',
                      top:          '3px',
                      left:         enablePortal ? '21px' : '3px',
                      width:        '16px',
                      height:       '16px',
                      borderRadius: '50%',
                      background:   'white',
                      transition:   'left 0.2s',
                    }}
                  />
                </div>
                <div>
                  <div className="fw-bold small">🌐 Enable Client Portal Access</div>
                  <div style={{ fontSize: '0.70rem', color: '#6c757d' }}>
                    Set up the portal login at the same time as creating the client
                  </div>
                </div>
              </div>

              {enablePortal && (
                <div
                  style={{
                    background:   '#F8F9FA',
                    borderRadius: '0.5rem',
                    padding:      '14px 16px',
                    border:       '1px solid #e9ecef',
                  }}
                >
                  <Row className="g-2">
                    <Col md={6}>
                      <Form.Label className="small fw-bold">Contact Name *</Form.Label>
                      <Form.Control
                        size="sm"
                        type="text"
                        value={portal.contactName}
                        onChange={e => setPortal(p => ({ ...p, contactName: e.target.value }))}
                        placeholder="Primary contact"
                      />
                    </Col>
                    <Col md={6}>
                      <Form.Label className="small fw-bold">Login Email *</Form.Label>
                      <Form.Control
                        size="sm"
                        type="email"
                        value={portal.email}
                        onChange={e => setPortal(p => ({ ...p, email: e.target.value }))}
                        placeholder="contact@company.com"
                      />
                    </Col>
                    <Col md={12}>
                      <TemporaryPasswordField
                        value={portal.password}
                        onChange={next => setPortal(p => ({ ...p, password: next }))}
                        hint="Emailed to the contact once the client is saved."
                      />
                    </Col>
                  </Row>
                </div>
              )}
            </Card.Body>
          </Card>
        )}

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
