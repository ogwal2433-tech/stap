import { useState } from 'react';
import { Badge, Button, Card, Spinner } from 'react-bootstrap';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { contactTypeConfig, type ClientContactResponse } from '@stap/shared';
import ContactFormModal from './ContactFormModal';
import { clientsApi } from '../../lib/clients.api';
import { useToast } from '../../context/ToastContext';
import { getApiErrorMessage } from '../../lib/api';

/**
 * Everyone worth ringing at a client, on the client's own page.
 *
 * The primary contact is the one that reaches invoices and MoMo disbursement,
 * which is why it is marked rather than merely first.
 */
export default function ClientContacts({ clientId, canEdit }: { clientId: string; canEdit: boolean }) {
  const { showToast } = useToast();
  const queryClient   = useQueryClient();

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]     = useState<ClientContactResponse | null>(null);

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ['client-contacts', clientId],
    queryFn:  () => clientsApi.contacts(clientId),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['client-contacts', clientId] });
    // The client record carries the denormalised primary, so promoting someone
    // changes the name in the profile header too.
    queryClient.invalidateQueries({ queryKey: ['client', clientId] });
    queryClient.invalidateQueries({ queryKey: ['clients'] });
  };

  const remove = useMutation({
    mutationFn: (contactId: string) => clientsApi.deleteContact(clientId, contactId),
    onSuccess: () => { showToast('Contact removed', 'success'); refresh(); },
    onError:   (err) => showToast(getApiErrorMessage(err, 'Could not remove the contact.'), 'danger'),
  });

  const open = (contact: ClientContactResponse | null) => {
    setEditing(contact);
    setShowModal(true);
  };

  return (
    <Card className="border-0 shadow-sm mb-4">
      <Card.Header className="bg-white d-flex justify-content-between align-items-center">
        <span className="fw-semibold" style={{ color: '#1B3A6B' }}>
          👥 Contact Persons
          <Badge bg="secondary" className="ms-2" style={{ fontSize: '0.68rem' }}>
            {contacts.length}
          </Badge>
        </span>
        {canEdit && (
          <Button variant="outline-primary" size="sm" onClick={() => open(null)}>
            + Add Contact
          </Button>
        )}
      </Card.Header>

      <Card.Body>
        {isLoading ? (
          <div className="text-center py-3"><Spinner animation="border" size="sm" /></div>
        ) : contacts.length === 0 ? (
          <div className="text-center text-muted py-3" style={{ fontSize: '0.85rem' }}>
            No contacts recorded for this client yet.
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: '12px',
          }}>
            {contacts.map((c) => {
              const type = contactTypeConfig(c.contactType);
              return (
                <div
                  key={c.id}
                  style={{
                    borderTop:    `1px solid ${c.isPrimary ? '#1B3A6B' : '#e9ecef'}`,
                    borderRight:  `1px solid ${c.isPrimary ? '#1B3A6B' : '#e9ecef'}`,
                    borderBottom: `1px solid ${c.isPrimary ? '#1B3A6B' : '#e9ecef'}`,
                    borderLeft:   `4px solid ${type.colour}`,
                    borderRadius: '0.5rem',
                    padding:      '12px 14px',
                    background:   c.isPrimary ? '#F0F4FB' : '#F8F9FA',
                    position:     'relative',
                  }}
                >
                  {c.isPrimary && (
                    <div style={{
                      position: 'absolute', top: 8, right: 8,
                      fontSize: '0.62rem', background: '#F2AA20', color: 'white',
                      padding: '2px 7px', borderRadius: 10, fontWeight: 700,
                    }}>
                      ⭐ PRIMARY
                    </div>
                  )}

                  <div style={{
                    fontSize: '0.66rem', fontWeight: 700, color: type.colour,
                    textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6,
                  }}>
                    {type.icon} {type.label}
                  </div>

                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{c.name}</div>
                  {c.jobTitle && (
                    <div style={{ fontSize: '0.75rem', color: '#6c757d', marginBottom: 6 }}>
                      {c.jobTitle}
                    </div>
                  )}

                  {c.phone && (
                    <div style={{ fontSize: '0.78rem', marginTop: 4 }}>
                      📞 <a href={`tel:${c.phone}`} style={{ color: '#1B3A6B', textDecoration: 'none' }}>
                        {c.phone}
                      </a>
                    </div>
                  )}
                  {c.email && (
                    <div style={{ fontSize: '0.78rem', marginTop: 2 }}>
                      ✉️ <a
                        href={`mailto:${c.email}`}
                        style={{ color: '#1B3A6B', textDecoration: 'none', wordBreak: 'break-all' }}
                      >
                        {c.email}
                      </a>
                    </div>
                  )}
                  {c.notes && (
                    <div style={{ fontSize: '0.72rem', color: '#6c757d', marginTop: 6, fontStyle: 'italic' }}>
                      {c.notes}
                    </div>
                  )}

                  {canEdit && (
                    <div className="d-flex gap-2 mt-3">
                      <Button
                        size="sm" variant="outline-secondary"
                        style={{ fontSize: '0.7rem', padding: '2px 8px' }}
                        onClick={() => open(c)}
                      >
                        Edit
                      </Button>
                      {/*
                        The last contact stays: the client's contactPerson column
                        is required and an invoice has to be addressed to someone.
                        The button is hidden rather than shown failing.
                      */}
                      {contacts.length > 1 && (
                        <Button
                          size="sm" variant="outline-danger"
                          style={{ fontSize: '0.7rem', padding: '2px 8px' }}
                          disabled={remove.isPending}
                          onClick={() => {
                            if (window.confirm(`Remove ${c.name} from this client's contacts?`)) {
                              remove.mutate(c.id);
                            }
                          }}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card.Body>

      {canEdit && (
        <ContactFormModal
          clientId={clientId}
          contact={editing}
          show={showModal}
          onClose={() => setShowModal(false)}
          onSaved={refresh}
        />
      )}
    </Card>
  );
}
