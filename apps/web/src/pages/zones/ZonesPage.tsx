import { useState, useMemo } from 'react';
import {
  Alert, Badge, Button, Card, Col, Form, Modal, Row, Spinner, Table,
} from 'react-bootstrap';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  useZones, useCreateZone, useUpdateZone, useAssignSitesToZone,
} from '../../hooks/useZones';
import { useQuery } from '@tanstack/react-query';
import { usersApi } from '../../lib/users.api';
import { clientsApi } from '../../lib/clients.api';
import SitePicker from '../../components/zones/SitePicker';
import type { ZoneResponse } from '@security360/shared';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ZoneFormState {
  name:         string;
  description:  string;
  supervisorId: string;
  alternateId:  string;
  isActive:     boolean;
}

const BLANK_FORM: ZoneFormState = {
  name: '', description: '', supervisorId: '', alternateId: '', isActive: true,
};

const ADMIN_ROLES = ['DIRECTOR', 'ASSISTANT_MANAGER'];

// ── ZonesPage ──────────────────────────────────────────────────────────────────

export default function ZonesPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const isAdmin = ADMIN_ROLES.includes(user?.role ?? '');

  // ── Data ───────────────────────────────────────────────────────────────────
  const { data: zonesData, isLoading: zonesLoading } = useZones();

  const { data: usersData } = useQuery({
    queryKey: ['staff-users'],
    queryFn:  () => usersApi.list({ roles: 'DIRECTOR,ASSISTANT_MANAGER,OPERATIONS_SUPERVISOR,FIELD_SUPERVISOR', status: 'ACTIVE' }),
    staleTime: 5 * 60 * 1000,
  });

  const { data: allSitesData } = useQuery({
    queryKey: ['sites-all'],
    queryFn:  () => clientsApi.getAllSites({ limit: 500 }),
  });

  const createZone = useCreateZone();
  const updateZone = useUpdateZone();
  const assignSites = useAssignSitesToZone();

  // ── Modal state ────────────────────────────────────────────────────────────
  const [showCreate, setShowCreate]     = useState(false);
  const [editTarget, setEditTarget]     = useState<ZoneResponse | null>(null);
  const [sitesTarget, setSitesTarget]   = useState<ZoneResponse | null>(null);
  const [form, setForm]                 = useState<ZoneFormState>(BLANK_FORM);
  const [siteSearch, setSiteSearch]     = useState('');
  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>([]);

  // Site assignment state — tracks which sites are toggled for the open zone
  const [checkedSiteIds, setCheckedSiteIds] = useState<Set<string>>(new Set());

  const staffUsers = usersData?.data ?? [];
  const allSites   = allSitesData?.data ?? [];
  const zones      = zonesData?.data    ?? [];

  // ── Handlers: zone form ────────────────────────────────────────────────────
  function openCreate() {
    setForm(BLANK_FORM);
    setSelectedSiteIds([]);
    setShowCreate(true);
  }

  function openEdit(zone: ZoneResponse) {
    setForm({
      name:         zone.name,
      description:  zone.description ?? '',
      supervisorId: zone.supervisorId ?? '',
      alternateId:  zone.alternateId  ?? '',
      isActive:     zone.isActive,
    });
    // The list endpoint returns only a site count, not the sites themselves —
    // read current membership off the site records instead.
    setSelectedSiteIds(allSites.filter((s) => s.zone?.id === zone.id).map((s) => s.id));
    setEditTarget(zone);
  }

  function openSites(zone: ZoneResponse) {
    // A site's zone arrives as the `zone` object on the site record — there is
    // no zoneId field on SiteResponse, and comparing one left every attached
    // site unticked.
    const currentSiteIds = new Set(
      allSites.filter((s) => s.zone?.id === zone.id).map((s) => s.id),
    );
    setCheckedSiteIds(currentSiteIds);
    setSiteSearch('');
    setSitesTarget(zone);
  }

  async function handleSaveZone() {
    const basePayload = {
      name:         form.name.trim(),
      description:  form.description.trim() || undefined,
      supervisorId: form.supervisorId || undefined,
      alternateId:  form.alternateId  || undefined,
    };

    try {
      if (editTarget) {
        await updateZone.mutateAsync({ id: editTarget.id, data: { ...basePayload, isActive: form.isActive } });
        // Sync site assignments: compute add/remove diff against the zone's
        // actual current members (the list row carries no site objects).
        const currentSiteIds = new Set(
          allSites.filter((s) => s.zone?.id === editTarget.id).map((s) => s.id),
        );
        const addSiteIds    = selectedSiteIds.filter(id => !currentSiteIds.has(id));
        const removeSiteIds = [...currentSiteIds].filter(id => !selectedSiteIds.includes(id));
        if (addSiteIds.length > 0 || removeSiteIds.length > 0) {
          await assignSites.mutateAsync({ zoneId: editTarget.id, addSiteIds, removeSiteIds });
        }
        showToast('Zone updated', 'success');
        setEditTarget(null);
        setSelectedSiteIds([]);
      } else {
        await createZone.mutateAsync({ ...basePayload, siteIds: selectedSiteIds });
        showToast('Zone created', 'success');
        setShowCreate(false);
        setSelectedSiteIds([]);
      }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to save zone', 'danger');
    }
  }

  async function handleSaveSites() {
    if (!sitesTarget) return;

    const currentIds = new Set(
      allSites.filter((s) => s.zone?.id === sitesTarget.id).map((s) => s.id),
    );

    const addSiteIds    = [...checkedSiteIds].filter((id) => !currentIds.has(id));
    const removeSiteIds = [...currentIds].filter((id) => !checkedSiteIds.has(id));

    if (addSiteIds.length === 0 && removeSiteIds.length === 0) {
      setSitesTarget(null);
      return;
    }

    try {
      await assignSites.mutateAsync({ zoneId: sitesTarget.id, addSiteIds, removeSiteIds });
      showToast('Sites updated', 'success');
      setSitesTarget(null);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to update sites', 'danger');
    }
  }

  // ── Filtered sites for assignment modal ────────────────────────────────────
  // The Manage Sites modal offers only what it can act on: sites already in
  // this zone (pre-ticked) and sites no zone claims. Sites belonging to another
  // zone stay out of the list — moving those is done from that zone. Soft-
  // deleted sites are already absent: /clients/sites/all skips them.
  // Zone members are listed first, then the unassigned sites, each group in
  // alphabetical order. The grouping keys off actual membership rather than
  // the live tick state, so toggling a row never makes it jump elsewhere.
  const filteredSites = useMemo(
    () => {
      const scoped = sitesTarget
        ? allSites.filter((s) => !s.zone || s.zone.id === sitesTarget.id)
        : allSites;
      const list = scoped.filter((s) =>
        !siteSearch ||
        s.siteName.toLowerCase().includes(siteSearch.toLowerCase()) ||
        s.clientName.toLowerCase().includes(siteSearch.toLowerCase()),
      );
      if (sitesTarget) {
        list.sort(
          (a, b) =>
            Number(b.zone?.id === sitesTarget.id) - Number(a.zone?.id === sitesTarget.id),
        );
      }
      return list;
    },
    [allSites, sitesTarget, siteSearch],
  );

  const isSaving = createZone.isPending || updateZone.isPending;

  return (
    <div className="p-4">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="d-flex align-items-center justify-content-between mb-4">
        <div>
          <h4 className="fw-bold mb-0" style={{ color: '#1B3A6B' }}>Zones</h4>
          <p className="text-muted small mb-0">
            Manage operational zones and assign supervisors and sites.
          </p>
        </div>
        {isAdmin && (
          <Button
            size="sm"
            style={{ backgroundColor: '#1B3A6B', borderColor: '#1B3A6B' }}
            onClick={openCreate}
          >
            <i className="bi bi-plus-circle me-1" /> New Zone
          </Button>
        )}
      </div>

      {/* ── Zone list ───────────────────────────────────────────────────── */}
      <Card className="border-0 shadow-sm">
        <Card.Body className="p-0">
          {zonesLoading ? (
            <div className="text-center py-5">
              <Spinner animation="border" size="sm" className="me-2" />
              Loading zones...
            </div>
          ) : zones.length === 0 ? (
            <div className="text-center py-5 text-muted">
              <i className="bi bi-map" style={{ fontSize: '2.5rem', opacity: 0.3 }} />
              <p className="mt-3 mb-1 fw-semibold">No zones yet</p>
              {isAdmin && (
                <p className="small">
                  Create your first zone to group sites and assign supervisors.
                </p>
              )}
            </div>
          ) : (
            <Table responsive hover className="mb-0">
              <thead style={{ background: '#f8f9fa' }}>
                <tr>
                  <th className="fw-semibold small py-3 ps-4">Zone</th>
                  <th className="fw-semibold small py-3">Supervisor</th>
                  <th className="fw-semibold small py-3">Alternate</th>
                  <th className="fw-semibold small py-3 text-center">Sites</th>
                  <th className="fw-semibold small py-3 text-center">Status</th>
                  {isAdmin && <th className="fw-semibold small py-3 text-end pe-4">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {zones.map((zone) => (
                  <tr key={zone.id}>
                    <td className="ps-4 py-3 align-middle">
                      <div className="fw-semibold">{zone.name}</div>
                      {zone.description && (
                        <div className="text-muted small" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {zone.description}
                        </div>
                      )}
                    </td>
                    <td className="py-3 align-middle">
                      {zone.supervisor ? (
                        <div>
                          <div className="small fw-medium">{zone.supervisor.name}</div>
                          <div className="text-muted" style={{ fontSize: '0.72rem' }}>
                            {zone.supervisor.role.replace(/_/g, ' ')}
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted small">—</span>
                      )}
                    </td>
                    <td className="py-3 align-middle">
                      {zone.alternate ? (
                        <div>
                          <div className="small fw-medium">{zone.alternate.name}</div>
                          <div className="text-muted" style={{ fontSize: '0.72rem' }}>
                            {zone.alternate.role.replace(/_/g, ' ')}
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted small">—</span>
                      )}
                    </td>
                    <td className="py-3 align-middle text-center">
                      <Badge
                        bg={zone.siteCount > 0 ? 'primary' : 'secondary'}
                        style={{ fontSize: '0.75rem', cursor: isAdmin ? 'pointer' : 'default' }}
                        onClick={() => isAdmin && openSites(zone)}
                        title={isAdmin ? 'Click to manage sites' : undefined}
                      >
                        {zone.siteCount} site{zone.siteCount !== 1 ? 's' : ''}
                      </Badge>
                    </td>
                    <td className="py-3 align-middle text-center">
                      <Badge bg={zone.isActive ? 'success' : 'secondary'}>
                        {zone.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    {isAdmin && (
                      <td className="py-3 align-middle text-end pe-4">
                        <Button
                          variant="outline-secondary"
                          size="sm"
                          className="me-1"
                          onClick={() => openSites(zone)}
                        >
                          <i className="bi bi-building me-1" />Sites
                        </Button>
                        <Button
                          variant="outline-primary"
                          size="sm"
                          onClick={() => openEdit(zone)}
                        >
                          <i className="bi bi-pencil me-1" />Edit
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card.Body>
      </Card>

      {/* ── Create / Edit modal ──────────────────────────────────────────── */}
      <Modal
        show={showCreate || !!editTarget}
        onHide={() => { setShowCreate(false); setEditTarget(null); setSelectedSiteIds([]); }}
        centered
        size="xl"
      >
        <Modal.Header closeButton>
          <Modal.Title className="h6 fw-bold">
            {editTarget ? `Edit Zone — ${editTarget.name}` : 'New Zone'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label className="small fw-semibold">
                Name <span className="text-danger">*</span>
              </Form.Label>
              <Form.Control
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. North Kampala Zone"
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label className="small fw-semibold">Description</Form.Label>
              <Form.Control
                as="textarea"
                rows={2}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Optional notes about this zone"
              />
            </Form.Group>

            <Row className="g-3">
              <Col md={6}>
                <Form.Group>
                  <Form.Label className="small fw-semibold">Supervisor</Form.Label>
                  <Form.Select
                    value={form.supervisorId}
                    onChange={(e) => setForm((f) => ({ ...f, supervisorId: e.target.value }))}
                  >
                    <option value="">— None —</option>
                    {staffUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.role.replace(/_/g, ' ')})
                      </option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group>
                  <Form.Label className="small fw-semibold">Alternate Supervisor</Form.Label>
                  <Form.Select
                    value={form.alternateId}
                    onChange={(e) => setForm((f) => ({ ...f, alternateId: e.target.value }))}
                  >
                    <option value="">— None —</option>
                    {staffUsers
                      .filter((u) => u.id !== form.supervisorId)
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.role.replace(/_/g, ' ')})
                        </option>
                      ))}
                  </Form.Select>
                </Form.Group>
              </Col>
            </Row>

            {editTarget && (
              <Form.Group className="mt-3">
                <Form.Check
                  type="switch"
                  id="zone-active-toggle"
                  label="Zone is active"
                  checked={form.isActive}
                  onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                />
              </Form.Group>
            )}
          </Form>

          {/* Site assignment section */}
          <div style={{ borderTop: '1px solid #e9ecef', marginTop: 24, paddingTop: 20 }}>
            <div style={{
              fontSize: '0.72rem', fontWeight: 600, color: '#6c757d',
              textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 14,
            }}>
              Assign Sites
            </div>
            <SitePicker
              selectedSiteIds={selectedSiteIds}
              onSelectionChange={setSelectedSiteIds}
              maxHeight="220px"
              zoneId={editTarget?.id}
            />
          </div>
        </Modal.Body>
        <Modal.Footer>
          <div className="d-flex align-items-center justify-content-between w-100">
            <div style={{ fontSize: '0.82rem', color: '#6c757d' }}>
              {selectedSiteIds.length > 0
                ? `${selectedSiteIds.length} site(s) will be assigned to this zone`
                : 'No sites selected — can assign later'}
            </div>
            <div className="d-flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => { setShowCreate(false); setEditTarget(null); setSelectedSiteIds([]); }}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                style={{ backgroundColor: '#1B3A6B', borderColor: '#1B3A6B' }}
                disabled={!form.name.trim() || isSaving}
                onClick={handleSaveZone}
              >
                {isSaving ? (
                  <><Spinner size="sm" animation="border" className="me-1" />Saving…</>
                ) : editTarget ? (
                  'Save Changes'
                ) : selectedSiteIds.length > 0 ? (
                  `Create Zone with ${selectedSiteIds.length} Site(s)`
                ) : (
                  'Create Zone'
                )}
              </Button>
            </div>
          </div>
        </Modal.Footer>
      </Modal>

      {/* ── Assign sites modal ───────────────────────────────────────────── */}
      <Modal
        show={!!sitesTarget}
        onHide={() => setSitesTarget(null)}
        centered
        size="lg"
      >
        <Modal.Header closeButton>
          <Modal.Title className="h6 fw-bold">
            Manage Sites — {sitesTarget?.name}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="text-muted small mb-3">
            Sites in this zone are ticked, followed by sites not yet assigned to any zone.
            Unchecking a site removes it from the zone (it remains unassigned, not deleted).
          </p>

          <Form.Control
            type="text"
            size="sm"
            placeholder="Search sites..."
            value={siteSearch}
            onChange={(e) => setSiteSearch(e.target.value)}
            className="mb-3"
          />

          {filteredSites.length === 0 ? (
            <Alert variant="info" className="mb-0">
              {allSites.length === 0
                ? 'No sites found.'
                : 'Nothing to show — this zone has no sites yet and every other site is already assigned to a zone.'}
            </Alert>
          ) : (
            <div style={{ maxHeight: 360, overflowY: 'auto', border: '1px solid #dee2e6', borderRadius: '0.375rem' }}>
              {filteredSites.map((site, i) => {
                const isChecked = checkedSiteIds.has(site.id);
                const attached  = site.zone?.id === sitesTarget?.id;

                return (
                  <div
                    key={site.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '8px 12px',
                      borderBottom: i < filteredSites.length - 1 ? '1px solid #f0f0f0' : 'none',
                      background: isChecked ? '#f0faf8' : '#fff',
                    }}
                  >
                    <Form.Check
                      type="checkbox"
                      id={`site-${site.id}`}
                      checked={isChecked}
                      onChange={(e) => {
                        const next = new Set(checkedSiteIds);
                        if (e.target.checked) next.add(site.id);
                        else next.delete(site.id);
                        setCheckedSiteIds(next);
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="small fw-medium">{site.siteName}</div>
                      <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                        {site.clientName} · {site.location}
                      </div>
                    </div>
                    {attached && (
                      <Badge bg="success" style={{ fontSize: '0.65rem' }}>In zone</Badge>
                    )}
                    {!attached && isChecked && (
                      <Badge bg="primary" style={{ fontSize: '0.65rem' }}>Will add</Badge>
                    )}
                    {attached && !isChecked && (
                      <Badge bg="danger" style={{ fontSize: '0.65rem' }}>Will remove</Badge>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-2 text-muted small">
            {checkedSiteIds.size} site{checkedSiteIds.size !== 1 ? 's' : ''} selected for this zone
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" size="sm" onClick={() => setSitesTarget(null)}>
            Cancel
          </Button>
          <Button
            size="sm"
            style={{ backgroundColor: '#1B3A6B', borderColor: '#1B3A6B' }}
            disabled={assignSites.isPending}
            onClick={handleSaveSites}
          >
            {assignSites.isPending
              ? <><Spinner size="sm" animation="border" className="me-1" />Saving...</>
              : 'Save Site Assignments'}
          </Button>
        </Modal.Footer>
      </Modal>

    </div>
  );
}
