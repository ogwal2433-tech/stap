import { useState } from 'react';
import { Badge, Col, Form, Row, Spinner } from 'react-bootstrap';
import { useAllSites } from '../../hooks/useClients';
import type { SiteResponse } from '@stap/shared';

interface SitePickerProps {
  selectedSiteIds:   string[];
  onSelectionChange: (siteIds: string[]) => void;
  maxHeight?:        string;
  /**
   * When set (edit mode), sites belonging to a *different* zone are hidden
   * from the available pane — selecting one here would silently steal it from
   * that zone. The zone's own sites arrive pre-selected, so what remains
   * offered is exactly the unassigned pool. Leave undefined (create mode) to
   * offer everything, with the "Zoned" badge warning where it came from.
   */
  zoneId?:           string;
}

export default function SitePicker({
  selectedSiteIds,
  onSelectionChange,
  maxHeight = '260px',
  zoneId,
}: SitePickerProps) {
  const [search, setSearch] = useState('');
  const { data: allSites = [], isLoading } = useAllSites();

  const selectedSites = allSites.filter((s: SiteResponse) => selectedSiteIds.includes(s.id));

  const availableSites = allSites
    .filter((s: SiteResponse) => !selectedSiteIds.includes(s.id))
    .filter((s: SiteResponse) => !zoneId || !s.zone || s.zone.id === zoneId)
    .filter((s: SiteResponse) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        s.siteName.toLowerCase().includes(q) ||
        (s.clientName ?? '').toLowerCase().includes(q) ||
        (s.location  ?? '').toLowerCase().includes(q)
      );
    });

  const addSite    = (id: string) => onSelectionChange([...selectedSiteIds, id]);
  const removeSite = (id: string) => onSelectionChange(selectedSiteIds.filter(x => x !== id));
  const clearAll   = ()           => onSelectionChange([]);

  return (
    <div>
      {/* Header */}
      <div className="d-flex align-items-center justify-content-between mb-2">
        <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#1B3A6B' }}>
          Site Assignment
        </div>
        {selectedSiteIds.length > 0 && (
          <div className="d-flex align-items-center gap-2">
            <Badge bg="primary">{selectedSiteIds.length} site(s) selected</Badge>
            <button
              type="button"
              onClick={clearAll}
              style={{ background: 'none', border: 'none', color: '#dc3545', cursor: 'pointer', fontSize: '0.75rem', padding: 0 }}
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      <Row className="g-2">
        {/* Left: available sites */}
        <Col md={6}>
          <div style={{ border: '1px solid #ced4da', borderRadius: '0.375rem', overflow: 'hidden' }}>
            <div style={{ padding: '6px 8px', borderBottom: '1px solid #e9ecef', background: '#f8f9fa' }}>
              <Form.Control
                type="text"
                size="sm"
                placeholder="Search by site, client, or location…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div style={{ maxHeight, overflowY: 'auto' }}>
              {isLoading ? (
                <div className="p-3 text-center text-muted small">
                  <Spinner size="sm" className="me-2" />Loading sites…
                </div>
              ) : availableSites.length === 0 ? (
                <div className="p-3 text-center text-muted small">
                  {search ? 'No sites match your search' : 'All sites have been selected'}
                </div>
              ) : (
                availableSites.map((site: SiteResponse) => (
                  <div
                    key={site.id}
                    onClick={() => addSite(site.id)}
                    style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f8f9fa')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div className="d-flex align-items-center justify-content-between gap-2">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontWeight: 500, fontSize: '0.85rem', color: '#1A1A1A',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {site.siteName}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#6c757d' }}>
                          {site.clientName}
                        </div>
                      </div>
                      <div className="d-flex gap-1 align-items-center flex-shrink-0">
                        {site.zone && (
                          <Badge
                            bg="warning"
                            text="dark"
                            style={{ fontSize: '0.65rem' }}
                            title={`Currently in zone: ${site.zone.name}`}
                          >
                            🗺️ Zoned
                          </Badge>
                        )}
                        <span style={{ fontSize: '0.72rem', color: '#0F7B6C' }}>+ Add</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div style={{
              padding: '4px 10px', borderTop: '1px solid #e9ecef',
              background: '#f8f9fa', fontSize: '0.72rem', color: '#6c757d',
            }}>
              {availableSites.length} site(s) available
            </div>
          </div>
        </Col>

        {/* Right: selected sites */}
        <Col md={6}>
          <div style={{
            border: '1px solid #ced4da', borderRadius: '0.375rem', overflow: 'hidden',
            minHeight: '200px', display: 'flex', flexDirection: 'column',
          }}>
            <div style={{
              padding: '6px 10px', borderBottom: '1px solid #e9ecef',
              background: selectedSites.length > 0 ? '#D0EDE9' : '#f8f9fa',
              fontSize: '0.78rem', fontWeight: 600, color: '#1B3A6B',
            }}>
              Selected Sites{selectedSites.length > 0 ? ` (${selectedSites.length})` : ''}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', maxHeight }}>
              {selectedSites.length === 0 ? (
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', height: 140, color: '#6c757d',
                  fontSize: '0.82rem', textAlign: 'center', padding: 16,
                }}>
                  <div style={{ fontSize: '1.8rem', marginBottom: 6 }}>📍</div>
                  <div>No sites added yet</div>
                  <div style={{ fontSize: '0.72rem', marginTop: 4 }}>
                    Click a site on the left to add it to this zone
                  </div>
                </div>
              ) : (
                selectedSites.map((site: SiteResponse, i: number) => (
                  <div
                    key={site.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '7px 12px',
                      borderBottom: i < selectedSites.length - 1 ? '1px solid #f0f0f0' : 'none',
                      background: '#fff',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontWeight: 500, fontSize: '0.83rem',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#1A1A1A',
                      }}>
                        {site.siteName}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#6c757d' }}>
                        {site.clientName}
                        {site.location && <span className="ms-1">· {site.location}</span>}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeSite(site.id)}
                      style={{
                        background: 'none', border: 'none', color: '#dc3545',
                        cursor: 'pointer', fontSize: '1rem', padding: '0 2px', flexShrink: 0, lineHeight: 1,
                      }}
                      title="Remove from zone"
                    >
                      X
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </Col>
      </Row>

      {selectedSites.length === 0 && (
        <Form.Text className="text-muted d-block mt-1">
          Adding sites is optional — you can also assign sites after the zone is created.
        </Form.Text>
      )}
    </div>
  );
}
