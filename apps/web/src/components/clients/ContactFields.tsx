import { Col, Form, Row } from 'react-bootstrap';
import { CONTACT_TYPES, contactTypeConfig, type ContactType } from '@security360/shared';

export interface ContactDraft {
  contactType: ContactType;
  name:        string;
  phone:       string;
  email:       string;
  jobTitle:    string;
  isPrimary:   boolean;
  notes:       string;
}

export const emptyContact = (isPrimary = false): ContactDraft => ({
  contactType: isPrimary ? 'PRIMARY' : 'SECONDARY',
  name:        '',
  phone:       '',
  email:       '',
  jobTitle:    '',
  isPrimary,
  notes:       '',
});

interface Props {
  contact:  ContactDraft;
  onChange: (patch: Partial<ContactDraft>) => void;
  disabled?: boolean;
  /** Set when the surrounding form has been submitted, to show what is missing. */
  showErrors?: boolean;
  /** Hidden on the create form, where a card is already short enough. */
  withNotes?: boolean;
}

/**
 * The fields describing one contact person.
 *
 * Shared by the create form and the add/edit modal so the two cannot drift into
 * collecting different things about the same person.
 */
export default function ContactFields({
  contact, onChange, disabled, showErrors, withNotes,
}: Props) {
  const type = contactTypeConfig(contact.contactType);
  const nameMissing = showErrors && !contact.name.trim();

  return (
    <>
      <Row className="g-2 align-items-center mb-3">
        <Col xs="auto">
          <Form.Select
            size="sm"
            value={contact.contactType}
            disabled={disabled}
            onChange={(e) => onChange({ contactType: e.target.value as ContactType })}
            style={{
              width: 'auto', fontSize: '0.78rem', fontWeight: 600,
              color: type.colour, border: `1px solid ${type.colour}55`,
            }}
          >
            {CONTACT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
            ))}
          </Form.Select>
        </Col>
        <Col xs="auto">
          {/*
            Only promotion is offered. Unticking primary would leave the client
            with no primary contact at all, and there is no useful state on the
            other side of that click.
          */}
          <button
            type="button"
            disabled={disabled || contact.isPrimary}
            onClick={() => onChange({ isPrimary: true })}
            style={{
              background: 'none', border: 'none', padding: '0 4px',
              cursor: contact.isPrimary ? 'default' : 'pointer',
              fontSize: '0.74rem',
              color: contact.isPrimary ? '#F2AA20' : '#adb5bd',
              fontWeight: contact.isPrimary ? 700 : 400,
            }}
          >
            {contact.isPrimary ? '⭐ Primary' : '☆ Set as primary'}
          </button>
        </Col>
      </Row>

      <Row className="g-2">
        <Col md={6}>
          <Form.Label className="small fw-bold mb-1">
            Full Name <span className="text-danger">*</span>
          </Form.Label>
          <Form.Control
            size="sm"
            value={contact.name}
            disabled={disabled}
            isInvalid={!!nameMissing}
            placeholder="e.g. James Opio"
            onChange={(e) => onChange({ name: e.target.value })}
          />
          <Form.Control.Feedback type="invalid">A name is required.</Form.Control.Feedback>
        </Col>
        <Col md={6}>
          <Form.Label className="small fw-bold mb-1">
            Job Title / Role <span className="text-muted fw-normal">(optional)</span>
          </Form.Label>
          <Form.Control
            size="sm"
            value={contact.jobTitle}
            disabled={disabled}
            placeholder="e.g. Finance Manager"
            onChange={(e) => onChange({ jobTitle: e.target.value })}
          />
        </Col>
        <Col md={6}>
          <Form.Label className="small fw-bold mb-1">
            Phone Number <span className="text-muted fw-normal">(optional)</span>
          </Form.Label>
          <Form.Control
            size="sm"
            type="tel"
            value={contact.phone}
            disabled={disabled}
            placeholder="256XXXXXXXXX"
            onChange={(e) => onChange({ phone: e.target.value })}
          />
        </Col>
        <Col md={6}>
          <Form.Label className="small fw-bold mb-1">
            Email Address <span className="text-muted fw-normal">(optional)</span>
          </Form.Label>
          <Form.Control
            size="sm"
            type="email"
            value={contact.email}
            disabled={disabled}
            placeholder="contact@company.co.ug"
            onChange={(e) => onChange({ email: e.target.value })}
          />
        </Col>
        {withNotes && (
          <Col xs={12}>
            <Form.Label className="small fw-bold mb-1">
              Notes <span className="text-muted fw-normal">(optional)</span>
            </Form.Label>
            <Form.Control
              size="sm"
              as="textarea"
              rows={2}
              value={contact.notes}
              disabled={disabled}
              placeholder="e.g. Best reached after 2pm; handles all invoice queries."
              onChange={(e) => onChange({ notes: e.target.value })}
            />
          </Col>
        )}
      </Row>
    </>
  );
}
