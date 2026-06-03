import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, Col, Form, Modal, Row, Spinner, Table } from 'react-bootstrap';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useCreateSite, useUpdateSite } from '../../hooks/useClients';
import { useShiftTypes } from '../../hooks/useSettings';
import { useToast } from '../../context/ToastContext';
import type { SiteResponse } from '@stap/shared';
import { z } from 'zod';
import DateRangePicker from '../common/DateRangePicker';

// ── Local schema (frontend-only, coerces GPS + guardsRequired) ─────────────────

const toOptionalNum = (v: unknown) =>
  v === '' || (typeof v === 'number' && isNaN(v)) ? undefined : v;

const SiteFormSchema = z.object({
  siteName:            z.string().min(1, 'Site name is required'),
  location:            z.string().min(1, 'Location is required'),
  gpsLat:              z.preprocess(toOptionalNum, z.number().min(-90).max(90).optional()),
  gpsLon:              z.preprocess(toOptionalNum, z.number().min(-180).max(180).optional()),
  siteManagerName:     z.string().max(100).optional().transform((v) => v || undefined),
  siteManagerContact:  z.string().optional().transform((v) => v || undefined),
  guardsRequired:      z.coerce.number().int().min(1).default(1),
  siteType:             z.enum(['REGULAR', 'TEMPORARY', 'SPECIAL_DUTIES', 'PERMANENT']).default('REGULAR'),
  sitePeriodStart: z.string().optional().nullable(),
  sitePeriodEnd:   z.string().optional().nullable(),
  sitePeriodNotes:     z.string().max(500).optional().nullable(),
  armedGuardsRequired: z.coerce.number().int().min(0).default(0),
  firearmsRequired:    z.coerce.number().int().min(0).default(0),
  batonRequired:       z.coerce.number().int().min(0).default(0),
  otherWeaponsNotes:   z.string().max(500).optional().nullable(),
  equipmentDetails:    z.string().max(1000).optional().transform((v) => v || undefined),
  specialInstructions: z.string().max(2000).optional().transform((v) => v || undefined),
});

type SiteFormValues = z.infer<typeof SiteFormSchema>;

interface EquipmentItem {
  itemName: string;
  quantity: number;
  notes: string;
}

interface Props {
  clientId: string;
  site?: SiteResponse;
  onClose: () => void;
  onSuccess: () => void;
}

const SITE_TYPE_OPTIONS = [
  { value: 'REGULAR',       label: 'Regular' },
  { value: 'TEMPORARY',     label: 'Temporary' },
  { value: 'SPECIAL_DUTIES',label: 'Special Duties' },
  { value: 'PERMANENT',     label: 'Permanent' },
];

export default function SiteFormModal({ clientId, site, onClose, onSuccess }: Props) {
  const { showToast } = useToast();
  const createSite  = useCreateSite();
  const updateSite  = useUpdateSite();
  const { data: shiftTypes = [] } = useShiftTypes(true);
  const isEdit = Boolean(site);

  // Equipment items state (structured list)
  const [equipmentItems, setEquipmentItems] = useState<EquipmentItem[]>([]);
  // Allowed shift types (checkboxes)
  const [allowedShifts, setAllowedShifts] = useState<string[]>([]);

  // Special duty date range state (local ISO date strings: 'YYYY-MM-DD')
  const [periodStart, setPeriodStart] = useState<string>(
    (site as any)?.sitePeriodStart
      ? new Date((site as any).sitePeriodStart).toISOString().split('T')[0] : '',
  );
  const [periodEnd, setPeriodEnd] = useState<string>(
    (site as any)?.sitePeriodEnd
      ? new Date((site as any).sitePeriodEnd).toISOString().split('T')[0] : '',
  );

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SiteFormValues>({
    resolver: zodResolver(SiteFormSchema),
    defaultValues: {
      siteName:            site?.siteName ?? '',
      location:            site?.location ?? '',
      gpsLat:              site?.gpsLat ?? undefined,
      gpsLon:              site?.gpsLon ?? undefined,
      siteManagerName:     site?.siteManagerName ?? undefined,
      siteManagerContact:  site?.siteManagerContact ?? undefined,
      guardsRequired:      site?.guardsRequired ?? 1,
      siteType:             (site?.siteType as SiteFormValues['siteType']) ?? 'REGULAR',
      sitePeriodStart: (site as any)?.sitePeriodStart ?? null,
      sitePeriodEnd:   (site as any)?.sitePeriodEnd   ?? null,
      sitePeriodNotes:     (site as any)?.sitePeriodNotes     ?? null,
      armedGuardsRequired: (site as any)?.armedGuardsRequired ?? 0,
      firearmsRequired:    (site as any)?.firearmsRequired    ?? 0,
      batonRequired:       (site as any)?.batonRequired       ?? 0,
      otherWeaponsNotes:   (site as any)?.otherWeaponsNotes   ?? null,
      equipmentDetails:    site?.equipmentDetails ?? undefined,
      specialInstructions: site?.specialInstructions ?? undefined,
    },
  });

  useEffect(() => {
    if (site) {
      reset({
        siteName:            site.siteName,
        location:            site.location,
        gpsLat:              site.gpsLat ?? undefined,
        gpsLon:              site.gpsLon ?? undefined,
        siteManagerName:     site.siteManagerName ?? undefined,
        siteManagerContact:  site.siteManagerContact ?? undefined,
        guardsRequired:      site.guardsRequired,
        siteType:             (site.siteType as SiteFormValues['siteType']) ?? 'REGULAR',
        sitePeriodStart: (site as any).sitePeriodStart ?? null,
        sitePeriodEnd:   (site as any).sitePeriodEnd   ?? null,
        sitePeriodNotes:     (site as any).sitePeriodNotes     ?? null,
        armedGuardsRequired: (site as any).armedGuardsRequired ?? 0,
        firearmsRequired:    (site as any).firearmsRequired    ?? 0,
        batonRequired:       (site as any).batonRequired       ?? 0,
        otherWeaponsNotes:   (site as any).otherWeaponsNotes   ?? null,
        equipmentDetails:    site.equipmentDetails ?? undefined,
        specialInstructions: site.specialInstructions ?? undefined,
      });
      setEquipmentItems(
        site.equipmentItems?.map((e) => ({
          itemName: e.itemName,
          quantity: e.quantity,
          notes:    e.notes ?? '',
        })) ?? [],
      );
      setAllowedShifts(site.allowedShiftTypes ?? []);
      setPeriodStart((site as any).sitePeriodStart
        ? new Date((site as any).sitePeriodStart).toISOString().split('T')[0] : '');
      setPeriodEnd((site as any).sitePeriodEnd
        ? new Date((site as any).sitePeriodEnd).toISOString().split('T')[0] : '');
    }
  }, [site, reset]);

  const siteType            = watch('siteType');
  const specialInstructions = watch('specialInstructions') ?? '';
  const armedGuardsRequired = watch('armedGuardsRequired') ?? 0;
  const firearmsRequired    = watch('firearmsRequired') ?? 0;
  const batonRequired       = watch('batonRequired') ?? 0;
  const otherWeaponsNotes   = watch('otherWeaponsNotes') ?? '';

  function toggleAllowedShift(code: string) {
    setAllowedShifts((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  }

  function addEquipmentItem() {
    setEquipmentItems((prev) => [...prev, { itemName: '', quantity: 1, notes: '' }]);
  }

  function removeEquipmentItem(idx: number) {
    setEquipmentItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateEquipmentItem(idx: number, field: keyof EquipmentItem, value: string | number) {
    setEquipmentItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)),
    );
  }

  const onSubmit = async (values: SiteFormValues) => {
    const needsPeriod = ['TEMPORARY', 'SPECIAL_DUTIES'].includes(values.siteType);
    const payload = {
      ...values,
      sitePeriodStart: needsPeriod && periodStart
        ? new Date(periodStart).toISOString() : null,
      sitePeriodEnd: needsPeriod && periodEnd
        ? new Date(periodEnd).toISOString() : null,
      sitePeriodNotes: needsPeriod ? (values.sitePeriodNotes ?? null) : null,
      defaultShiftType: null,
      allowedShiftTypes: allowedShifts,
      equipmentItems: equipmentItems
        .filter((e) => e.itemName.trim())
        .map((e) => ({ itemName: e.itemName.trim(), quantity: e.quantity, notes: e.notes || undefined })),
    };

    try {
      if (isEdit && site) {
        await updateSite.mutateAsync({ siteId: site.id, clientId, data: payload });
        showToast('Site updated', 'success');
      } else {
        await createSite.mutateAsync({ clientId, data: payload });
        showToast('Site added', 'success');
      }
      onSuccess();
      onClose();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to save site', 'danger');
    }
  };

  return (
    <Modal show onHide={onClose} size="lg">
      <Modal.Header closeButton>
        <Modal.Title className="fs-6 fw-bold">
          {isEdit ? `Edit Site: ${site!.siteName}` : 'Add Site'}
        </Modal.Title>
      </Modal.Header>
      <Form onSubmit={handleSubmit(onSubmit)}>
        <Modal.Body>

          {/* ── SECTION 1: Basic Details ─────────────────────────────── */}
          <Row className="g-3 mb-1">
            <Col md={12}>
              <Form.Group>
                <Form.Label className="small fw-semibold">Site Name <span className="text-danger">*</span></Form.Label>
                <Form.Control {...register('siteName')} isInvalid={!!errors.siteName} />
                <Form.Control.Feedback type="invalid">{errors.siteName?.message}</Form.Control.Feedback>
              </Form.Group>
            </Col>
            <Col md={12}>
              <Form.Label className="small fw-semibold">Site Type <span className="text-danger">*</span></Form.Label>
              <div className="d-flex flex-wrap gap-2 mb-1">
                {([
                  { value: 'REGULAR',        label: '🏢 Regular',        description: 'Ongoing, no end date',         borderColor: '#6c757d', bg: '#F2F4F7',  textColor: '#1A1A1A', activeBg: '#e2e3e5' },
                  { value: 'PERMANENT',      label: '🔒 Permanent',      description: 'Long-term contracted site',    borderColor: '#0d6efd', bg: '#cfe2ff',  textColor: '#084298', activeBg: '#b6d4fe' },
                  { value: 'TEMPORARY',      label: '⏳ Temporary',      description: 'Short-term, has an end date', borderColor: '#ffc107', bg: '#fff3cd',  textColor: '#664d03', activeBg: '#ffe69c' },
                  { value: 'SPECIAL_DUTIES', label: '🎯 Special Duties', description: 'Event or one-off duty',       borderColor: '#dc3545', bg: '#f8d7da',  textColor: '#842029', activeBg: '#f1aeb5' },
                ] as const).map((type) => {
                  const isActive = siteType === type.value;
                  return (
                    <button
                      key={type.value}
                      type="button"
                      onClick={() => {
                        setValue('siteType', type.value);
                        if (!['TEMPORARY', 'SPECIAL_DUTIES'].includes(type.value)) {
                          setPeriodStart(''); setPeriodEnd('');
                          setValue('sitePeriodStart', null); setValue('sitePeriodEnd', null); setValue('sitePeriodNotes', null);
                        }
                      }}
                      style={{
                        padding: '8px 16px', minWidth: '150px', textAlign: 'left', cursor: 'pointer',
                        borderRadius: '0.5rem', transition: 'all 0.15s ease',
                        border: `2px solid ${isActive ? type.borderColor : '#ced4da'}`,
                        background: isActive ? type.activeBg : '#fff',
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: '0.88rem', color: isActive ? type.textColor : '#1A1A1A' }}>{type.label}</div>
                      <div style={{ fontSize: '0.72rem', color: isActive ? type.textColor : '#6c757d', marginTop: '2px' }}>{type.description}</div>
                    </button>
                  );
                })}
              </div>
              {/* Hidden register field keeps RHF in sync */}
              <input type="hidden" {...register('siteType')} />
            </Col>

            {/* Period prompt — appears immediately on type selection */}
            {['TEMPORARY', 'SPECIAL_DUTIES'].includes(siteType) && (
              <Col md={12}>
                <div style={{
                  padding: '16px', borderRadius: '0.5rem',
                  background: siteType === 'TEMPORARY' ? '#fff3cd' : '#f8d7da',
                  border: `1px solid ${siteType === 'TEMPORARY' ? '#ffc107' : '#f5c2c7'}`,
                  borderLeft: `4px solid ${siteType === 'TEMPORARY' ? '#ffc107' : '#dc3545'}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <span style={{ fontSize: '1.2rem' }}>{siteType === 'TEMPORARY' ? '⏳' : '🎯'}</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.92rem', color: siteType === 'TEMPORARY' ? '#664d03' : '#842029' }}>
                        {siteType === 'TEMPORARY' ? 'Temporary Assignment Period' : 'Special Duty Period'}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: siteType === 'TEMPORARY' ? '#856404' : '#b02a37', marginTop: '2px' }}>
                        {siteType === 'TEMPORARY'
                          ? 'Select the start and end date for this temporary assignment.'
                          : 'Select the exact dates this special duty covers. Special duties are typically 1–7 days.'}
                      </div>
                    </div>
                  </div>

                  <Form.Label className="fw-bold small">
                    {siteType === 'TEMPORARY' ? 'Assignment Period' : 'Duty Period'}{' '}
                    <span className="text-danger">*</span>
                  </Form.Label>
                  <DateRangePicker
                    startDate={periodStart}
                    endDate={periodEnd}
                    onRangeChange={(start, end) => {
                      setPeriodStart(start); setPeriodEnd(end);
                      setValue('sitePeriodStart', start ? new Date(start).toISOString() : null);
                      setValue('sitePeriodEnd', end ? new Date(end).toISOString() : null);
                    }}
                    isInvalid={!!errors.sitePeriodStart}
                    errorMessage={errors.sitePeriodStart?.message as string}
                    placeholder={siteType === 'TEMPORARY' ? 'Select assignment start and end...' : 'Select duty start and end dates...'}
                  />

                  {periodStart && periodEnd && (() => {
                    const days = Math.ceil((new Date(periodEnd).getTime() - new Date(periodStart).getTime()) / (1000 * 60 * 60 * 24)) + 1;
                    return (
                      <div className="mt-2 d-flex align-items-center gap-2 flex-wrap">
                        <Badge bg={siteType === 'TEMPORARY' ? 'warning' : 'danger'} text={siteType === 'TEMPORARY' ? 'dark' : undefined} style={{ fontSize: '0.8rem' }}>
                          📅 {new Date(periodStart).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                          {' → '}
                          {new Date(periodEnd).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </Badge>
                        <Badge bg="secondary" style={{ fontSize: '0.8rem' }}>{days} day{days !== 1 ? 's' : ''}</Badge>
                        {siteType === 'SPECIAL_DUTIES' && days > 14 && (
                          <span style={{ fontSize: '0.75rem', color: '#856404', fontWeight: 500 }}>
                            ⚠️ Special duties are typically short. Consider using Temporary instead.
                          </span>
                        )}
                        {siteType === 'TEMPORARY' && days <= 7 && (
                          <span style={{ fontSize: '0.75rem', color: '#856404', fontWeight: 500 }}>
                            💡 For assignments under 7 days, consider using Special Duties.
                          </span>
                        )}
                      </div>
                    );
                  })()}

                  <Form.Group className="mt-3">
                    <Form.Label className="small fw-bold">
                      {siteType === 'TEMPORARY' ? 'Assignment Description' : 'Nature of Duty'}
                      <span className="text-muted fw-normal ms-1">(optional)</span>
                    </Form.Label>
                    <Form.Control
                      type="text"
                      placeholder={siteType === 'TEMPORARY'
                        ? 'e.g. Nile Breweries construction site — 3-month project'
                        : 'e.g. URA Annual Gala Dinner, Presidential Visit Security'}
                      maxLength={500}
                      {...register('sitePeriodNotes')}
                    />
                  </Form.Group>
                </div>
              </Col>
            )}

            {/* Confirmation notes for non-period types */}
            {siteType === 'REGULAR' && (
              <Col md={12}>
                <div style={{ padding: '10px 14px', background: '#F2F4F7', borderRadius: '0.5rem', border: '1px solid #D0D5DD', borderLeft: '4px solid #6c757d', fontSize: '0.82rem', color: '#4A5568' }}>
                  ✅ Regular sites are ongoing assignments with no defined end date. No period selection needed.
                </div>
              </Col>
            )}
            {siteType === 'PERMANENT' && (
              <Col md={12}>
                <div style={{ padding: '10px 14px', background: '#cfe2ff', borderRadius: '0.5rem', border: '1px solid #9ec5fe', borderLeft: '4px solid #0d6efd', fontSize: '0.82rem', color: '#084298' }}>
                  🔒 Permanent sites are long-term contracted assignments. The contract governs the duration — no period selection needed here.
                </div>
              </Col>
            )}

            <Col md={12}>
              <Form.Group>
                <Form.Label className="small fw-semibold">Location / Address <span className="text-danger">*</span></Form.Label>
                <Form.Control as="textarea" rows={2} {...register('location')} isInvalid={!!errors.location} />
                <Form.Control.Feedback type="invalid">{errors.location?.message}</Form.Control.Feedback>
              </Form.Group>
            </Col>

            <Col md={4}>
              <Form.Group>
                <Form.Label className="small">Guards Required</Form.Label>
                <Form.Control type="number" min={1} {...register('guardsRequired', { valueAsNumber: true })} isInvalid={!!errors.guardsRequired} />
                <Form.Control.Feedback type="invalid">{errors.guardsRequired?.message}</Form.Control.Feedback>
              </Form.Group>
            </Col>
            <Col md={4}>
              <Form.Group>
                <Form.Label className="small">GPS Latitude <span className="text-muted">(optional)</span></Form.Label>
                <Form.Control type="number" step="any" placeholder="e.g. 0.3163" {...register('gpsLat', { valueAsNumber: true })} isInvalid={!!errors.gpsLat} />
              </Form.Group>
            </Col>
            <Col md={4}>
              <Form.Group>
                <Form.Label className="small">GPS Longitude <span className="text-muted">(optional)</span></Form.Label>
                <Form.Control type="number" step="any" placeholder="e.g. 32.5822" {...register('gpsLon', { valueAsNumber: true })} isInvalid={!!errors.gpsLon} />
              </Form.Group>
            </Col>

            <Col md={6}>
              <Form.Group>
                <Form.Label className="small">Site Manager Name <span className="text-muted">(optional)</span></Form.Label>
                <Form.Control {...register('siteManagerName')} />
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group>
                <Form.Label className="small">Site Manager Contact <span className="text-muted">(optional)</span></Form.Label>
                <Form.Control type="tel" {...register('siteManagerContact')} />
              </Form.Group>
            </Col>
          </Row>

          {/* ── SECTION 2: Security Requirements ─────────────────────── */}
          <hr />
          <h6 className="fw-bold mb-3" style={{ color: '#1B3A6B' }}>Security Requirements</h6>

          <div className="mb-1 text-muted" style={{ fontSize: '0.8rem' }}>
            Enter 0 for any item not required at this site.
          </div>

          {/* Quantity rows */}
          <div style={{ border: '1px solid #ced4da', borderRadius: '0.5rem', overflow: 'hidden', marginBottom: '12px' }}>

            {/* Armed Guards */}
            <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid #e9ecef', background: armedGuardsRequired > 0 ? '#FEF9E7' : '#fff', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, fontSize: '0.88rem' }}>🔫 Armed Guards Required</div>
                <div style={{ fontSize: '0.75rem', color: '#6c757d', marginTop: '2px' }}>Number of guards who must carry arms</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button type="button" onClick={() => setValue('armedGuardsRequired', Math.max(0, armedGuardsRequired - 1))} style={{ width: '28px', height: '28px', borderRadius: '50%', border: '1px solid #ced4da', background: '#f8f9fa', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, fontWeight: 'bold', color: '#1B3A6B' }}>−</button>
                <input type="number" min={0} max={999} style={{ width: '60px', textAlign: 'center', border: '1px solid #ced4da', borderRadius: '4px', padding: '4px', fontSize: '0.95rem', fontWeight: 600, color: armedGuardsRequired > 0 ? '#1B3A6B' : '#6c757d' }} {...register('armedGuardsRequired', { valueAsNumber: true, min: 0 })} />
                <button type="button" onClick={() => setValue('armedGuardsRequired', armedGuardsRequired + 1)} style={{ width: '28px', height: '28px', borderRadius: '50%', border: '1px solid #ced4da', background: '#f8f9fa', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, fontWeight: 'bold', color: '#1B3A6B' }}>+</button>
              </div>
            </div>

            {/* Firearms */}
            <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid #e9ecef', background: firearmsRequired > 0 ? '#FEF9E7' : '#fff', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, fontSize: '0.88rem' }}>🔥 Firearms</div>
                <div style={{ fontSize: '0.75rem', color: '#6c757d', marginTop: '2px' }}>Number of firearms to be deployed</div>
                {firearmsRequired > 0 && armedGuardsRequired === 0 && (
                  <div style={{ fontSize: '0.72rem', color: '#dc3545', marginTop: '2px', fontWeight: 500 }}>⚠️ Set armed guards required above</div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button type="button" onClick={() => setValue('firearmsRequired', Math.max(0, firearmsRequired - 1))} style={{ width: '28px', height: '28px', borderRadius: '50%', border: '1px solid #ced4da', background: '#f8f9fa', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, fontWeight: 'bold', color: '#1B3A6B' }}>−</button>
                <input type="number" min={0} max={999} style={{ width: '60px', textAlign: 'center', border: '1px solid #ced4da', borderRadius: '4px', padding: '4px', fontSize: '0.95rem', fontWeight: 600, color: firearmsRequired > 0 ? '#1B3A6B' : '#6c757d' }} {...register('firearmsRequired', { valueAsNumber: true, min: 0 })} />
                <button type="button" onClick={() => setValue('firearmsRequired', firearmsRequired + 1)} style={{ width: '28px', height: '28px', borderRadius: '50%', border: '1px solid #ced4da', background: '#f8f9fa', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, fontWeight: 'bold', color: '#1B3A6B' }}>+</button>
              </div>
            </div>

            {/* Batons */}
            <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', background: batonRequired > 0 ? '#FEF9E7' : '#fff', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, fontSize: '0.88rem' }}>🛡️ Batons / General Weapons</div>
                <div style={{ fontSize: '0.75rem', color: '#6c757d', marginTop: '2px' }}>Total non-firearm weapons</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button type="button" onClick={() => setValue('batonRequired', Math.max(0, batonRequired - 1))} style={{ width: '28px', height: '28px', borderRadius: '50%', border: '1px solid #ced4da', background: '#f8f9fa', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, fontWeight: 'bold', color: '#1B3A6B' }}>−</button>
                <input type="number" min={0} max={999} style={{ width: '60px', textAlign: 'center', border: '1px solid #ced4da', borderRadius: '4px', padding: '4px', fontSize: '0.95rem', fontWeight: 600, color: batonRequired > 0 ? '#1B3A6B' : '#6c757d' }} {...register('batonRequired', { valueAsNumber: true, min: 0 })} />
                <button type="button" onClick={() => setValue('batonRequired', batonRequired + 1)} style={{ width: '28px', height: '28px', borderRadius: '50%', border: '1px solid #ced4da', background: '#f8f9fa', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, fontWeight: 'bold', color: '#1B3A6B' }}>+</button>
              </div>
            </div>
          </div>

          {/* Other weapons notes */}
          <Form.Group className="mb-3">
            <Form.Label className="small fw-bold">
              Other Security Equipment <span className="text-muted fw-normal">(optional)</span>
            </Form.Label>
            <Form.Control
              type="text"
              placeholder="e.g. 2 × Dog Units, 1 × Guard Tower, Night Vision Goggles"
              maxLength={500}
              {...register('otherWeaponsNotes')}
            />
            <Form.Text className="text-muted">Any equipment not covered above</Form.Text>
          </Form.Group>

          {/* Security summary */}
          {(armedGuardsRequired > 0 || firearmsRequired > 0 || batonRequired > 0) && (
            <div style={{ background: '#D0EDE9', borderRadius: '0.5rem', padding: '10px 14px', fontSize: '0.82rem', color: '#1B3A6B', marginBottom: '12px' }}>
              <div className="fw-bold mb-1">🔒 Security Profile Summary</div>
              <div className="d-flex flex-wrap gap-2">
                {armedGuardsRequired > 0 && <Badge bg="warning" text="dark">🔫 {armedGuardsRequired} Armed Guard(s)</Badge>}
                {firearmsRequired > 0 && <Badge bg="danger">🔥 {firearmsRequired} Firearm(s)</Badge>}
                {batonRequired > 0 && <Badge bg="secondary">🛡️ {batonRequired} Baton(s)</Badge>}
                {otherWeaponsNotes && <Badge bg="dark">📋 {otherWeaponsNotes}</Badge>}
              </div>
            </div>
          )}

          <Form.Label className="small fw-semibold">Specific Equipment Required</Form.Label>
          {equipmentItems.length > 0 ? (
            <Table size="sm" bordered className="mb-2">
              <thead className="table-light">
                <tr>
                  <th>Item Name</th>
                  <th style={{ width: 80 }}>Qty</th>
                  <th>Notes</th>
                  <th style={{ width: 40 }} />
                </tr>
              </thead>
              <tbody>
                {equipmentItems.map((item, idx) => (
                  <tr key={idx}>
                    <td>
                      <Form.Control
                        size="sm"
                        value={item.itemName}
                        onChange={(e) => updateEquipmentItem(idx, 'itemName', e.target.value)}
                        placeholder="e.g. Baton"
                      />
                    </td>
                    <td>
                      <Form.Control
                        size="sm"
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(e) => updateEquipmentItem(idx, 'quantity', parseInt(e.target.value) || 1)}
                      />
                    </td>
                    <td>
                      <Form.Control
                        size="sm"
                        value={item.notes}
                        onChange={(e) => updateEquipmentItem(idx, 'notes', e.target.value)}
                        placeholder="optional"
                      />
                    </td>
                    <td className="text-center">
                      <Button size="sm" variant="outline-danger" onClick={() => removeEquipmentItem(idx)}>×</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <p className="text-muted small mb-2">No specific equipment added. Use the button below to add items.</p>
          )}
          <Button size="sm" variant="outline-secondary" onClick={addEquipmentItem} className="mb-3">
            + Add Equipment Item
          </Button>

          <Form.Group className="mb-0">
            <Form.Label className="small">Additional Equipment Notes <span className="text-muted">(optional)</span></Form.Label>
            <Form.Control
              as="textarea"
              rows={2}
              placeholder="Any additional equipment details not covered above..."
              {...register('equipmentDetails')}
            />
          </Form.Group>

          {/* ── SECTION 3: Shift Configuration ───────────────────────── */}
          <hr />
          <h6 className="fw-bold mb-3" style={{ color: '#1B3A6B' }}>Shift Configuration</h6>

          <Form.Group className="mb-3">
            <Form.Label className="small fw-semibold">Allowed Shift Types at this site</Form.Label>
            <Form.Text className="text-muted d-block mb-2">Leave all unchecked to allow any shift type. The shift is selected at deployment time.</Form.Text>
            {shiftTypes.length === 0 ? (
              <p className="text-muted small"><Spinner size="sm" className="me-1" />Loading shift types...</p>
            ) : (
              <div className="d-flex gap-4 flex-wrap">
                {shiftTypes.map((shift) => (
                  <Form.Check
                    key={shift.id}
                    type="checkbox"
                    id={`shift-${shift.code}`}
                    label={
                      <span>
                        {shift.name}
                        {shift.startTime && (
                          <span className="text-muted ms-2 small">{shift.startTime}–{shift.endTime}</span>
                        )}
                      </span>
                    }
                    checked={allowedShifts.includes(shift.code)}
                    onChange={() => toggleAllowedShift(shift.code)}
                  />
                ))}
              </div>
            )}
          </Form.Group>

          {/* ── SECTION 4: Special Instructions ──────────────────────── */}
          <hr />
          <h6 className="fw-bold mb-3" style={{ color: '#1B3A6B' }}>Special Instructions</h6>

          <Form.Group>
            <Form.Control
              as="textarea"
              rows={4}
              placeholder="Any specific instructions guards must follow at this site. e.g. dress code, access procedures, contact persons on site, emergency protocols..."
              {...register('specialInstructions')}
              maxLength={2000}
            />
            <Form.Text className="text-muted">{specialInstructions.length} / 2000</Form.Text>
          </Form.Group>

        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            size="sm"
            style={{ backgroundColor: '#1B3A6B', borderColor: '#1B3A6B' }}
            disabled={isSubmitting}
          >
            {isSubmitting ? <><Spinner size="sm" className="me-1" />Saving…</> : isEdit ? 'Save Changes' : 'Add Site'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
