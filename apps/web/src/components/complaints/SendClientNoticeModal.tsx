import { useState } from 'react';
import { Alert, Button, Form, Modal, Spinner } from 'react-bootstrap';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { complaintsApi } from '../../lib/complaints.api';
import { useClientList as useClients } from '../../hooks/useClients';
import { useToast } from '../../context/ToastContext';
import { getApiErrorMessage } from '../../lib/api';

interface Props {
  show:       boolean;
  onClose:    () => void;
  onSuccess?: () => void;
}

const PRIORITIES = [
  { value: 'LOW',    label: '🟢 Low',    variant: 'outline-success' },
  { value: 'MEDIUM', label: '🟡 Medium', variant: 'outline-warning' },
  { value: 'HIGH',   label: '🔴 High',   variant: 'outline-danger'  },
] as const;

const CATEGORIES = [
  { value: 'OTHER',           label: 'General / Administrative' },
  { value: 'BILLING_DISPUTE', label: 'Billing' },
  { value: 'GUARD_CONDUCT',   label: 'Guard Conduct' },
  { value: 'LATE_DEPLOYMENT', label: 'Deployment' },
  { value: 'EQUIPMENT',       label: 'Equipment' },
] as const;

const MIN_SUBJECT = 3;
const MIN_BODY    = 10;

/**
 * Sends a formal notice from STAP to a client — the reverse of logging a
 * complaint a client raised with us.
 */
export default function SendClientNoticeModal({ show, onClose, onSuccess }: Props) {
  const { showToast } = useToast();
  const qc            = useQueryClient();

  const { data: clientsRes, isLoading: clientsLoading } = useClients({ limit: 200 });
  const clients = clientsRes?.data ?? [];

  const [form, setForm] = useState({
    clientId:    '',
    subject:     '',
    description: '',
    priority:    'MEDIUM' as 'LOW' | 'MEDIUM' | 'HIGH',
    category:    'OTHER'  as (typeof CATEGORIES)[number]['value'],
  });

  const reset = () =>
    setForm({ clientId: '', subject: '', description: '', priority: 'MEDIUM', category: 'OTHER' });

  const send = useMutation({
    mutationFn: () =>
      complaintsApi.sendNotice({
        clientId:    form.clientId,
        subject:     form.subject.trim(),
        description: form.description.trim(),
        priority:    form.priority,
        category:    form.category,
      }),
    onSuccess: (notice) => {
      qc.invalidateQueries({ queryKey: ['complaints'] });
      showToast(`Notice sent to ${notice.client.clientName}`, 'success');
      reset();
      onSuccess?.();
      onClose();
    },
    onError: (err) => showToast(getApiErrorMessage(err, 'Could not send the notice.'), 'danger'),
  });

  const canSubmit =
    !!form.clientId &&
    form.subject.trim().length >= MIN_SUBJECT &&
    form.description.trim().length >= MIN_BODY &&
    !send.isPending;

  const handleClose = () => { if (!send.isPending) { reset(); onClose(); } };

  return (
    <Modal show={show} onHide={handleClose} size="lg">
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: '1.05rem' }}>📤 Send Notice to Client</Modal.Title>
      </Modal.Header>

      <Modal.Body>
        <Alert variant="info" className="small py-2">
          This sends a formal notice to the selected client. Everyone with a portal login for that
          company is notified, and they can acknowledge it from their portal.
        </Alert>

        {send.isError && (
          <Alert variant="danger" className="small py-2">
            {getApiErrorMessage(send.error, 'Could not send the notice. Please try again.')}
          </Alert>
        )}

        <Form.Group className="mb-3">
          <Form.Label className="small fw-semibold">
            Client <span className="text-danger">*</span>
          </Form.Label>
          {clientsLoading ? (
            <div className="text-muted small"><Spinner size="sm" animation="border" className="me-2" />Loading clients…</div>
          ) : (
            <Form.Select
              size="sm"
              value={form.clientId}
              onChange={e => setForm(f => ({ ...f, clientId: e.target.value }))}
            >
              <option value="">— Select a client —</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.clientName}</option>
              ))}
            </Form.Select>
          )}
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label className="small fw-semibold d-block">Priority</Form.Label>
          <div className="d-flex gap-2">
            {PRIORITIES.map(p => (
              <Button
                key={p.value}
                size="sm"
                variant={form.priority === p.value ? p.variant.replace('outline-', '') : p.variant}
                onClick={() => setForm(f => ({ ...f, priority: p.value }))}
                type="button"
              >
                {p.label}
              </Button>
            ))}
          </div>
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label className="small fw-semibold">Category</Form.Label>
          <Form.Select
            size="sm"
            value={form.category}
            onChange={e => setForm(f => ({ ...f, category: e.target.value as typeof f.category }))}
          >
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </Form.Select>
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label className="small fw-semibold">
            Subject <span className="text-danger">*</span>
          </Form.Label>
          <Form.Control
            size="sm"
            type="text"
            maxLength={200}
            value={form.subject}
            placeholder="e.g. Outstanding invoice — INV/2026/0001"
            onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
          />
          <Form.Text className="text-muted">At least {MIN_SUBJECT} characters.</Form.Text>
        </Form.Group>

        <Form.Group>
          <Form.Label className="small fw-semibold">
            Notice <span className="text-danger">*</span>
          </Form.Label>
          <Form.Control
            as="textarea"
            rows={6}
            size="sm"
            maxLength={5000}
            value={form.description}
            placeholder="Write the notice exactly as the client should read it…"
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          />
          <Form.Text className="text-muted">
            {form.description.trim().length < MIN_BODY
              ? `At least ${MIN_BODY} characters.`
              : `${form.description.length} / 5000`}
          </Form.Text>
        </Form.Group>
      </Modal.Body>

      <Modal.Footer>
        <Button size="sm" variant="outline-secondary" onClick={handleClose} disabled={send.isPending}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" disabled={!canSubmit} onClick={() => send.mutate()}>
          {send.isPending
            ? <><Spinner as="span" size="sm" animation="border" className="me-1" />Sending…</>
            : '📤 Send Notice'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
