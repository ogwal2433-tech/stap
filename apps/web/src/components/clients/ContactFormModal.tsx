import { useEffect, useState } from 'react';
import { Button, Modal, Spinner } from 'react-bootstrap';
import { useMutation } from '@tanstack/react-query';
import type { ClientContactResponse } from '@stap/shared';
import ContactFields, { emptyContact, type ContactDraft } from './ContactFields';
import { clientsApi } from '../../lib/clients.api';
import { useToast } from '../../context/ToastContext';
import { getApiErrorMessage } from '../../lib/api';

interface Props {
  clientId:  string;
  /** The contact being edited, or null to add a new one. */
  contact:   ClientContactResponse | null;
  show:      boolean;
  onClose:   () => void;
  onSaved:   () => void;
}

const toDraft = (c: ClientContactResponse): ContactDraft => ({
  contactType: c.contactType,
  name:        c.name,
  phone:       c.phone    ?? '',
  email:       c.email    ?? '',
  jobTitle:    c.jobTitle ?? '',
  isPrimary:   c.isPrimary,
  notes:       c.notes    ?? '',
});

export default function ContactFormModal({ clientId, contact, show, onClose, onSaved }: Props) {
  const { showToast } = useToast();
  const [draft, setDraft]     = useState<ContactDraft>(emptyContact());
  const [touched, setTouched] = useState(false);

  // Reset each time the modal opens, so editing one contact and then adding
  // another does not start from the previous person's details.
  useEffect(() => {
    if (show) {
      setDraft(contact ? toDraft(contact) : emptyContact());
      setTouched(false);
    }
  }, [show, contact]);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        contactType: draft.contactType,
        name:        draft.name.trim(),
        phone:       draft.phone.trim()    || null,
        email:       draft.email.trim()    || null,
        jobTitle:    draft.jobTitle.trim() || null,
        isPrimary:   draft.isPrimary,
        notes:       draft.notes.trim()    || null,
      };
      return contact
        ? clientsApi.updateContact(clientId, contact.id, body)
        : clientsApi.addContact(clientId, body);
    },
    onSuccess: (c) => {
      showToast(contact ? `${c.name} updated` : `${c.name} added as a contact`, 'success');
      onSaved();
      onClose();
    },
    onError: (err) => showToast(getApiErrorMessage(err, 'Could not save the contact.'), 'danger'),
  });

  const submit = () => {
    setTouched(true);
    if (!draft.name.trim()) return;
    save.mutate();
  };

  return (
    <Modal show={show} onHide={save.isPending ? undefined : onClose} centered>
      <Modal.Header closeButton={!save.isPending}>
        <Modal.Title className="h6 mb-0">
          {contact ? `Edit ${contact.name}` : 'Add a contact person'}
        </Modal.Title>
      </Modal.Header>

      <Modal.Body>
        <ContactFields
          contact={draft}
          disabled={save.isPending}
          showErrors={touched}
          withNotes
          onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
        />
        {draft.isPrimary && !contact?.isPrimary && (
          <div className="text-muted" style={{ fontSize: '0.74rem', marginTop: 10 }}>
            This will replace the current primary contact, and is the name that appears
            on invoices.
          </div>
        )}
      </Modal.Body>

      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onClose} disabled={save.isPending}>
          Cancel
        </Button>
        <Button variant="primary" onClick={submit} disabled={save.isPending}>
          {save.isPending
            ? <><Spinner as="span" size="sm" animation="border" className="me-2" />Saving…</>
            : contact ? 'Save changes' : 'Add contact'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
