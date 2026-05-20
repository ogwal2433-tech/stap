import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert, Breadcrumb, Button, ButtonGroup, Card, Col, Form, InputGroup, Row, Spinner, Table,
} from 'react-bootstrap';
import { useGuard, useCreateGuard, useUpdateGuard } from '../../hooks/useGuards';
import { guardsApi } from '../../lib/guards.api';
import { useAuth } from '../../context/AuthContext';
import RoleGuard from '../../components/RoleGuard';
import InitialsAvatar from '../../components/ui/InitialsAvatar';
import { useToast } from '../../context/ToastContext';
import { CreateGuardSchema, GUARD_CONTRACT_TYPES, GUARD_WRITE_ROLES, type CreateGuardInput, type UserRole } from '@stap/shared';
import { useGuardRanks } from '../../hooks/useSettings';

// ── Types ──────────────────────────────────────────────────────────────────────

interface RelativeRow {
  relativeName: string;
  phone: string;
  relationship: string;
  occupation: string;
  placeOfResidence: string;
}

interface AssociateRow {
  associateName: string;
  placeOfWork: string;
  workDetails: string;
  residence: string;
  phone: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

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

function toDateInputVal(d: Date): string {
  return d.toISOString().split('T')[0];
}

function calcDurationText(start: string, end: string): string | null {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (isNaN(s) || isNaN(e) || e <= s) return null;
  const totalMonths = Math.round((e - s) / (1000 * 60 * 60 * 24 * 30.44));
  if (totalMonths === 0) return null;
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} year${years !== 1 ? 's' : ''}`);
  if (months > 0) parts.push(`${months} month${months !== 1 ? 's' : ''}`);
  return `Duration: ${parts.join(' ')}`;
}

// ── Sticky section nav ─────────────────────────────────────────────────────────

const SECTIONS = ['A', 'B', 'C', 'D'] as const;
type SectionId = typeof SECTIONS[number];

function SectionNav({ active }: { active: SectionId }) {
  const labels: Record<SectionId, string> = {
    A: 'Personal',
    B: 'Address & Employment',
    C: 'Family',
    D: 'Health',
  };
  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        background: '#fff',
        borderBottom: '1px solid #dee2e6',
        padding: '8px 0',
        marginBottom: '1.5rem',
      }}
    >
      <div className="d-flex gap-2 px-1">
        {SECTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => document.getElementById(`section-${s}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            style={{
              border: '1px solid',
              borderColor: active === s ? '#1B3A6B' : '#dee2e6',
              background: active === s ? '#1B3A6B' : '#fff',
              color: active === s ? '#fff' : '#6c757d',
              borderRadius: 6,
              padding: '4px 14px',
              fontWeight: 600,
              fontSize: '0.8rem',
              cursor: 'pointer',
            }}
          >
            {s} <span className="d-none d-md-inline fw-normal">— {labels[s]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Duration options ───────────────────────────────────────────────────────────

type DurationKey = '3months' | '6months' | '1year' | '2years' | 'custom';

const DURATION_OPTIONS: Array<{ key: DurationKey; label: string }> = [
  { key: '3months', label: '3 Months' },
  { key: '6months', label: '6 Months' },
  { key: '1year',   label: '1 Year'   },
  { key: '2years',  label: '2 Years'  },
  { key: 'custom',  label: 'Custom'   },
];

// ── Main component ─────────────────────────────────────────────────────────────

export default function GuardFormPage() {
  const { id } = useParams<{ id?: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user } = useAuth();

  const { data: existing, isLoading: loadingExisting } = useGuard(id ?? '');
  const { mutate: createGuard, isPending: isCreating } = useCreateGuard();
  const { mutateAsync: updateGuard } = useUpdateGuard();
  const { data: ranks = [], isLoading: ranksLoading, isError: ranksError } = useGuardRanks(true);

  const [apiError, setApiError] = useState('');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState<DurationKey | null>(null);
  const [needStartWarning, setNeedStartWarning] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Relatives table state (max 3)
  const [relatives, setRelatives] = useState<RelativeRow[]>([]);
  // Associates state (max 2, fixed slots)
  const [associates, setAssociates] = useState<AssociateRow[]>([
    { associateName: '', placeOfWork: '', workDetails: '', residence: '', phone: '' },
    { associateName: '', placeOfWork: '', workDetails: '', residence: '', phone: '' },
  ]);

  // Active section for sticky nav (IntersectionObserver)
  const [activeSection, setActiveSection] = useState<SectionId>('A');
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const id = entry.target.id.replace('section-', '') as SectionId;
            setActiveSection(id);
          }
        }
      },
      { threshold: 0.25 },
    );
    SECTIONS.forEach((s) => {
      const el = document.getElementById(`section-${s}`);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, []);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    control,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateGuardInput>({
    resolver: zodResolver(CreateGuardSchema),
    defaultValues: {
      hasDisability: false,
      takesAlcohol: false,
      hasAllergies: false,
      isIncompleteNID: false,
    },
  });

  // Populate form in edit mode
  useEffect(() => {
    if (isEdit && existing) {
      reset({
        firstName:   existing.firstName,
        lastName:    existing.lastName,
        otherNames:  existing.otherNames ?? undefined,
        nationalId:  existing.nationalId ?? undefined,
        phone:       existing.phone,
        dateOfBirth: existing.dateOfBirth,
        nextOfKinName:  existing.nextOfKinName,
        nextOfKinPhone: existing.nextOfKinPhone,
        bankName:    existing.bankName ?? undefined,
        salaryRate:  existing.salaryRate,
        contractStart: existing.contractStart,
        contractEnd:   existing.contractEnd ?? undefined,
        psoCertNumber: existing.psoCertNumber ?? undefined,
        // Section A
        gender:          (existing.gender as any) ?? undefined,
        tribe:           existing.tribe ?? undefined,
        placeOfBirth:    existing.placeOfBirth ?? undefined,
        educationLevel:  (existing.educationLevel as any) ?? undefined,
        rank:            (existing.rank as any) ?? 'GUARD',
        contractType:    (existing.contractType as any) ?? 'PERMANENT',
        isIncompleteNID: existing.isIncompleteNID ?? false,
        registeredNames: existing.registeredNames ?? undefined,
        maritalStatus:   (existing.maritalStatus as any) ?? undefined,
        spouseName:      existing.spouseName ?? undefined,
        spouseWorkplace: existing.spouseWorkplace ?? undefined,
        spouseTelephone: existing.spouseTelephone ?? undefined,
        preferredPaymentContact: existing.preferredPaymentContact ?? undefined,
        // Address
        village: existing.village ?? undefined,
        parish:  existing.parish ?? undefined,
        subCounty: existing.subCounty ?? undefined,
        county:  existing.county ?? undefined,
        district: existing.district ?? undefined,
        // Section B
        lc1Zone:            existing.lc1Zone ?? undefined,
        lcOfficialName:     existing.lcOfficialName ?? undefined,
        lcOfficialPosition: existing.lcOfficialPosition ?? undefined,
        lcOfficialPhone:    existing.lcOfficialPhone ?? undefined,
        nssfNumber:         existing.nssfNumber ?? undefined,
        tinNumber:          existing.tinNumber ?? undefined,
        previousEmployer:   existing.previousEmployer ?? undefined,
        previousPosition:   existing.previousPosition ?? undefined,
        talentsExperience:  existing.talentsExperience ?? undefined,
        // Father
        fatherName:        existing.fatherName ?? undefined,
        fatherResidence:   existing.fatherResidence ?? undefined,
        fatherVillage:     existing.fatherVillage ?? undefined,
        fatherParish:      existing.fatherParish ?? undefined,
        fatherSubCounty:   existing.fatherSubCounty ?? undefined,
        fatherCounty:      existing.fatherCounty ?? undefined,
        fatherDistrict:    existing.fatherDistrict ?? undefined,
        fatherNationality: existing.fatherNationality ?? undefined,
        fatherOccupation:  existing.fatherOccupation ?? undefined,
        fatherPhone:       existing.fatherPhone ?? undefined,
        // Mother
        motherName:        existing.motherName ?? undefined,
        motherResidence:   existing.motherResidence ?? undefined,
        motherVillage:     existing.motherVillage ?? undefined,
        motherParish:      existing.motherParish ?? undefined,
        motherSubCounty:   existing.motherSubCounty ?? undefined,
        motherCounty:      existing.motherCounty ?? undefined,
        motherDistrict:    existing.motherDistrict ?? undefined,
        motherNationality: existing.motherNationality ?? undefined,
        motherOccupation:  existing.motherOccupation ?? undefined,
        motherPhone:       existing.motherPhone ?? undefined,
        // Dependents
        numberOfDependents: existing.numberOfDependents ?? undefined,
        // Health
        hasDisability:     existing.hasDisability,
        disabilityDetails: existing.disabilityDetails ?? undefined,
        takesAlcohol:      existing.takesAlcohol,
        hasAllergies:      existing.hasAllergies,
        allergyDetails:    existing.allergyDetails ?? undefined,
      });

      if (existing.photoUrl) setPhotoPreview(existing.photoUrl);

      // Populate relatives / associates from existing data
      if (existing.relatives?.length) {
        setRelatives(existing.relatives.map((r) => ({
          relativeName:    r.relativeName,
          phone:           r.phone ?? '',
          relationship:    r.relationship ?? '',
          occupation:      r.occupation ?? '',
          placeOfResidence:r.placeOfResidence ?? '',
        })));
      }
      if (existing.associates?.length) {
        const slots: AssociateRow[] = [
          { associateName: '', placeOfWork: '', workDetails: '', residence: '', phone: '' },
          { associateName: '', placeOfWork: '', workDetails: '', residence: '', phone: '' },
        ];
        existing.associates.slice(0, 2).forEach((a, i) => {
          slots[i] = {
            associateName: a.associateName,
            placeOfWork:   a.placeOfWork ?? '',
            workDetails:   a.workDetails ?? '',
            residence:     a.residence ?? '',
            phone:         a.phone ?? '',
          };
        });
        setAssociates(slots);
      }
    }
  }, [isEdit, existing, reset]);

  const dobValue         = watch('dateOfBirth');
  const contractStart    = watch('contractStart');
  const contractEnd      = watch('contractEnd');
  const maritalStatus    = watch('maritalStatus');
  const hasDisability    = watch('hasDisability');
  const hasAllergies     = watch('hasAllergies');
  const isIncompleteNID  = watch('isIncompleteNID');
  const age = dobValue ? calcAge(dobValue.split('T')[0]) : null;

  // ── Photo upload ───────────────────────────────────────────────────────────

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    const reader = new FileReader();
    reader.onload = (ev) => setPhotoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    setPhotoUploading(true);
    try {
      const result = await guardsApi.uploadPhoto(id, file);
      setPhotoPreview(result.photoUrl);
      showToast('Photo updated', 'success');
    } finally {
      setPhotoUploading(false);
    }
  };

  // ── Relatives helpers ──────────────────────────────────────────────────────

  const addRelative = () => {
    if (relatives.length >= 3) return;
    setRelatives((prev) => [
      ...prev,
      { relativeName: '', phone: '', relationship: '', occupation: '', placeOfResidence: '' },
    ]);
  };

  const removeRelative = (i: number) =>
    setRelatives((prev) => prev.filter((_, idx) => idx !== i));

  const updateRelative = (i: number, field: keyof RelativeRow, value: string) =>
    setRelatives((prev) => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r));

  const updateAssociate = (i: number, field: keyof AssociateRow, value: string) =>
    setAssociates((prev) => prev.map((a, idx) => idx === i ? { ...a, [field]: value } : a));

  // ── Contract duration ──────────────────────────────────────────────────────

  const applyDuration = (duration: DurationKey) => {
    if (duration === 'custom') {
      setSelectedDuration('custom');
      setValue('contractEnd', undefined);
      return;
    }
    if (!contractStart) {
      setNeedStartWarning(true);
      setTimeout(() => setNeedStartWarning(false), 3000);
      return;
    }
    setSelectedDuration(duration);
    const start = new Date(contractStart);
    const end = new Date(start);
    if (duration === '3months') end.setMonth(end.getMonth() + 3);
    else if (duration === '6months') end.setMonth(end.getMonth() + 6);
    else if (duration === '1year') end.setFullYear(end.getFullYear() + 1);
    else if (duration === '2years') end.setFullYear(end.getFullYear() + 2);
    setValue('contractEnd', toDateInputVal(end));
  };

  useEffect(() => {
    if (!selectedDuration || selectedDuration === 'custom' || !contractStart) return;
    const start = new Date(contractStart);
    const end = new Date(start);
    if (selectedDuration === '3months') end.setMonth(end.getMonth() + 3);
    else if (selectedDuration === '6months') end.setMonth(end.getMonth() + 6);
    else if (selectedDuration === '1year') end.setFullYear(end.getFullYear() + 1);
    else if (selectedDuration === '2years') end.setFullYear(end.getFullYear() + 2);
    setValue('contractEnd', toDateInputVal(end));
  }, [contractStart, selectedDuration, setValue]);

  // ── Submit ─────────────────────────────────────────────────────────────────

  const onSubmit = async (data: CreateGuardInput) => {
    setApiError('');

    // Attach vettingData
    const payload: CreateGuardInput = {
      ...data,
      vettingData: {
        relatives:  relatives.filter((r) => r.relativeName.trim()).map((r) => ({
          relativeName:    r.relativeName.trim(),
          phone:           r.phone.trim() || undefined,
          relationship:    r.relationship.trim() || undefined,
          occupation:      r.occupation.trim() || undefined,
          placeOfResidence:r.placeOfResidence.trim() || undefined,
        })),
        associates: associates
          .filter((a) => a.associateName.trim())
          .map((a) => ({
            associateName: a.associateName.trim(),
            placeOfWork:   a.placeOfWork.trim() || undefined,
            workDetails:   a.workDetails.trim() || undefined,
            residence:     a.residence.trim() || undefined,
            phone:         a.phone.trim() || undefined,
          })),
      },
    };

    if (isEdit && id) {
      try {
        await updateGuard({ id, data: payload });
        showToast('Changes saved', 'success');
        navigate(`/guards/${id}`);
      } catch (err: unknown) {
        const axiosErr = err as { response?: { status?: number; data?: { error?: string } } };
        setApiError(axiosErr.response?.data?.error ?? 'An unexpected error occurred');
      }
    } else {
      createGuard(payload, {
        onSuccess: (created) => {
          showToast('Guard created successfully', 'success');
          navigate(`/guards/${created.id}`, { replace: true });
        },
        onError: (err: any) => {
          const status  = err?.response?.status;
          const message = err?.response?.data?.error;
          if (status === 409) {
            setError('nationalId', { type: 'manual', message: message || 'This National ID already exists' });
            document.querySelector('[name="nationalId"]')?.scrollIntoView({ behavior: 'smooth' });
          } else {
            showToast(message || 'Failed to create guard', 'danger');
          }
        },
      });
    }
  };

  if (isEdit && loadingExisting) {
    return <div className="d-flex justify-content-center py-5"><Spinner animation="border" variant="primary" /></div>;
  }

  const fullName = existing ? existing.fullName : 'New Guard';

  return (
    <div>
      <Breadcrumb className="mb-3 small">
        <Breadcrumb.Item onClick={() => navigate('/dashboard')} style={{ cursor: 'pointer' }}>Dashboard</Breadcrumb.Item>
        <Breadcrumb.Item onClick={() => navigate('/guards')} style={{ cursor: 'pointer' }}>Guards</Breadcrumb.Item>
        <Breadcrumb.Item active>{isEdit ? `Edit: ${fullName}` : 'Create New Guard'}</Breadcrumb.Item>
      </Breadcrumb>

      {apiError && <Alert variant="danger" className="mb-3">{apiError}</Alert>}
      {Object.keys(errors).length > 0 && (
        <Alert variant="warning" className="mb-3 small">Please fix the highlighted errors before submitting.</Alert>
      )}

      {/* Photo card (edit mode only at top) */}
      {isEdit && (
        <Card className="border-0 shadow-sm mb-4">
          <Card.Body className="d-flex align-items-center gap-4 py-3">
            <div style={{ position: 'relative' }}>
              {photoPreview
                ? <img src={photoPreview} alt="Guard photo" width={80} height={80} className="rounded-circle object-fit-cover" />
                : <InitialsAvatar name={fullName} size={80} />}
              {photoUploading && (
                <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Spinner animation="border" variant="light" size="sm" />
                </div>
              )}
            </div>
            <div>
              <Button variant="outline-secondary" size="sm" onClick={() => photoInputRef.current?.click()} disabled={photoUploading}>
                Change Photo
              </Button>
              <input ref={photoInputRef} type="file" accept="image/jpeg,image/png" className="d-none" onChange={handlePhotoSelect} />
              <div className="text-muted small mt-1">JPG or PNG, max 5 MB</div>
            </div>
          </Card.Body>
        </Card>
      )}

      <SectionNav active={activeSection} />

      <Form noValidate onSubmit={handleSubmit(onSubmit)}>

        {/* ══════════════════════════════════════════════════════════════════════
            SECTION A — Personal Particulars
        ══════════════════════════════════════════════════════════════════════ */}
        <Card id="section-A" className="border-0 shadow-sm mb-4">
          <Card.Header className="bg-white fw-bold" style={{ color: '#1B3A6B', fontSize: '0.9rem', letterSpacing: '0.04em' }}>
            A — Personal Particulars
          </Card.Header>
          <Card.Body>
            {/* Row 1: Surname | First Name | Other Names */}
            <Row className="g-3 mb-3">
              <Col md={4}>
                <Form.Group>
                  <Form.Label>Surname *</Form.Label>
                  <Form.Control {...register('lastName')} isInvalid={!!errors.lastName} placeholder="Ssekandi" />
                  <Form.Control.Feedback type="invalid">{errors.lastName?.message}</Form.Control.Feedback>
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group>
                  <Form.Label>First Name *</Form.Label>
                  <Form.Control {...register('firstName')} isInvalid={!!errors.firstName} placeholder="John" />
                  <Form.Control.Feedback type="invalid">{errors.firstName?.message}</Form.Control.Feedback>
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group>
                  <Form.Label>Other Names</Form.Label>
                  <Form.Control {...register('otherNames')} placeholder="Middle name(s)" />
                </Form.Group>
              </Col>
              <Col xs={12}>
                <Form.Text className="text-muted">Enter name exactly as it appears on the National ID card.</Form.Text>
              </Col>
            </Row>

            {/* Row 2: Registered Names | Gender */}
            <Row className="g-3 mb-3">
              <Col md={8}>
                <Form.Group>
                  <Form.Label>Registered Names (as on National ID)</Form.Label>
                  <Form.Control {...register('registeredNames')} placeholder="Full name as printed on ID" />
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group>
                  <Form.Label>Gender</Form.Label>
                  <Form.Select {...register('gender')}>
                    <option value="">— Select —</option>
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                    <option value="OTHER">Other</option>
                  </Form.Select>
                </Form.Group>
              </Col>
            </Row>

            {/* Row 3: Date of Birth | Place of Birth | Tribe */}
            <Row className="g-3 mb-3">
              <Col md={4}>
                <Form.Group>
                  <Form.Label>Date of Birth *</Form.Label>
                  <Form.Control
                    type="date"
                    max={maxDobDate()}
                    {...register('dateOfBirth', { setValueAs: (v) => v ? new Date(v).toISOString() : v })}
                    isInvalid={!!errors.dateOfBirth}
                  />
                  {age !== null && <Form.Text className="text-muted">Age: {age} years</Form.Text>}
                  <Form.Control.Feedback type="invalid">{errors.dateOfBirth?.message}</Form.Control.Feedback>
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group>
                  <Form.Label>Place of Birth</Form.Label>
                  <Form.Control {...register('placeOfBirth')} placeholder="e.g. Masaka" />
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group>
                  <Form.Label>Tribe / Ethnicity</Form.Label>
                  <Form.Control {...register('tribe')} placeholder="e.g. Muganda" />
                </Form.Group>
              </Col>
            </Row>

            {/* Row 4: Nationality (static) | Education Level | Rank */}
            <Row className="g-3 mb-3">
              <Col md={4}>
                <Form.Group>
                  <Form.Label>Nationality</Form.Label>
                  <Form.Control defaultValue="Ugandan" readOnly className="bg-light" />
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group>
                  <Form.Label>Education Level</Form.Label>
                  <Form.Select {...register('educationLevel')}>
                    <option value="">— Select —</option>
                    <option value="PRIMARY">Primary</option>
                    <option value="O_LEVEL">O-Level (UCE)</option>
                    <option value="A_LEVEL">A-Level (UACE)</option>
                    <option value="CERTIFICATE">Certificate</option>
                    <option value="DIPLOMA">Diploma</option>
                    <option value="DEGREE">Degree</option>
                    <option value="MASTERS">Masters</option>
                    <option value="OTHER">Other</option>
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group>
                  <Form.Label>Rank</Form.Label>
                  <Form.Select {...register('rank')} disabled={ranksLoading}>
                    <option value="">
                      {ranksLoading ? 'Loading ranks...' : 'Select rank'}
                    </option>
                    {ranks.map((rank) => (
                      <option key={rank.id} value={rank.name}>
                        {rank.name}
                      </option>
                    ))}
                  </Form.Select>
                  {ranksError && (
                    <Alert variant="warning" className="mt-1 py-1 px-2 small mb-0">
                      Could not load ranks. Please refresh the page or contact the administrator.
                    </Alert>
                  )}
                </Form.Group>
              </Col>
            </Row>

            {/* Row 5: Marital Status */}
            <Row className="g-3 mb-3">
              <Col md={4}>
                <Form.Group>
                  <Form.Label>Marital Status</Form.Label>
                  <Form.Select {...register('maritalStatus')}>
                    <option value="">— Select —</option>
                    <option value="SINGLE">Single</option>
                    <option value="MARRIED">Married</option>
                    <option value="DIVORCED">Divorced</option>
                    <option value="WIDOWED">Widowed</option>
                  </Form.Select>
                </Form.Group>
              </Col>
            </Row>

            {/* Row 5 (conditional): Spouse fields */}
            {maritalStatus === 'MARRIED' && (
              <Row className="g-3 mb-3">
                <Col md={4}>
                  <Form.Group>
                    <Form.Label>Spouse Name</Form.Label>
                    <Form.Control {...register('spouseName')} placeholder="Full name" />
                  </Form.Group>
                </Col>
                <Col md={4}>
                  <Form.Group>
                    <Form.Label>Spouse Workplace</Form.Label>
                    <Form.Control {...register('spouseWorkplace')} placeholder="Employer / business" />
                  </Form.Group>
                </Col>
                <Col md={4}>
                  <Form.Group>
                    <Form.Label>Spouse Telephone</Form.Label>
                    <Form.Control {...register('spouseTelephone')} placeholder="+256..." isInvalid={!!errors.spouseTelephone} />
                    <Form.Control.Feedback type="invalid">{errors.spouseTelephone?.message}</Form.Control.Feedback>
                  </Form.Group>
                </Col>
              </Row>
            )}

            {/* Row 6: Phone | Preferred Payment Contact */}
            <Row className="g-3 mb-3">
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Phone Number *</Form.Label>
                  <Form.Control {...register('phone')} isInvalid={!!errors.phone} placeholder="+256 7XX XXX XXX" />
                  <Form.Control.Feedback type="invalid">{errors.phone?.message}</Form.Control.Feedback>
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Preferred Payment Contact (MoMo)</Form.Label>
                  <Form.Control {...register('preferredPaymentContact')} placeholder="+256..." isInvalid={!!errors.preferredPaymentContact} />
                  <Form.Text className="text-muted">MoMo number for salary payment — may differ from main phone.</Form.Text>
                  <Form.Control.Feedback type="invalid">{errors.preferredPaymentContact?.message}</Form.Control.Feedback>
                </Form.Group>
              </Col>
            </Row>

            {/* Row 7: National ID | NSSF | TIN */}
            <Row className="g-3 mb-3">
              <Col md={4}>
                <Form.Group>
                  <Form.Label>National ID (NIN)</Form.Label>
                  <Form.Control
                    {...register('nationalId')}
                    isInvalid={!!errors.nationalId}
                    placeholder="CM90210..."
                    disabled={!!isIncompleteNID}
                  />
                  <Form.Control.Feedback type="invalid">{errors.nationalId?.message}</Form.Control.Feedback>
                  <Form.Check
                    className="mt-1"
                    type="checkbox"
                    id="isIncompleteNID"
                    label="National ID not yet available — save as pending"
                    {...register('isIncompleteNID')}
                    onChange={(e) => {
                      setValue('isIncompleteNID', e.target.checked);
                      if (e.target.checked) setValue('nationalId', undefined);
                    }}
                  />
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group>
                  <Form.Label>NSSF Number</Form.Label>
                  <Form.Control {...register('nssfNumber')} placeholder="Optional" />
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group>
                  <Form.Label>TIN Number</Form.Label>
                  <Form.Control {...register('tinNumber')} placeholder="Optional" />
                </Form.Group>
              </Col>
            </Row>

            {/* Row 8: PSO Certificate */}
            <Row className="g-3">
              <Col md={6}>
                <Form.Group>
                  <Form.Label>PSO Certificate Number</Form.Label>
                  <Form.Control {...register('psoCertNumber')} placeholder="Optional" />
                </Form.Group>
              </Col>
            </Row>
          </Card.Body>
        </Card>

        {/* ══════════════════════════════════════════════════════════════════════
            SECTION B — Address & Employment
        ══════════════════════════════════════════════════════════════════════ */}
        <Card id="section-B" className="border-0 shadow-sm mb-4">
          <Card.Header className="bg-white fw-bold" style={{ color: '#1B3A6B', fontSize: '0.9rem', letterSpacing: '0.04em' }}>
            B — Contact Address &amp; Employment
          </Card.Header>
          <Card.Body>
            {/* B(1): Address */}
            <div className="fw-semibold small text-muted text-uppercase mb-2" style={{ letterSpacing: '0.05em' }}>B1 — Contact Address</div>
            <Row className="g-3 mb-3">
              <Col md={3}>
                <Form.Group>
                  <Form.Label>Village</Form.Label>
                  <Form.Control {...register('village')} placeholder="e.g. Kizungu" />
                </Form.Group>
              </Col>
              <Col md={3}>
                <Form.Group>
                  <Form.Label>Parish</Form.Label>
                  <Form.Control {...register('parish')} placeholder="e.g. Nateete" />
                </Form.Group>
              </Col>
              <Col md={3}>
                <Form.Group>
                  <Form.Label>Sub-county</Form.Label>
                  <Form.Control {...register('subCounty')} placeholder="e.g. Rubaga" />
                </Form.Group>
              </Col>
              <Col md={3}>
                <Form.Group>
                  <Form.Label>County</Form.Label>
                  <Form.Control {...register('county')} placeholder="e.g. Kampala" />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group>
                  <Form.Label>District</Form.Label>
                  <Form.Control {...register('district')} placeholder="e.g. Kampala" />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group>
                  <Form.Label>LC1 Zone</Form.Label>
                  <Form.Control {...register('lc1Zone')} placeholder="e.g. Zone 3" />
                </Form.Group>
              </Col>
            </Row>

            {/* B(2): LC Official */}
            <div className="fw-semibold small text-muted text-uppercase mb-2 mt-3" style={{ letterSpacing: '0.05em' }}>B2 — LC Official Known to You</div>
            <Row className="g-3 mb-3">
              <Col md={4}>
                <Form.Group>
                  <Form.Label>LC Official Name</Form.Label>
                  <Form.Control {...register('lcOfficialName')} placeholder="Full name" />
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group>
                  <Form.Label>Position</Form.Label>
                  <Form.Control {...register('lcOfficialPosition')} placeholder="e.g. LC1 Chairman" />
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group>
                  <Form.Label>Phone</Form.Label>
                  <Form.Control {...register('lcOfficialPhone')} placeholder="+256..." isInvalid={!!errors.lcOfficialPhone} />
                  <Form.Control.Feedback type="invalid">{errors.lcOfficialPhone?.message}</Form.Control.Feedback>
                </Form.Group>
              </Col>
            </Row>

            {/* B(3-5): Employment & Skills */}
            <div className="fw-semibold small text-muted text-uppercase mb-2 mt-3" style={{ letterSpacing: '0.05em' }}>B3-5 — Previous Employment &amp; Skills</div>
            <Row className="g-3 mb-3">
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Previous Employer</Form.Label>
                  <Form.Control {...register('previousEmployer')} placeholder="Company / Organisation name" />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Previous Position</Form.Label>
                  <Form.Control {...register('previousPosition')} placeholder="e.g. Security Guard" />
                </Form.Group>
              </Col>
              <Col xs={12}>
                <Form.Group>
                  <Form.Label>Talents / Experience</Form.Label>
                  <Form.Control as="textarea" rows={3} {...register('talentsExperience')} placeholder="Describe relevant skills, certifications, experience…" />
                </Form.Group>
              </Col>
            </Row>

            {/* B(6): Employment Details */}
            <div className="fw-semibold small text-muted text-uppercase mb-2 mt-3" style={{ letterSpacing: '0.05em' }}>B6 — STAP Employment Details</div>
            <Row className="g-3 mb-2">
              <Col md={4}>
                <Form.Group>
                  <Form.Label>Contract Start *</Form.Label>
                  <Form.Control type="date" {...register('contractStart', { setValueAs: (v) => v ? new Date(v).toISOString() : v })} isInvalid={!!errors.contractStart} />
                  <Form.Control.Feedback type="invalid">{errors.contractStart?.message}</Form.Control.Feedback>
                </Form.Group>
              </Col>
              <Col md={8}>
                <Form.Group>
                  <Form.Label>Duration</Form.Label>
                  <div>
                    <ButtonGroup size="sm">
                      {DURATION_OPTIONS.map(({ key, label }) => (
                        <Button
                          key={key}
                          type="button"
                          variant={selectedDuration === key ? 'primary' : 'outline-secondary'}
                          onClick={() => applyDuration(key)}
                        >
                          {label}
                        </Button>
                      ))}
                    </ButtonGroup>
                    {needStartWarning && (
                      <div className="text-warning small mt-1">
                        Please select a Contract Start date first.
                      </div>
                    )}
                  </div>
                </Form.Group>
              </Col>
            </Row>
            <Row className="g-3 mb-3">
              <Col md={4}>
                <Form.Group>
                  <Form.Label>Contract End</Form.Label>
                  <Form.Control
                    type="date"
                    {...register('contractEnd', { setValueAs: (v) => v ? new Date(v).toISOString() : undefined })}
                  />
                  {contractStart && contractEnd && calcDurationText(contractStart, contractEnd) && (
                    <Form.Text className="text-muted">
                      {calcDurationText(contractStart, contractEnd)}
                    </Form.Text>
                  )}
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group>
                  <Form.Label>Contract Type</Form.Label>
                  <div>
                    <Form.Check
                      inline
                      type="radio"
                      id="contractType-permanent"
                      label="Permanent"
                      value="PERMANENT"
                      {...register('contractType')}
                    />
                    <Form.Check
                      inline
                      type="radio"
                      id="contractType-temporary"
                      label="Temporary"
                      value="TEMPORARY"
                      {...register('contractType')}
                    />
                  </div>
                </Form.Group>
              </Col>
            </Row>
            <Row className="g-3 mb-3">
              <Col md={12}>
                <Form.Group>
                  <Form.Label>Probation Period</Form.Label>
                  <div className="text-muted small">
                    <i className="bi bi-info-circle me-1"></i>
                    Probation ends:{' '}
                    <strong>
                      {contractStart
                        ? new Date(new Date(contractStart).getTime() + 180 * 24 * 60 * 60 * 1000).toLocaleDateString('en-GB', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })
                        : '—'}
                    </strong>
                    {' '}(6 months from start)
                  </div>
                </Form.Group>
              </Col>
            </Row>
            <RoleGuard allowedRoles={GUARD_WRITE_ROLES as UserRole[]}>
              <Row className="g-3 mb-3">
                <Col md={4}>
                  <Form.Group>
                    <Form.Label>Salary Rate (UGX) *</Form.Label>
                    <InputGroup>
                      <InputGroup.Text>UGX</InputGroup.Text>
                      <Form.Control type="number" step={1000} min={0} {...register('salaryRate', { valueAsNumber: true })} isInvalid={!!errors.salaryRate} placeholder="450000" />
                      <Form.Control.Feedback type="invalid">{errors.salaryRate?.message}</Form.Control.Feedback>
                    </InputGroup>
                  </Form.Group>
                </Col>
                <Col md={4}>
                  <Form.Group>
                    <Form.Label>Bank Name</Form.Label>
                    <Form.Control {...register('bankName')} placeholder="Stanbic, Centenary…" />
                  </Form.Group>
                </Col>
                <Col md={4}>
                  <Form.Group>
                    <Form.Label>Account Number</Form.Label>
                    <Form.Control {...register('accountNumber')} placeholder="Optional" />
                    <Form.Text className="text-muted">⚠️ Encrypted at rest</Form.Text>
                  </Form.Group>
                </Col>
              </Row>
            </RoleGuard>
          </Card.Body>
        </Card>

        {/* ══════════════════════════════════════════════════════════════════════
            SECTION C — Family Background
        ══════════════════════════════════════════════════════════════════════ */}
        <Card id="section-C" className="border-0 shadow-sm mb-4">
          <Card.Header className="bg-white fw-bold" style={{ color: '#1B3A6B', fontSize: '0.9rem', letterSpacing: '0.04em' }}>
            C — Family Background
          </Card.Header>
          <Card.Body>

            {/* Father */}
            <div className="fw-semibold small text-muted text-uppercase mb-2" style={{ letterSpacing: '0.05em' }}>Father's Details</div>
            <Row className="g-3 mb-3">
              <Col md={6}><Form.Group><Form.Label>Father's Name</Form.Label><Form.Control {...register('fatherName')} placeholder="Full name" /></Form.Group></Col>
              <Col md={6}><Form.Group><Form.Label>Current Residence</Form.Label><Form.Control {...register('fatherResidence')} placeholder="Area / Town" /></Form.Group></Col>
              <Col md={3}><Form.Group><Form.Label>Village</Form.Label><Form.Control {...register('fatherVillage')} /></Form.Group></Col>
              <Col md={3}><Form.Group><Form.Label>Parish</Form.Label><Form.Control {...register('fatherParish')} /></Form.Group></Col>
              <Col md={3}><Form.Group><Form.Label>Sub-county</Form.Label><Form.Control {...register('fatherSubCounty')} /></Form.Group></Col>
              <Col md={3}><Form.Group><Form.Label>County</Form.Label><Form.Control {...register('fatherCounty')} /></Form.Group></Col>
              <Col md={4}><Form.Group><Form.Label>District</Form.Label><Form.Control {...register('fatherDistrict')} /></Form.Group></Col>
              <Col md={4}><Form.Group><Form.Label>Nationality</Form.Label><Form.Control {...register('fatherNationality')} placeholder="e.g. Ugandan" /></Form.Group></Col>
              <Col md={4}><Form.Group><Form.Label>Occupation</Form.Label><Form.Control {...register('fatherOccupation')} placeholder="e.g. Farmer" /></Form.Group></Col>
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Phone</Form.Label>
                  <Form.Control {...register('fatherPhone')} placeholder="+256..." isInvalid={!!errors.fatherPhone} />
                  <Form.Control.Feedback type="invalid">{errors.fatherPhone?.message}</Form.Control.Feedback>
                </Form.Group>
              </Col>
            </Row>

            <hr className="my-3" />

            {/* Mother */}
            <div className="fw-semibold small text-muted text-uppercase mb-2" style={{ letterSpacing: '0.05em' }}>Mother's Details</div>
            <Row className="g-3 mb-3">
              <Col md={6}><Form.Group><Form.Label>Mother's Name</Form.Label><Form.Control {...register('motherName')} placeholder="Full name" /></Form.Group></Col>
              <Col md={6}><Form.Group><Form.Label>Current Residence</Form.Label><Form.Control {...register('motherResidence')} placeholder="Area / Town" /></Form.Group></Col>
              <Col md={3}><Form.Group><Form.Label>Village</Form.Label><Form.Control {...register('motherVillage')} /></Form.Group></Col>
              <Col md={3}><Form.Group><Form.Label>Parish</Form.Label><Form.Control {...register('motherParish')} /></Form.Group></Col>
              <Col md={3}><Form.Group><Form.Label>Sub-county</Form.Label><Form.Control {...register('motherSubCounty')} /></Form.Group></Col>
              <Col md={3}><Form.Group><Form.Label>County</Form.Label><Form.Control {...register('motherCounty')} /></Form.Group></Col>
              <Col md={4}><Form.Group><Form.Label>District</Form.Label><Form.Control {...register('motherDistrict')} /></Form.Group></Col>
              <Col md={4}><Form.Group><Form.Label>Nationality</Form.Label><Form.Control {...register('motherNationality')} placeholder="e.g. Ugandan" /></Form.Group></Col>
              <Col md={4}><Form.Group><Form.Label>Occupation</Form.Label><Form.Control {...register('motherOccupation')} placeholder="e.g. Trader" /></Form.Group></Col>
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Phone</Form.Label>
                  <Form.Control {...register('motherPhone')} placeholder="+256..." isInvalid={!!errors.motherPhone} />
                  <Form.Control.Feedback type="invalid">{errors.motherPhone?.message}</Form.Control.Feedback>
                </Form.Group>
              </Col>
            </Row>

            <hr className="my-3" />

            {/* Close Relatives (max 3) */}
            <div className="d-flex justify-content-between align-items-center mb-2">
              <div className="fw-semibold small text-muted text-uppercase" style={{ letterSpacing: '0.05em' }}>Close Relatives (max 3)</div>
              {relatives.length < 3 && (
                <Button size="sm" variant="outline-primary" onClick={addRelative}>+ Add Relative</Button>
              )}
            </div>
            {relatives.length === 0 ? (
              <Alert variant="light" className="small py-2">No relatives added yet. Click "Add Relative" to add up to 3.</Alert>
            ) : (
              <Table size="sm" responsive className="mb-3">
                <thead className="table-light">
                  <tr>
                    <th>Name *</th>
                    <th>Phone</th>
                    <th>Relationship</th>
                    <th>Occupation</th>
                    <th>Place of Residence</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {relatives.map((rel, i) => (
                    <tr key={i}>
                      <td><Form.Control size="sm" value={rel.relativeName} onChange={(e) => updateRelative(i, 'relativeName', e.target.value)} placeholder="Full name" /></td>
                      <td><Form.Control size="sm" value={rel.phone} onChange={(e) => updateRelative(i, 'phone', e.target.value)} placeholder="+256..." /></td>
                      <td><Form.Control size="sm" value={rel.relationship} onChange={(e) => updateRelative(i, 'relationship', e.target.value)} placeholder="e.g. Brother" /></td>
                      <td><Form.Control size="sm" value={rel.occupation} onChange={(e) => updateRelative(i, 'occupation', e.target.value)} placeholder="e.g. Driver" /></td>
                      <td><Form.Control size="sm" value={rel.placeOfResidence} onChange={(e) => updateRelative(i, 'placeOfResidence', e.target.value)} placeholder="e.g. Nateete" /></td>
                      <td><Button size="sm" variant="outline-danger" onClick={() => removeRelative(i)}>✕</Button></td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}

            <hr className="my-3" />

            {/* Dependents + Next of Kin */}
            <div className="fw-semibold small text-muted text-uppercase mb-2" style={{ letterSpacing: '0.05em' }}>Dependents &amp; Next of Kin</div>
            <Row className="g-3 mb-3">
              <Col md={4}>
                <Form.Group>
                  <Form.Label>Number of Dependents</Form.Label>
                  <Form.Control type="number" min={0} {...register('numberOfDependents', { valueAsNumber: true })} placeholder="0" />
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group>
                  <Form.Label>Next of Kin Name *</Form.Label>
                  <Form.Control {...register('nextOfKinName')} isInvalid={!!errors.nextOfKinName} />
                  <Form.Control.Feedback type="invalid">{errors.nextOfKinName?.message}</Form.Control.Feedback>
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group>
                  <Form.Label>Next of Kin Phone *</Form.Label>
                  <Form.Control {...register('nextOfKinPhone')} isInvalid={!!errors.nextOfKinPhone} placeholder="+256..." />
                  <Form.Control.Feedback type="invalid">{errors.nextOfKinPhone?.message}</Form.Control.Feedback>
                </Form.Group>
              </Col>
            </Row>

            <hr className="my-3" />

            {/* Associates (2 fixed slots) */}
            <div className="fw-semibold small text-muted text-uppercase mb-2" style={{ letterSpacing: '0.05em' }}>Close Associates / Friends</div>
            {[0, 1].map((i) => (
              <div key={i} className="mb-3">
                <div className="small text-muted fw-semibold mb-1">Associate {i + 1}</div>
                <Row className="g-2">
                  <Col md={6}><Form.Control size="sm" value={associates[i].associateName} onChange={(e) => updateAssociate(i, 'associateName', e.target.value)} placeholder="Full name" /></Col>
                  <Col md={6}><Form.Control size="sm" value={associates[i].placeOfWork} onChange={(e) => updateAssociate(i, 'placeOfWork', e.target.value)} placeholder="Place of work" /></Col>
                  <Col md={6}><Form.Control size="sm" value={associates[i].residence} onChange={(e) => updateAssociate(i, 'residence', e.target.value)} placeholder="Residence detail" /></Col>
                  <Col md={6}><Form.Control size="sm" value={associates[i].phone} onChange={(e) => updateAssociate(i, 'phone', e.target.value)} placeholder="Phone (+256...)" /></Col>
                </Row>
              </div>
            ))}
          </Card.Body>
        </Card>

        {/* ══════════════════════════════════════════════════════════════════════
            SECTION D — Health
        ══════════════════════════════════════════════════════════════════════ */}
        <Card id="section-D" className="border-0 shadow-sm mb-4">
          <Card.Header className="bg-white fw-bold" style={{ color: '#1B3A6B', fontSize: '0.9rem', letterSpacing: '0.04em' }}>
            D — Health Information
          </Card.Header>
          <Card.Body>
            {/* Disability */}
            <div className="mb-3">
              <Controller
                name="hasDisability"
                control={control}
                render={({ field }) => (
                  <Form.Check
                    type="switch"
                    id="hasDisability"
                    label="Do you have a disability?"
                    checked={!!field.value}
                    onChange={(e) => field.onChange(e.target.checked)}
                  />
                )}
              />
              {hasDisability && (
                <Form.Control
                  as="textarea"
                  rows={2}
                  className="mt-2"
                  {...register('disabilityDetails')}
                  placeholder="Please describe the disability…"
                />
              )}
            </div>

            {/* Alcohol */}
            <div className="mb-3">
              <Controller
                name="takesAlcohol"
                control={control}
                render={({ field }) => (
                  <Form.Check
                    type="switch"
                    id="takesAlcohol"
                    label="Do you take alcohol?"
                    checked={!!field.value}
                    onChange={(e) => field.onChange(e.target.checked)}
                  />
                )}
              />
            </div>

            {/* Allergies */}
            <div className="mb-3">
              <Controller
                name="hasAllergies"
                control={control}
                render={({ field }) => (
                  <Form.Check
                    type="switch"
                    id="hasAllergies"
                    label="Do you have any allergies?"
                    checked={!!field.value}
                    onChange={(e) => field.onChange(e.target.checked)}
                  />
                )}
              />
              {hasAllergies && (
                <Form.Control
                  as="textarea"
                  rows={2}
                  className="mt-2"
                  {...register('allergyDetails')}
                  placeholder="Please describe the allergies…"
                />
              )}
            </div>

            <Alert variant="info" className="small mb-0">
              This information is confidential and used only for duty-of-care purposes.
            </Alert>
          </Card.Body>
        </Card>

        {/* Footer */}
        <div className="d-flex gap-2 justify-content-end mt-2 mb-5">
          <Button variant="secondary" onClick={() => navigate('/guards')} disabled={isSubmitting || isCreating}>
            Cancel
          </Button>
          <Button
            type="submit"
            style={{ backgroundColor: '#1B3A6B', borderColor: '#1B3A6B' }}
            disabled={isSubmitting || isCreating}
          >
            {(isSubmitting || isCreating) && <Spinner as="span" animation="border" size="sm" className="me-2" />}
            {isEdit ? 'Save Changes' : 'Create Guard'}
          </Button>
        </div>
      </Form>
    </div>
  );
}
