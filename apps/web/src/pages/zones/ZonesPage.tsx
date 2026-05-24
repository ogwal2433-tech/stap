import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Badge, Breadcrumb, Button, Card, Col, Form, InputGroup, Row, Spinner,
} from 'react-bootstrap';
import {
  useZones, useCreateZone, useDeactivateZone, useActivateZone, useDeleteZone,
} from '../../hooks/useZones';
import RoleGuard from '../../components/RoleGuard';
import { useToast } from '../../context/ToastContext';
import ZoneFormModal from '../../components/zones/ZoneFormModal';
import { ROLES, type UserRole } from '@stap/shared';

const MGMT_ROLES: UserRole[] = [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ADMINISTRATOR];

export default function ZonesPage() {
  const navigate    = useNavigate();
  const { showToast } = useToast();

  const [search,     setSearch]     = useState('');
  const [activeOnly, setActiveOnly] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const { data: zones = [], isLoading, isError } = useZones(false);
  const createZone    = useCreateZone();
  const deactivate    = useDeactivateZone();
  const activate      = useActivateZone();
  const deleteZone    = useDeleteZone();

  const filtered = zones.filter((z) => {
    if (activeOnly && !z.isActive) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        z.name.toLowerCase().includes(q) ||
        (z.description ?? '').toLowerCase().includes(q) ||
        (z.supervisor?.name ?? '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const totalSites  = zones.reduce((s, z) => s + z.siteCount, 0);
  const activeCount = zones.filter((z) => z.isActive).length;

  function handleToggleActive(id: string, isActive: boolean) {
    const action = isActive ? deactivate : activate;
    action.mutate(id, {
      onSuccess: () => showToast(`Zone ${isActive ? 'deactivated' : 'activated'}.`, 'success'),
      onError:   (e: any) => showToast(e?.response?.data?.error ?? 'Failed.', 'danger'),
    });
  }

  function handleDelete(id: string, name: string) {
    if (!confirm(`Delete zone "${name}"? This cannot be undone.`)) return;
    deleteZone.mutate(id, {
      onSuccess: () => showToast('Zone deleted.', 'success'),
      onError:   (e: any) => showToast(e?.response?.data?.error ?? 'Cannot delete zone.', 'danger'),
    });
  }

  return (
    <div className="container-fluid py-4">
      <Breadcrumb>
        <Breadcrumb.Item href="/dashboard">Dashboard</Breadcrumb.Item>
        <Breadcrumb.Item active>Zones</Breadcrumb.Item>
      </Breadcrumb>

      <div className="d-flex align-items-center justify-content-between mb-4">
        <div>
          <h4 className="mb-0 fw-bold">Zone Management</h4>
          <p className="text-muted small mb-0">Organise sites into operational zones with assigned supervisors</p>
        </div>
        <RoleGuard allowedRoles={MGMT_ROLES}>
          <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
            <i className="bi bi-plus-lg me-1" /> New Zone
          </Button>
        </RoleGuard>
      </div>

      {/* Summary cards */}
      <Row className="g-3 mb-4">
        <Col xs={6} md={3}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Body>
              <div className="text-muted small mb-1">Total Zones</div>
              <div className="fs-4 fw-bold">{zones.length}</div>
            </Card.Body>
          </Card>
        </Col>
        <Col xs={6} md={3}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Body>
              <div className="text-muted small mb-1">Active Zones</div>
              <div className="fs-4 fw-bold text-success">{activeCount}</div>
            </Card.Body>
          </Card>
        </Col>
        <Col xs={6} md={3}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Body>
              <div className="text-muted small mb-1">Sites Assigned</div>
              <div className="fs-4 fw-bold text-primary">{totalSites}</div>
            </Card.Body>
          </Card>
        </Col>
        <Col xs={6} md={3}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Body>
              <div className="text-muted small mb-1">Unzoned Zones</div>
              <div className="fs-4 fw-bold text-secondary">{zones.length - activeCount}</div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Filters */}
      <Card className="border-0 shadow-sm mb-4">
        <Card.Body>
          <Row className="g-2 align-items-center">
            <Col xs={12} md={6}>
              <InputGroup size="sm">
                <InputGroup.Text><i className="bi bi-search" /></InputGroup.Text>
                <Form.Control
                  placeholder="Search zones..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </InputGroup>
            </Col>
            <Col xs="auto">
              <Form.Check
                type="switch"
                id="active-only"
                label="Active only"
                checked={activeOnly}
                onChange={(e) => setActiveOnly(e.target.checked)}
              />
            </Col>
          </Row>
        </Card.Body>
      </Card>

      {/* Zone cards */}
      {isLoading && (
        <div className="text-center py-5">
          <Spinner animation="border" variant="primary" />
        </div>
      )}

      {isError && (
        <Alert variant="danger">Failed to load zones.</Alert>
      )}

      {!isLoading && !isError && filtered.length === 0 && (
        <div className="text-center py-5 text-muted">
          <i className="bi bi-map fs-1 d-block mb-2" />
          {search ? 'No zones match your search.' : 'No zones yet. Create one to get started.'}
        </div>
      )}

      <Row className="g-3">
        {filtered.map((zone) => (
          <Col key={zone.id} xs={12} md={6} xl={4}>
            <Card
              className="border-0 shadow-sm h-100"
              style={{ opacity: zone.isActive ? 1 : 0.65, cursor: 'pointer' }}
              onClick={() => navigate(`/zones/${zone.id}`)}
            >
              <Card.Body>
                <div className="d-flex align-items-start justify-content-between mb-2">
                  <div>
                    <h6 className="mb-0 fw-bold">{zone.name}</h6>
                    {zone.description && (
                      <p className="text-muted small mb-0 mt-1"
                        style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {zone.description}
                      </p>
                    )}
                  </div>
                  <Badge bg={zone.isActive ? 'success' : 'secondary'} className="ms-2 flex-shrink-0">
                    {zone.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>

                <div className="d-flex gap-3 mt-3 mb-3">
                  <div className="text-center">
                    <div className="fw-bold fs-5">{zone.siteCount}</div>
                    <div className="text-muted" style={{ fontSize: '0.7rem' }}>Sites</div>
                  </div>
                </div>

                <div className="small text-muted">
                  <div className="mb-1">
                    <i className="bi bi-person-badge me-1" />
                    <strong>Supervisor:</strong>{' '}
                    {zone.supervisor ? zone.supervisor.name : <span className="text-warning">Unassigned</span>}
                  </div>
                  <div>
                    <i className="bi bi-person me-1" />
                    <strong>Alternate:</strong>{' '}
                    {zone.alternate ? zone.alternate.name : <span className="text-muted fst-italic">None</span>}
                  </div>
                </div>
              </Card.Body>

              <Card.Footer className="bg-transparent border-top-0 pt-0 pb-2 px-3">
                <div
                  className="d-flex gap-2 justify-content-end"
                  onClick={(e) => e.stopPropagation()}
                >
                  <RoleGuard allowedRoles={MGMT_ROLES}>
                    <Button
                      variant={zone.isActive ? 'outline-warning' : 'outline-success'}
                      size="sm"
                      style={{ fontSize: '0.75rem' }}
                      onClick={() => handleToggleActive(zone.id, zone.isActive)}
                    >
                      {zone.isActive ? 'Deactivate' : 'Activate'}
                    </Button>
                    <Button
                      variant="outline-danger"
                      size="sm"
                      style={{ fontSize: '0.75rem' }}
                      onClick={() => handleDelete(zone.id, zone.name)}
                    >
                      Delete
                    </Button>
                  </RoleGuard>
                </div>
              </Card.Footer>
            </Card>
          </Col>
        ))}
      </Row>

      <ZoneFormModal
        show={showCreate}
        onHide={() => setShowCreate(false)}
        onSave={(data) =>
          createZone.mutateAsync(data).then(() => {
            setShowCreate(false);
            showToast('Zone created.', 'success');
          })
        }
        isSaving={createZone.isPending}
      />
    </div>
  );
}
