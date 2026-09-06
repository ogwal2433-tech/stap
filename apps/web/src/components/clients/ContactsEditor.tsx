import { Button } from 'react-bootstrap';
import { contactTypeConfig } from '@stap/shared';
import ContactFields, { emptyContact, type ContactDraft } from './ContactFields';

interface Props {
  contacts:    ContactDraft[];
  onChange:    (contacts: ContactDraft[]) => void;
  disabled?:   boolean;
  showErrors?: boolean;
}

/**
 * The contact-person list on the client create/edit form.
 *
 * A client is an organisation: the manager who signs, the accounts person who
 * pays and the operations person who answers at 2am are rarely the same person, and
 * holding only one of them sent every call to the wrong number.
 */
export default function ContactsEditor({ contacts, onChange, disabled, showErrors }: Props) {
  const update = (i: number, patch: Partial<ContactDraft>) => {
    const next = contacts.map((c, idx) => (idx === i ? { ...c, ...patch } : c));
    // Promoting one demotes the rest, here rather than on the server, so the
    // stars in front of the user always agree with what will be saved.
    if (patch.isPrimary) {
      onChange(next.map((c, idx) => ({ ...c, isPrimary: idx === i })));
      return;
    }
    onChange(next);
  };

  const add = () => onChange([...contacts, emptyContact(contacts.length === 0)]);

  const remove = (i: number) => {
    if (contacts.length === 1) return;
    const next = contacts.filter((_, idx) => idx !== i);
    // Removing the primary promotes the first of what is left, so the client
    // never ends up with contacts and no primary among them.
    if (!next.some((c) => c.isPrimary)) next[0] = { ...next[0], isPrimary: true };
    onChange(next);
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <div className="fw-bold small">Contact Persons</div>
          <div style={{ fontSize: '0.72rem', color: '#6c757d' }}>
            Everyone worth ringing at this company. The primary one appears on invoices.
          </div>
        </div>
        <Button variant="outline-primary" size="sm" onClick={add} disabled={disabled}>
          + Add Contact
        </Button>
      </div>

      {contacts.length === 0 ? (
        <div
          style={{
            textAlign: 'center', color: '#6c757d', fontSize: '0.82rem',
            padding: '18px', border: '2px dashed #ced4da', borderRadius: '0.5rem',
          }}
        >
          No contacts yet — add at least one person to contact at this client.
        </div>
      ) : (
        contacts.map((contact, i) => (
          <div
            key={i}
            style={{
              // Longhand on all four sides: React warns when a `border`
              // shorthand and a `borderLeft` are updated on the same element,
              // because the order they are applied in is not guaranteed.
              borderTop:    `1px solid ${contact.isPrimary ? '#1B3A6B' : '#e9ecef'}`,
              borderRight:  `1px solid ${contact.isPrimary ? '#1B3A6B' : '#e9ecef'}`,
              borderBottom: `1px solid ${contact.isPrimary ? '#1B3A6B' : '#e9ecef'}`,
              borderLeft:   `4px solid ${contactTypeConfig(contact.contactType).colour}`,
              borderRadius: '0.5rem',
              padding:      '14px 16px',
              marginBottom: '12px',
              background:   contact.isPrimary ? '#F0F4FB' : 'white',
              position:     'relative',
            }}
          >
            {contacts.length > 1 && (
              <button
                type="button"
                aria-label={`Remove contact ${i + 1}`}
                onClick={() => remove(i)}
                disabled={disabled}
                style={{
                  position: 'absolute', top: 10, right: 12,
                  background: 'none', border: 'none', color: '#dc3545',
                  cursor: 'pointer', fontSize: '1.05rem', lineHeight: 1,
                }}
              >
                ✕
              </button>
            )}
            <ContactFields
              contact={contact}
              disabled={disabled}
              showErrors={showErrors}
              onChange={(patch) => update(i, patch)}
            />
          </div>
        ))
      )}
    </div>
  );
}
