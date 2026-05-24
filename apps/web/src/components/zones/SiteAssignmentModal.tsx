import { useState } from 'react';
import { Button, Form, InputGroup, Modal, Spinner, Table } from 'react-bootstrap';
import { useQuery } from '@tanstack/react-query';
import { clientsApi } from '../../lib/clients.api';
import { useAssignSitesToZone } from '../../hooks/useZones';
import { useToast } from '../../context/ToastContext';

interface Props {
  show:            boolean;
  zoneId:          string;
  zoneName:        string;
  assignedSiteIds: string[];
  onHide:          () => void;
}

export default function SiteAssignmentModal({
  show, zoneId, zoneName, assignedSiteIds, onHide,
}: Props) {
  const { showToast } = useToast();
  const [search,   setSearch]   = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ['sites-all-unzoned', search],
    queryFn:  () => clientsApi.getAllSites({ limit: 200, search: search || undefined }),
    enabled:  show,
  });

  const assignMutation = useAssignSitesToZone();

  const sites = (data?.data ?? []).filter((s) => !assignedSiteIds.includes(s.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleAssign() {
    if (selected.size === 0) return;
    assignMutation.mutate(
      { id: zoneId, siteIds: Array.from(selected) },
      {
        onSuccess: () => {
          showToast(`${selected.size} site(s) assigned to ${zoneName}.`, 'success');
          setSelected(new Set());
          onHide();
        },
        onError: (e: any) => showToast(e?.response?.data?.error ?? 'Failed.', 'danger'),
      },
    );
  }

  return (
    <Modal show={show} onHide={onHide} centered size="lg">
      <Modal.Header closeButton>
        <Modal.Title>Assign Sites to {zoneName}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <InputGroup size="sm" className="mb-3">
          <InputGroup.Text><i className="bi bi-search" /></InputGroup.Text>
          <Form.Control
            placeholder="Search sites..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </InputGroup>

        {isLoading && (
          <div className="text-center py-4">
            <Spinner animation="border" variant="primary" size="sm" />
          </div>
        )}

        {!isLoading && sites.length === 0 && (
          <div className="text-center text-muted py-4">
            {search ? 'No unassigned sites match your search.' : 'All sites are already assigned to zones.'}
          </div>
        )}

        {!isLoading && sites.length > 0 && (
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            <Table hover size="sm" className="small mb-0">
              <thead className="table-light sticky-top">
                <tr>
                  <th style={{ width: 36 }}>
                    <Form.Check
                      checked={selected.size === sites.length && sites.length > 0}
                      onChange={(e) =>
                        setSelected(e.target.checked ? new Set(sites.map((s) => s.id)) : new Set())
                      }
                    />
                  </th>
                  <th>Site Name</th>
                  <th>Client</th>
                  <th>Location</th>
                  <th>Zone</th>
                </tr>
              </thead>
              <tbody>
                {sites.map((site) => (
                  <tr
                    key={site.id}
                    onClick={() => toggle(site.id)}
                    style={{ cursor: 'pointer' }}
                    className={selected.has(site.id) ? 'table-primary' : ''}
                  >
                    <td>
                      <Form.Check
                        checked={selected.has(site.id)}
                        onChange={() => toggle(site.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    <td className="fw-semibold">{site.siteName}</td>
                    <td className="text-muted">{(site as any).clientName ?? '—'}</td>
                    <td className="text-muted">{site.location}</td>
                    <td className="text-muted fst-italic">Unzoned</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}

        {selected.size > 0 && (
          <div className="mt-2 small text-primary">
            {selected.size} site(s) selected
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>Cancel</Button>
        <Button
          variant="primary"
          onClick={handleAssign}
          disabled={selected.size === 0 || assignMutation.isPending}
        >
          {assignMutation.isPending
            ? <Spinner size="sm" animation="border" />
            : `Assign ${selected.size > 0 ? `(${selected.size})` : ''}`}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
