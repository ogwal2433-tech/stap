import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Badge, Breadcrumb, Button, Card, Col, Row, Spinner, Table,
} from 'react-bootstrap';
import { useZone, useUpdateZone, useRemoveSitesFromZone, useDeactivateZone, useActivateZone } from '../../hooks/useZones';
import PermissionGuard from '../../components/PermissionGuard';
import { useToast } from '../../context/ToastContext';
import ZoneFormModal from '../../components/zones/ZoneFormModal';
import SiteAssignmentModal from '../../components/zones/SiteAssignmentModal';


const SITE_TYPE_BADGE: Record<string, string> = {
  TEMPORARY:     'warning',
  SPECIAL_DUTIES:'info',
  PERMANENT:     'primary',
};

export default function ZoneDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [showEdit,   setShowEdit]   = useState(false);
  const [showAssign, setShowAssign] = useState(false);

  const { data: zone, isLoading, isError } = useZone(id ?? '');
  const updateZone    = useUpdateZone();
  const removeSites   = useRemoveSitesFromZone();
  const deactivate    = useDeactivateZone();
  const activate      = useActivateZone();

  if (isLoading) {
    return (
      <div className="container-fluid py-4 text-center">
        <Spinner animation="border" variant="primary" />
      </div>
    );
  }

  if (isError || !zone) {
    return (
      <div className="container-fluid py-4">
        <Alert variant="danger">Zone not found or failed to load.</Alert>
        <Button variant="link" onClick={() => navigate('/zones')}>Back to Zones</Button>
      </div>
    );
  }

  function handleToggleActive() {
    const action = zone!.isActive ? deactivate : activate;
    action.mutate(id!, {
      onSuccess: () => showToast(`Zone ${zone!.isActive ? 'deactivated' : 'activated'}.`, 'success'),
      onError:   (e: any) => showToast(e?.response?.data?.error ?? 'Failed.', 'danger'),
    });
  }

  function handleRemoveSite(siteId: string, siteName: string) {
    if (!confirm(`Remove "${siteName}" from this zone?`)) return;
    removeSites.mutate(
      { id: id!, siteIds: [siteId] },
      {
        onSuccess: () => showToast('Site removed from zone.', 'success'),
        onError:   (e: any) => showToast(e?.response?.data?.error ?? 'Failed.', 'danger'),
      },
    );
  }

  return (
    <div className="container-fluid py-4">
      <Breadcrumb>
        <Breadcrumb.Item href="/dashboard">Dashboard</Breadcrumb.Item>
        <Breadcrumb.Item href="/zones">Zones</Breadcrumb.Item>
        <Breadcrumb.Item active>{zone.name}</Breadcrumb.Item>
      </Breadcrumb>

      {/* Header */}
      <div className="d-flex align-items-start justify-content-between mb-4 flex-wrap gap-2">
        <div>
          <div className="d-flex align-items-center gap-2 mb-1">
            <h4 className="mb-0 fw-bold">{zone.name}</h4>
            <Badge bg={zone.isActive ? 'success' : 'secondary'}>
              {zone.isActive ? 'Active' : 'Inactive'}
            </Badge>
          </div>
          {zone.description && (
            <p className="text-muted mb-0">{zone.description}</p>
          )}
        </div>
        <PermissionGuard permission="sites.edit">
          <div className="d-flex gap-2 flex-wrap">
            <Button variant="outline-primary" size="sm" onClick={() => setShowEdit(true)}>
              <i className="bi bi-pencil me-1" /> Edit
            </Button>
            <Button
              variant={zone.isActive ? 'outline-warning' : 'outline-success'}
              size="sm"
              onClick={handleToggleActive}
            >
              {zone.isActive ? 'Deactivate' : 'Activate'}
            </Button>
          </div>
        </PermissionGuard>
      </div>

      <Row className="g-4">
        {/* Left panel: Personnel */}
        <Col xs={12} lg={4}>
          <Card className="border-0 shadow-sm mb-3">
            <Card.Header className="bg-white border-bottom fw-semibold">
              <i className="bi bi-people me-2 text-primary" />
              Personnel
            </Card.Header>
            <Card.Body>
              {/* Supervisor */}
              <div className="mb-3">
                <div className="text-muted small mb-1">Zone Supervisor</div>
                {zone.supervisor ? (
                  <div className="d-flex align-items-center gap-2">
                    <div
                      className="rounded-circle d-flex align-items-center justify-content-center text-white fw-bold flex-shrink-0"
                      style={{ width: 36, height: 36, background: '#1B3A6B', fontSize: '0.8rem' }}
                    >
                      {zone.supervisor.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="fw-semibold small">{zone.supervisor.name}</div>
                      <div className="text-muted" style={{ fontSize: '0.72rem' }}>
                        {zone.supervisor.role.replace(/_/g, ' ')}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-warning small">
                    <i className="bi bi-exclamation-triangle me-1" />
                    No supervisor assigned
                  </div>
                )}
              </div>

              <hr className="my-2" />

              {/* Alternate */}
              <div>
                <div className="text-muted small mb-1">Alternate Supervisor</div>
                {zone.alternate ? (
                  <div className="d-flex align-items-center gap-2">
                    <div
                      className="rounded-circle d-flex align-items-center justify-content-center text-white fw-bold flex-shrink-0"
                      style={{ width: 36, height: 36, background: '#17a2b8', fontSize: '0.8rem' }}
                    >
                      {zone.alternate.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="fw-semibold small">{zone.alternate.name}</div>
                      <div className="text-muted" style={{ fontSize: '0.72rem' }}>
                        {zone.alternate.role.replace(/_/g, ' ')}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-muted small fst-italic">None assigned</div>
                )}
              </div>
            </Card.Body>
          </Card>

          {/* Stats */}
          <Card className="border-0 shadow-sm">
            <Card.Body>
              <div className="d-flex justify-content-around text-center">
                <div>
                  <div className="fs-3 fw-bold text-primary">{zone.siteCount}</div>
                  <div className="text-muted small">Sites</div>
                </div>
                <div>
                  <div className="fs-3 fw-bold text-success">
                    {zone.sites.reduce((s, site) => s + site.guardsRequired, 0)}
                  </div>
                  <div className="text-muted small">Guards Required</div>
                </div>
              </div>
            </Card.Body>
          </Card>
        </Col>

        {/* Right panel: Sites */}
        <Col xs={12} lg={8}>
          <Card className="border-0 shadow-sm">
            <Card.Header className="bg-white border-bottom d-flex align-items-center justify-content-between">
              <span className="fw-semibold">
                <i className="bi bi-building me-2 text-primary" />
                Sites ({zone.siteCount})
              </span>
              <PermissionGuard permission="sites.edit">
                <Button variant="outline-primary" size="sm" onClick={() => setShowAssign(true)}>
                  <i className="bi bi-plus me-1" /> Assign Sites
                </Button>
              </PermissionGuard>
            </Card.Header>
            <Card.Body className="p-0">
              {zone.sites.length === 0 ? (
                <div className="text-center py-5 text-muted">
                  <i className="bi bi-building fs-2 d-block mb-2" />
                  No sites assigned to this zone yet.
                </div>
              ) : (
                <Table hover responsive className="mb-0 small">
                  <thead className="table-light">
                    <tr>
                      <th>Site Name</th>
                      <th>Client</th>
                      <th>Location</th>
                      <th>Type</th>
                      <th>Guards</th>
                      <PermissionGuard permission="sites.edit">
                        <th />
                      </PermissionGuard>
                    </tr>
                  </thead>
                  <tbody>
                    {zone.sites.map((site) => (
                      <tr key={site.id}>
                        <td className="fw-semibold">{site.siteName}</td>
                        <td className="text-muted">{site.clientName}</td>
                        <td className="text-muted">{site.location}</td>
                        <td>
                          <Badge bg={SITE_TYPE_BADGE[site.siteType] ?? 'secondary'} style={{ fontSize: '0.7rem' }}>
                            {site.siteType.replace(/_/g, ' ')}
                          </Badge>
                        </td>
                        <td>{site.guardsRequired}</td>
                        <PermissionGuard permission="sites.edit">
                          <td>
                            <Button
                              variant="link"
                              size="sm"
                              className="text-danger p-0"
                              onClick={() => handleRemoveSite(site.id, site.siteName)}
                            >
                              <i className="bi bi-x-lg" />
                            </Button>
                          </td>
                        </PermissionGuard>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <ZoneFormModal
        show={showEdit}
        zone={zone}
        onHide={() => setShowEdit(false)}
        onSave={(data) =>
          updateZone.mutateAsync({ id: id!, data }).then(() => {
            setShowEdit(false);
            showToast('Zone updated.', 'success');
          })
        }
        isSaving={updateZone.isPending}
      />

      <SiteAssignmentModal
        show={showAssign}
        zoneId={id!}
        zoneName={zone.name}
        assignedSiteIds={zone.sites.map((s) => s.id)}
        onHide={() => setShowAssign(false)}
      />
    </div>
  );
}
