import { useState } from 'react';
import {
  Alert, Badge, Breadcrumb, Button, Card, Col, Form, Modal, Row, Spinner, Tab, Table, Tabs,
} from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import {
  GUN_TYPES, GUN_OWNERSHIP, GUN_CONDITIONS, GUN_STATUSES, GUN_MOVEMENT_LABELS, ARMOURY_LABEL,
  type GunResponse, type GunCondition,
} from '@security360/shared';
import {
  useGuns, useGunInventory, useGun, useGunMovements,
  useRegisterGun, useUpdateGun, useDeleteGun, useDeployGun, useWithdrawGun, useTransferGun,
} from '../../hooks/useGuns';
import { useAllSites } from '../../hooks/useClients';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { useToast } from '../../context/ToastContext';
import { getApiErrorMessage } from '../../lib/api';
import { useHasPermission } from '../../context/AuthContext';

const NAVY = '#1B3A6B';

const TH: React.CSSProperties = {
  padding: '8px 10px', color: 'white', fontWeight: 700,
  fontSize: '0.76rem', textAlign: 'left', whiteSpace: 'nowrap',
};

const SERIAL: React.CSSProperties = {
  background: '#F2F4F7', padding: '2px 6px', borderRadius: '3px', fontSize: '0.75rem',
};

const today = () => new Date().toISOString().slice(0, 10);

/** Ownership with its licence rate, as it appears in the list and the detail. */
function ownershipCell(gun: { ownership: string; licenceFee: number | null }) {
  const cfg = GUN_OWNERSHIP.find((o) => o.value === gun.ownership);
  if (!cfg) return <span className="text-muted">—</span>;
  return (
    <div>
      <div style={{ fontWeight: 600, fontSize: '0.8rem', color: cfg.colour }}>
        {cfg.icon} {cfg.label}
      </div>
      <div className="text-muted" style={{ fontSize: '0.68rem' }}>
        UGX {(gun.licenceFee ?? cfg.fee).toLocaleString()} {cfg.periodLabel}
      </div>
    </div>
  );
}

/** Share of the issued rounds still held; 0 issued reads as full, not as empty. */
const bulletPct = (g: { totalBullets: number; currentBullets: number }) =>
  g.totalBullets <= 0 ? 100 : Math.min(100, Math.round((g.currentBullets / g.totalBullets) * 100));

/** Red once a gun is below a third of what it was issued with. */
const bulletColour = (g: { totalBullets: number; currentBullets: number }) =>
  bulletPct(g) < 30 ? '#C0392B' : '#1E8449';

function conditionBadge(condition: GunCondition) {
  const map: Record<GunCondition, string> = {
    GOOD: 'success', FAIR: 'warning', NEEDS_REPAIR: 'danger', RETIRED: 'secondary',
  };
  return (
    <Badge bg={map[condition]} text={condition === 'FAIR' ? 'dark' : undefined} style={{ fontSize: '0.68rem' }}>
      {condition.replace(/_/g, ' ')}
    </Badge>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Register modal ─────────────────────────────────────────────────────────────

/** One form for both registering and editing — the fields are the same. */
function GunFormModal({ gun, onClose }: { gun?: GunResponse | null; onClose: () => void }) {
  const { showToast } = useToast();
  const register = useRegisterGun();
  const update   = useUpdateGun();
  const editing  = !!gun;

  const [serialNumber, setSerialNumber] = useState(gun?.serialNumber ?? '');
  const [gunType, setGunType]           = useState<string>(gun?.gunType ?? GUN_TYPES[0].value);
  const [ownership, setOwnership]       = useState<string>(gun?.ownership ?? 'COMPANY');
  const [manufacturer, setManufacturer] = useState(gun?.manufacturer ?? '');
  const [condition, setCondition]       = useState<GunCondition>(gun?.condition ?? 'GOOD');
  const [bullets, setBullets]           = useState<number | ''>(gun?.totalBullets ?? 0);
  const [notes, setNotes]               = useState(gun?.notes ?? '');
  const [error, setError]               = useState('');

  const ownershipCfg = GUN_OWNERSHIP.find((o) => o.value === ownership);
  const pending = register.isPending || update.isPending;

  // A gun registered under an older list keeps a type the dropdown no longer
  // offers. Showing it rather than silently switching to AK-47 keeps the edit
  // honest — the person can leave it or pick a current one deliberately.
  const legacyType = editing && !GUN_TYPES.some((t) => t.value === gunType) ? gunType : null;

  const submit = () => {
    if (!serialNumber.trim()) { setError('Serial number is required.'); return; }
    setError('');
    const body = {
      serialNumber: serialNumber.trim(),
      gunType:      gunType as never,
      ownership:    ownership as never,
      manufacturer: manufacturer.trim() || null,
      condition,
      totalBullets: Number(bullets) || 0,
      notes:        notes.trim() || null,
    };
    const done = (verb: string) => {
      showToast(`Gun ${serialNumber.trim()} ${verb}`, 'success');
      onClose();
    };
    if (editing) {
      update.mutate({ id: gun!.id, body }, {
        onSuccess: () => done('updated'),
        onError:   (err) => setError(getApiErrorMessage(err, 'Could not update the gun.')),
      });
    } else {
      register.mutate(body, {
        onSuccess: () => done('registered into the armoury'),
        onError:   (err) => setError(getApiErrorMessage(err, 'Could not register the gun.')),
      });
    }
  };

  return (
    <Modal show onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: '1.05rem' }}>
          {editing ? `🔫 Edit Gun — ${gun!.systemId ?? gun!.serialNumber}` : '🔫 Register New Gun'}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && <Alert variant="danger" className="py-2 small">{error}</Alert>}

        <Row className="g-2 mb-3">
          <Col sm={7}>
            <Form.Label className="fw-bold small">Serial Number <span className="text-danger">*</span></Form.Label>
            <Form.Control
              value={serialNumber}
              maxLength={60}
              placeholder="e.g. AK-2026-001"
              onChange={(e) => { setSerialNumber(e.target.value); setError(''); }}
            />
          </Col>
          <Col sm={5}>
            <Form.Label className="fw-bold small">Gun Type <span className="text-danger">*</span></Form.Label>
            <Form.Select value={gunType} onChange={(e) => setGunType(e.target.value)}>
              {legacyType && <option value={legacyType}>{legacyType} (retired type)</option>}
              {GUN_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Form.Select>
          </Col>
        </Row>

        <Row className="g-2 mb-3">
          <Col sm={6}>
            <Form.Label className="fw-bold small">Manufacturer</Form.Label>
            <Form.Control value={manufacturer} maxLength={100} placeholder="e.g. Kalashnikov"
              onChange={(e) => setManufacturer(e.target.value)} />
          </Col>
        </Row>

        <Form.Group className="mb-3">
          <Form.Label className="fw-bold small">Ownership <span className="text-danger">*</span></Form.Label>
          <div className="d-flex gap-2">
            {GUN_OWNERSHIP.map((o) => {
              const active = ownership === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setOwnership(o.value)}
                  style={{
                    flex: 1, textAlign: 'left', padding: '10px 12px',
                    border: `2px solid ${active ? o.colour : '#ced4da'}`,
                    borderRadius: '0.5rem',
                    background: active ? `${o.colour}14` : 'white',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: '1.15rem' }}>{o.icon}</div>
                  <div style={{ fontWeight: 700, color: o.colour, fontSize: '0.85rem' }}>{o.label}</div>
                  <div className="text-muted" style={{ fontSize: '0.72rem' }}>{o.description}</div>
                </button>
              );
            })}
          </div>
          {ownershipCfg && (
            <Form.Text className="text-muted">
              Licence fee of UGX {ownershipCfg.fee.toLocaleString()} {ownershipCfg.periodLabel} is
              set from this — it is not entered here.
            </Form.Text>
          )}
        </Form.Group>

        <Row className="g-2 mb-3">
          <Col sm={6}>
            <Form.Label className="fw-bold small">Condition</Form.Label>
            <Form.Select value={condition} onChange={(e) => setCondition(e.target.value as GunCondition)}>
              {GUN_CONDITIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Form.Select>
          </Col>
          <Col sm={6}>
            <Form.Label className="fw-bold small">Total bullets <span className="text-danger">*</span></Form.Label>
            <Form.Control
              type="number" min={0} value={bullets}
              onChange={(e) => setBullets(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </Col>
        </Row>

        <Form.Group>
          <Form.Label className="fw-bold small">Notes <span className="text-muted fw-normal">(optional)</span></Form.Label>
          <Form.Control as="textarea" rows={2} maxLength={1000} value={notes}
            onChange={(e) => setNotes(e.target.value)} />
        </Form.Group>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onClose} disabled={pending}>Cancel</Button>
        <Button style={{ background: NAVY, borderColor: NAVY }} onClick={submit} disabled={pending}>
          {pending
            ? <><Spinner as="span" size="sm" animation="border" className="me-1" /> Saving…</>
            : editing ? 'Save Changes' : 'Register Gun'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

// ── Gun history modal ──────────────────────────────────────────────────────────

function GunHistoryModal({ gunId, onClose }: { gunId: string; onClose: () => void }) {
  const { data: gun, isLoading } = useGun(gunId);

  return (
    <Modal show onHide={onClose} size="lg" centered>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: '1.05rem' }}>
          {gun ? <>🔫 {gun.serialNumber} — chain of custody</> : 'Gun history'}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {isLoading || !gun ? (
          <div className="text-center py-4"><Spinner animation="border" size="sm" /></div>
        ) : (
          <>
            <Row className="g-2 mb-3">
              <Col sm={3}><div className="text-muted small">Type</div><div className="fw-bold">{gun.gunTypeLabel}</div></Col>
              <Col sm={3}><div className="text-muted small">Ownership</div><div>{ownershipCell(gun)}</div></Col>
              <Col sm={3}><div className="text-muted small">Condition</div><div>{conditionBadge(gun.condition)}</div></Col>
              <Col sm={3}>
                <div className="text-muted small">Currently at</div>
                <div className="fw-bold">{gun.currentSiteName ?? ARMOURY_LABEL}</div>
              </Col>
            </Row>

            <Row className="g-2 mb-3 align-items-end">
              <Col xs={4}>
                <div className="text-muted small">Issued with</div>
                <div className="fw-bold" style={{ fontSize: '1.1rem' }}>{gun.totalBullets}</div>
              </Col>
              <Col xs={4}>
                <div className="text-muted small">Holding now</div>
                <div className="fw-bold" style={{ fontSize: '1.1rem', color: bulletColour(gun) }}>
                  {gun.currentBullets}
                </div>
              </Col>
              <Col xs={4}>
                <div className="text-muted small mb-1">Rounds remaining</div>
                <div style={{ background: '#e9ecef', borderRadius: 10, height: 8, overflow: 'hidden' }}>
                  <div style={{
                    width: `${bulletPct(gun)}%`, height: '100%',
                    background: bulletColour(gun), borderRadius: 10,
                  }} />
                </div>
              </Col>
            </Row>

            {gun.movements.length === 0 ? (
              <div style={{ border: '2px dashed #ced4da', borderRadius: '0.5rem', padding: '18px',
                            textAlign: 'center', color: '#6c757d', fontSize: '0.82rem' }}>
                No movements recorded — this gun has not left the armoury.
              </div>
            ) : (
              <div>
                {gun.movements.map((m) => (
                  <div key={m.id} style={{
                    border: '1px solid #e9ecef', borderRadius: '0.5rem',
                    padding: '10px 14px', marginBottom: '8px',
                    borderLeft: `4px solid ${
                      m.movementType === 'DEPLOYMENT' ? '#1B3A6B'
                        : m.movementType === 'WITHDRAWAL' ? '#1E8449' : '#E8701A'}`,
                  }}>
                    <div className="d-flex justify-content-between align-items-start">
                      <div>
                        <div className="fw-bold" style={{ fontSize: '0.85rem' }}>
                          {GUN_MOVEMENT_LABELS[m.movementType]}
                        </div>
                        <div className="text-muted small">
                          {m.fromSite?.siteName ?? ARMOURY_LABEL} → {m.toSite?.siteName ?? ARMOURY_LABEL}
                          {' · '}{m.bullets} round{m.bullets === 1 ? '' : 's'}
                        </div>
                        {m.reason && <div className="text-muted small fst-italic mt-1">{m.reason}</div>}
                        {m.notes && <div className="text-muted small mt-1">{m.notes}</div>}
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: '0.78rem', color: '#6c757d' }}>{formatDate(m.movementDate)}</div>
                        <div style={{ fontSize: '0.72rem', color: '#adb5bd' }}>by {m.recordedBy.name}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>Close</Button>
      </Modal.Footer>
    </Modal>
  );
}

// ── Movement form, shared by all three tabs ────────────────────────────────────

type MovementKind = 'DEPLOY' | 'WITHDRAW' | 'TRANSFER';

const KIND_CONFIG: Record<MovementKind, {
  title:      string;
  blurb:      string;
  gunStatus:  string;
  emptyGuns:  string;
  bulletLabel: string;
  siteLabel:  string;
  button:     string;
  showReason: boolean;
}> = {
  DEPLOY: {
    title: '🚀 Deploy a gun to a site',
    blurb: 'Sends a gun out of the armoury to a site.',
    gunStatus: GUN_STATUSES.IN_ARMOURY,
    emptyGuns: 'No guns in the armoury to deploy.',
    bulletLabel: 'Rounds issued',
    siteLabel: 'Deploy to site',
    button: '🚀 Deploy to site',
    showReason: false,
  },
  WITHDRAW: {
    title: '↩️ Withdraw a gun to the armoury',
    blurb: 'Brings a gun back from a site into the armoury.',
    gunStatus: GUN_STATUSES.DEPLOYED,
    emptyGuns: 'No guns are currently deployed.',
    bulletLabel: 'Rounds returned',
    siteLabel: 'Withdrawing from',
    button: '↩️ Withdraw to armoury',
    showReason: true,
  },
  TRANSFER: {
    title: '🔄 Transfer a gun between sites',
    blurb: 'Moves a deployed gun straight to another site, without returning it to the armoury first.',
    gunStatus: GUN_STATUSES.DEPLOYED,
    emptyGuns: 'No guns are currently deployed.',
    bulletLabel: 'Rounds carried',
    siteLabel: 'Transfer to site',
    button: '🔄 Transfer to site',
    showReason: true,
  },
};

function MovementForm({ kind, guns }: { kind: MovementKind; guns: GunResponse[] }) {
  const cfg = KIND_CONFIG[kind];
  const { showToast } = useToast();
  const { data: sitesPage } = useAllSites();
  const sites = sitesPage ?? [];

  const deploy   = useDeployGun();
  const withdraw = useWithdrawGun();
  const transfer = useTransferGun();
  const pending  = deploy.isPending || withdraw.isPending || transfer.isPending;

  const [gunId, setGunId]     = useState('');
  const [siteId, setSiteId]   = useState('');
  const [bullets, setBullets] = useState<number | ''>(0);
  const [date, setDate]       = useState(today());
  const [reason, setReason]   = useState('');
  const [notes, setNotes]     = useState('');
  const [error, setError]     = useState('');

  const eligible    = guns.filter((g) => g.status === cfg.gunStatus && g.condition !== 'RETIRED');
  const selectedGun = eligible.find((g) => g.id === gunId) ?? null;

  const reset = () => {
    setGunId(''); setSiteId(''); setBullets(0); setReason(''); setNotes(''); setError('');
  };

  const submit = () => {
    if (!gunId) { setError('Select a gun.'); return; }
    if (kind !== 'WITHDRAW' && !siteId) { setError('Select a destination site.'); return; }
    setError('');

    const common = {
      gunId,
      bullets:      Number(bullets) || 0,
      movementDate: new Date(`${date}T00:00:00.000Z`).toISOString(),
      notes:        notes.trim() || null,
    };
    const handlers = {
      onSuccess: () => { showToast('Movement recorded', 'success'); reset(); },
      onError:   (err: unknown) => setError(getApiErrorMessage(err, 'Could not record the movement.')),
    };

    if (kind === 'DEPLOY') {
      deploy.mutate({ ...common, siteId }, handlers);
    } else if (kind === 'WITHDRAW') {
      withdraw.mutate(
        { ...common, fromSiteId: selectedGun?.currentSiteId ?? '', reason: reason.trim() || null },
        handlers,
      );
    } else {
      transfer.mutate({ ...common, toSiteId: siteId, reason: reason.trim() || null }, handlers);
    }
  };

  const siteOptions = sites
    // A transfer to the site the gun is already on is rejected by the API, so
    // it is not offered here either.
    .filter((s) => kind !== 'TRANSFER' || s.id !== selectedGun?.currentSiteId)
    .map((s) => ({ value: s.id, label: s.siteName, sublabel: s.clientName ?? undefined }));

  return (
    <div style={{ maxWidth: 620 }}>
      <div className="fw-bold mb-1" style={{ color: NAVY }}>{cfg.title}</div>
      <div className="text-muted small mb-3">{cfg.blurb}</div>

      {error && <Alert variant="danger" className="py-2 small">{error}</Alert>}

      <Form.Group className="mb-3">
        <Form.Label className="fw-bold small">Gun <span className="text-danger">*</span></Form.Label>
        <Form.Select value={gunId} onChange={(e) => { setGunId(e.target.value); setError(''); }}>
          <option value="">— Select a gun —</option>
          {eligible.map((g) => (
            <option key={g.id} value={g.id}>
              {g.serialNumber} · {g.gunType}
              {g.currentSiteName ? ` · at ${g.currentSiteName}` : ''}
              {` · ${g.currentBullets} rounds`}
            </option>
          ))}
        </Form.Select>
        {eligible.length === 0 && (
          <Form.Text className="text-danger">{cfg.emptyGuns}</Form.Text>
        )}
      </Form.Group>

      <Form.Group className="mb-3">
        <Form.Label className="fw-bold small">
          {cfg.siteLabel} {kind !== 'WITHDRAW' && <span className="text-danger">*</span>}
        </Form.Label>
        {kind === 'WITHDRAW' ? (
          // The origin is wherever the gun actually is — picking it would only
          // let the user contradict the record.
          <Form.Control readOnly value={selectedGun?.currentSiteName ?? '— select a gun first —'} />
        ) : (
          <SearchableSelect
            options={siteOptions}
            value={siteId}
            onChange={(id) => { setSiteId(id); setError(''); }}
            placeholder="Select a site…"
          />
        )}
        {kind === 'WITHDRAW' && (
          <Form.Text className="text-muted">Returning to {ARMOURY_LABEL}.</Form.Text>
        )}
      </Form.Group>

      <Row className="g-2 mb-3">
        <Col sm={6}>
          <Form.Label className="fw-bold small">{cfg.bulletLabel}</Form.Label>
          <Form.Control
            type="number" min={0}
            max={kind === 'WITHDRAW' ? selectedGun?.currentBullets : undefined}
            value={bullets}
            onChange={(e) => { setBullets(e.target.value === '' ? '' : Number(e.target.value)); setError(''); }}
          />
          {kind === 'WITHDRAW' && selectedGun && (
            <Form.Text className="text-muted">{selectedGun.currentBullets} were issued with this gun.</Form.Text>
          )}
        </Col>
        <Col sm={6}>
          <Form.Label className="fw-bold small">Date</Form.Label>
          <Form.Control type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
        </Col>
      </Row>

      {cfg.showReason && (
        <Form.Group className="mb-3">
          <Form.Label className="fw-bold small">Reason</Form.Label>
          <Form.Control value={reason} maxLength={500} placeholder="e.g. End of deployment period"
            onChange={(e) => setReason(e.target.value)} />
        </Form.Group>
      )}

      <Form.Group className="mb-3">
        <Form.Label className="fw-bold small">Notes <span className="text-muted fw-normal">(optional)</span></Form.Label>
        <Form.Control as="textarea" rows={2} maxLength={1000} value={notes}
          onChange={(e) => setNotes(e.target.value)} />
      </Form.Group>

      <Button style={{ background: NAVY, borderColor: NAVY }} onClick={submit} disabled={pending || !gunId}>
        {pending
          ? <><Spinner as="span" size="sm" animation="border" className="me-1" /> Recording…</>
          : cfg.button}
      </Button>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function GunManagementPage() {
  const navigate = useNavigate();
  const [showRegister, setShowRegister] = useState(false);
  const [editingGun,  setEditingGun]  = useState<GunResponse | null>(null);
  const [deletingGun, setDeletingGun] = useState<GunResponse | null>(null);
  const canWrite = useHasPermission('guns.register');
  const { showToast } = useToast();
  const removeGun = useDeleteGun();
  const [historyGunId, setHistoryGunId] = useState<string | null>(null);

  const { data: guns = [], isLoading }       = useGuns();
  const { data: inventory = [] }             = useGunInventory();
  const { data: movements = [] }             = useGunMovements({ limit: 25 });

  const inArmoury = guns.filter((g) => g.status === GUN_STATUSES.IN_ARMOURY).length;
  const deployed  = guns.filter((g) => g.status === GUN_STATUSES.DEPLOYED).length;

  return (
    <div className="py-4 px-3">
      <Breadcrumb className="mb-3 small">
        <Breadcrumb.Item onClick={() => navigate('/dashboard')} style={{ cursor: 'pointer' }}>Dashboard</Breadcrumb.Item>
        <Breadcrumb.Item active>Gun Management</Breadcrumb.Item>
      </Breadcrumb>

      <div className="d-flex align-items-center justify-content-between mb-4">
        <div>
          <h4 className="fw-bold mb-0" style={{ color: NAVY }}>🔫 Gun Management</h4>
          <div className="text-muted small">
            {guns.length} registered · {inArmoury} in the armoury · {deployed} deployed
          </div>
        </div>
        <Button style={{ background: NAVY, borderColor: NAVY }} onClick={() => setShowRegister(true)}>
          + Register New Gun
        </Button>
      </div>

      <Card className="border-0 shadow-sm">
        <Card.Body>
          <Tabs defaultActiveKey="inventory" className="mb-3">
            {/* ── Inventory ─────────────────────────────────────────────── */}
            <Tab eventKey="inventory" title="📦 Inventory">
              {isLoading ? (
                <div className="text-center py-4"><Spinner animation="border" size="sm" /></div>
              ) : (
                <>
                  <div style={{ overflowX: 'auto' }}>
                    <Table bordered size="sm" className="mb-4">
                      <thead>
                        <tr style={{ background: NAVY }}>
                          <th style={TH}>Site / Location</th>
                          <th style={{ ...TH, textAlign: 'center' }}>No. of Guns</th>
                          <th style={TH}>Serial Numbers</th>
                          <th style={TH}>Gun Types</th>
                          <th style={{ ...TH, textAlign: 'center' }}>Total Bullets</th>
                        </tr>
                      </thead>
                      <tbody>
                        {inventory.map((row) => (
                          <tr key={row.siteId ?? 'ARMOURY'}>
                            <td className="fw-bold">{row.siteName}</td>
                            <td className="text-center fw-bold" style={{ color: NAVY, fontSize: '1.05rem' }}>
                              {row.gunCount}
                            </td>
                            <td>
                              {row.serialNumbers.length === 0 ? (
                                <span className="text-muted small">—</span>
                              ) : (
                                <div className="d-flex flex-wrap gap-1">
                                  {row.serialNumbers.map((sn) => <code key={sn} style={SERIAL}>{sn}</code>)}
                                </div>
                              )}
                            </td>
                            <td className="small">{row.gunTypes.join(', ') || '—'}</td>
                            <td className="text-center">{row.totalBullets}</td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>

                  <div className="fw-bold mb-2" style={{ color: NAVY }}>All guns ({guns.length})</div>
                  <div style={{ overflowX: 'auto' }}>
                    <Table striped size="sm" className="small">
                      <thead className="table-light">
                        <tr>
                          <th>ID</th><th>Serial</th><th>Type</th><th>Ownership</th>
                          <th>Condition</th><th>Location</th>
                          <th className="text-center">Rounds</th><th>Status</th><th />
                        </tr>
                      </thead>
                      <tbody>
                        {guns.length === 0 ? (
                          <tr><td colSpan={9} className="text-center text-muted py-4">
                            No guns registered yet.
                          </td></tr>
                        ) : guns.map((g) => (
                          <tr key={g.id} style={{ cursor: 'pointer' }} onClick={() => setHistoryGunId(g.id)}>
                            <td className="text-muted" style={{ fontSize: '0.72rem' }}>{g.systemId ?? '—'}</td>
                            <td><code style={SERIAL}>{g.serialNumber}</code></td>
                            <td>{g.gunTypeLabel}</td>
                            <td>{ownershipCell(g)}</td>
                            <td>{conditionBadge(g.condition)}</td>
                            <td>{g.currentSiteName ?? ARMOURY_LABEL}</td>
                            <td className="text-center">
                              <div className="fw-semibold">{g.currentBullets}</div>
                              {g.currentBullets !== g.totalBullets && (
                                <div className="text-muted" style={{ fontSize: '0.68rem' }}>of {g.totalBullets}</div>
                              )}
                            </td>
                            <td>
                              <Badge bg={g.status === GUN_STATUSES.IN_ARMOURY ? 'success' : 'primary'}
                                style={{ fontSize: '0.68rem' }}>
                                {g.status.replace(/_/g, ' ')}
                              </Badge>
                            </td>
                            <td onClick={(e) => e.stopPropagation()}>
                              {canWrite && g.status !== GUN_STATUSES.DEPLOYED && (
                                <div className="d-flex gap-1">
                                  <Button size="sm" variant="outline-secondary"
                                    title="Edit" onClick={() => setEditingGun(g)}>✏️</Button>
                                  <Button size="sm" variant="outline-danger"
                                    title="Remove" onClick={() => setDeletingGun(g)}>🗑️</Button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                </>
              )}
            </Tab>

            <Tab eventKey="deploy"   title="🚀 Deploy"><MovementForm kind="DEPLOY"   guns={guns} /></Tab>
            <Tab eventKey="withdraw" title="↩️ Withdraw"><MovementForm kind="WITHDRAW" guns={guns} /></Tab>
            <Tab eventKey="transfer" title="🔄 Transfer"><MovementForm kind="TRANSFER" guns={guns} /></Tab>

            {/* ── Movement ledger ───────────────────────────────────────── */}
            <Tab eventKey="history" title="📜 Movement Log">
              {movements.length === 0 ? (
                <div style={{ border: '2px dashed #ced4da', borderRadius: '0.5rem', padding: '24px',
                              textAlign: 'center', color: '#6c757d', fontSize: '0.85rem' }}>
                  No gun movements recorded yet.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <Table striped size="sm" className="small">
                    <thead className="table-light">
                      <tr>
                        <th>Date</th><th>Serial</th><th>Movement</th>
                        <th>From</th><th>To</th>
                        <th className="text-center">Rounds</th><th>Recorded by</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movements.map((m) => (
                        <tr key={m.id}>
                          <td style={{ whiteSpace: 'nowrap' }}>{formatDate(m.movementDate)}</td>
                          <td><code style={SERIAL}>{m.serialNumber}</code></td>
                          <td>{GUN_MOVEMENT_LABELS[m.movementType]}</td>
                          <td>{m.fromSite?.siteName ?? ARMOURY_LABEL}</td>
                          <td>{m.toSite?.siteName ?? ARMOURY_LABEL}</td>
                          <td className="text-center">{m.bullets}</td>
                          <td>{m.recordedBy.name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              )}
            </Tab>
          </Tabs>
        </Card.Body>
      </Card>

      {showRegister && <GunFormModal onClose={() => setShowRegister(false)} />}
      {editingGun   && <GunFormModal gun={editingGun} onClose={() => setEditingGun(null)} />}

      {deletingGun && (
        <Modal show onHide={() => setDeletingGun(null)} centered>
          <Modal.Header closeButton>
            <Modal.Title style={{ fontSize: '1.05rem' }}>Remove gun</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <p className="mb-2">
              Remove <strong>{deletingGun.systemId ?? deletingGun.serialNumber}</strong>
              {' '}(serial <code>{deletingGun.serialNumber}</code>) from the armoury?
            </p>
            <Alert variant="light" className="border small mb-0">
              A gun that has been deployed carries movement records — the armoury's account of
              where it has been. That history is kept: the gun is retired rather than deleted,
              so it leaves the inventory but stays answerable for. A gun that has never moved
              is deleted outright.
            </Alert>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-secondary" onClick={() => setDeletingGun(null)}
              disabled={removeGun.isPending}>Cancel</Button>
            <Button variant="danger" disabled={removeGun.isPending}
              onClick={() => removeGun.mutate(deletingGun.id, {
                onSuccess: (r) => {
                  showToast(
                    r.retired
                      ? `${deletingGun.serialNumber} retired — its movement history was kept.`
                      : `${deletingGun.serialNumber} deleted.`,
                    'success',
                  );
                  setDeletingGun(null);
                },
                onError: (err) => {
                  showToast(getApiErrorMessage(err, 'Could not remove the gun.'), 'danger');
                  setDeletingGun(null);
                },
              })}
            >
              {removeGun.isPending ? 'Removing…' : 'Remove'}
            </Button>
          </Modal.Footer>
        </Modal>
      )}
      {historyGunId  && <GunHistoryModal gunId={historyGunId} onClose={() => setHistoryGunId(null)} />}
    </div>
  );
}
