import { useEffect, useState } from 'react';
import { Alert, Button, Card, Col, Form, Modal, Row, Spinner, Table } from 'react-bootstrap';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useCreateSite, useUpdateSite } from '../../hooks/useClients';
import { useShiftTypes } from '../../hooks/useSettings';
import { useToast } from '../../context/ToastContext';
import type { SiteResponse } from '@stap/shared';
import { z } from 'zod';

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
  siteType:            z.enum(['REGULAR', 'TEMPORARY', 'SPECIAL_DUTIES', 'PERMANENT']).default('REGULAR'),
  requiresFirearms:    z.boolean().default(false),
  requiresArmedGuards: z.boolean().default(false),
  requiresWeapons:     z.boolean().default(false),
  equipmentDetails:    z.string().max(1000).optional().transform((v) => v || undefined),
  defaultShiftType:    z.string().optional().transform((v) => v || undefined),
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
      siteType:            (site?.siteType as SiteFormValues['siteType']) ?? 'REGULAR',
      requiresFirearms:    site?.requiresFirearms ?? false,
      requiresArmedGuards: site?.requiresArmedGuards ?? false,
      requiresWeapons:     site?.requiresWeapons ?? false,
      equipmentDetails:    site?.equipmentDetails ?? undefined,
      defaultShiftType:    site?.defaultShiftType ?? undefined,
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
        siteType:            (site.siteType as SiteFormValues['siteType']) ?? 'REGULAR',
        requiresFirearms:    site.requiresFirearms,
        requiresArmedGuards: site.requiresArmedGuards,
        requiresWeapons:     site.requiresWeapons,
        equipmentDetails:    site.equipmentDetails ?? undefined,
        defaultShiftType:    site.defaultShiftType ?? undefined,
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
    }
  }, [site, reset]);

  const siteType            = watch('siteType');
  const specialInstructions = watch('specialInstructions') ?? '';
  const defaultShiftType    = watch('defaultShiftType');

  // Auto-clear defaultShiftType when it falls outside the allowed list
  useEffect(() => {
    if (allowedShifts.length > 0 && defaultShiftType && !allowedShifts.includes(defaultShiftType)) {
      setValue('defaultShiftType', undefined);
    }
  }, [allowedShifts, defaultShiftType, setValue]);

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
    const payload = {
      ...values,
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

  // Which shifts to show in the Default Shift dropdown
  const availableForDefault = shiftTypes.filter(
    (s) => allowedShifts.length === 0 || allowedShifts.includes(s.code),
  );

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
            <Col md={8}>
              <Form.Group>
                <Form.Label className="small fw-semibold">Site Name <span className="text-danger">*</span></Form.Label>
                <Form.Control {...register('siteName')} isInvalid={!!errors.siteName} />
                <Form.Control.Feedback type="invalid">{errors.siteName?.message}</Form.Control.Feedback>
              </Form.Group>
            </Col>
            <Col md={4}>
              <Form.Group>
                <Form.Label className="small fw-semibold">Site Type <span className="text-danger">*</span></Form.Label>
                <Form.Select {...register('siteType')}>
                  {SITE_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </Form.Select>
              </Form.Group>
            </Col>

            {siteType === 'TEMPORARY' && (
              <Col md={12}>
                <Alert variant="warning" className="py-2 mb-0">
                  <small>⏳ <strong>Temporary site</strong> — for short-term assignments. Set a clear end date in the contract notes.</small>
                </Alert>
              </Col>
            )}
            {siteType === 'SPECIAL_DUTIES' && (
              <Col md={12}>
                <Alert variant="info" className="py-2 mb-0">
                  <small>🎯 <strong>Special Duties</strong> — requires specific briefing. Complete equipment requirements and special instructions below.</small>
                </Alert>
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

          <Card className="mb-3 border-0 bg-light">
            <Card.Body className="py-2">
              <Row>
                <Col md={4}>
                  <Form.Check type="switch" id="requiresArmedGuards" label="Armed Guards Required" {...register('requiresArmedGuards')} />
                  <small className="text-muted">Guards must be certified armed</small>
                </Col>
                <Col md={4}>
                  <Form.Check type="switch" id="requiresFirearms" label="Firearms Required" {...register('requiresFirearms')} />
                  <small className="text-muted">Site requires firearm deployment</small>
                </Col>
                <Col md={4}>
                  <Form.Check type="switch" id="requiresWeapons" label="Other Weapons Required" {...register('requiresWeapons')} />
                  <small className="text-muted">Batons, pepper spray, etc.</small>
                </Col>
              </Row>
            </Card.Body>
          </Card>

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
            <Form.Text className="text-muted d-block mb-2">Leave all unchecked to allow any shift type.</Form.Text>
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

          <Form.Group className="mb-0">
            <Form.Label className="small fw-semibold">Default Shift for this site</Form.Label>
            <Form.Text className="text-muted d-block mb-1">Auto-selects on the roster when this site is chosen.</Form.Text>
            <Form.Select {...register('defaultShiftType')}>
              <option value="">— No default —</option>
              {availableForDefault.map((s) => (
                <option key={s.code} value={s.code}>{s.name}</option>
              ))}
            </Form.Select>
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
