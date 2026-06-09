import { useState } from 'react';
import { Alert, Button, Col, Form, Modal, Row, Spinner } from 'react-bootstrap';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { complaintsApi } from '../../lib/complaints.api';
import { useClientList as useClients } from '../../hooks/useClients';
import { useToast } from '../../context/ToastContext';

interface Props {
  show:    boolean;
  onClose: () => void;
  onSuccess?: () => void;
  preselectedClient?: {
    id:         string;
    clientName: string;
  };
}

export default function ComplaintFormModal({ show, onClose, onSuccess, preselectedClient }: Props) {
  const { showToast } = useToast();
  const qc             = useQueryClient();
  const { data: clientsRes, isLoading: clientsLoading } = useClients({ limit: 200 });
  const clients = clientsRes?.data ?? [];

  const [form, setForm] = useState({
    clientId:    preselectedClient?.id ?? '',
    subject:     '',
    category:    'GUARD_CONDUCT' as const,
    description: '',
    severity:    'MEDIUM' as const,
  });

  const create = useMutation({
    mutationFn: () => complaintsApi.create({
      clientId:    form.clientId,
      subject:     form.subject,
      category:    form.category,
      description: form.description,
      severity:    form.severity,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['complaints'] });
      showToast('Complaint logged successfully', 'success');
      onSuccess?.();
      onClose();
    },
    onError: (err: any) =>
      showToast(err?.response?.data?.error ?? 'Failed to log complaint', 'danger'),
  });

  const canSubmit =
    form.clientId &&
    form.subject.trim().length > 0 &&
    form.description.length >= 10 &&
    !create.isPending;

  return (
    <Modal show={show} onHide={onClose} size="lg">
      <Modal.Header closeButton>
        <Modal.Title>Log Complaint</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {create.isError && (
          <Alert variant="danger" className="small py-2">
            {(create.error as any)?.response?.data?.error ?? 'Failed to submit complaint. Please try again.'}
          </Alert>
        )}

        {/* Client — read-only when preselected */}
        {preselectedClient ? (
          <div
            style={{
              background:   '#F2F4F7',
              borderRadius: '0.375rem',
              padding:      '8px 12px',
              fontSize:     '0.88rem',
              color:        '#1B3A6B',
              fontWeight:   500,
              marginBottom: '16px',
            }}
          >
            📋 Logging complaint for: <strong>{preselectedClient.clientName}</strong>
          </div>
        ) : (
          <Form.Group className="mb-3">
            <Form.Label>Client <span className="text-danger">*</span></Form.Label>
            {!clientsLoading && clients.length === 0 ? (
              <Alert variant="warning" className="small py-2 mb-0">
                No active clients found. Add a client before logging a complaint.
              </Alert>
            ) : (
              <Form.Select
                value={form.clientId}
                onChange={e => setForm(f => ({ ...f, clientId: e.target.value }))}
                disabled={clientsLoading}
                isInvalid={!clientsLoading && !form.clientId && create.isError}
              >
                <option value="">{clientsLoading ? 'Loading clients…' : '— Select client —'}</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.clientName}</option>)}
              </Form.Select>
            )}
          </Form.Group>
        )}

        {/* Subject */}
        <Form.Group className="mb-3">
          <Form.Label>Subject <span className="text-danger">*</span></Form.Label>
          <Form.Control
            type="text"
            maxLength={200}
            value={form.subject}
            onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
            placeholder="Brief description of the issue (e.g. Guard arrived 2 hours late)"
          />
          <Form.Text className="text-muted d-flex justify-content-end">{form.subject.length}/200</Form.Text>
        </Form.Group>

        {/* Category + Severity */}
        <Row className="g-3 mb-3">
          <Col md={6}>
            <Form.Group>
              <Form.Label>Category</Form.Label>
              <Form.Select
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value as typeof form.category }))}
              >
                {(['GUARD_CONDUCT', 'LATE_DEPLOYMENT', 'BILLING_DISPUTE', 'EQUIPMENT', 'OTHER'] as const).map(c => (
                  <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
                ))}
              </Form.Select>
            </Form.Group>
          </Col>
          <Col md={6}>
            <Form.Group>
              <Form.Label>Severity</Form.Label>
              <Form.Select
                value={form.severity}
                onChange={e => setForm(f => ({ ...f, severity: e.target.value as typeof form.severity }))}
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </Form.Select>
            </Form.Group>
          </Col>
        </Row>

        {/* Description */}
        <Form.Group>
          <Form.Label>Description <span className="text-danger">*</span></Form.Label>
          <Form.Control
            as="textarea"
            rows={4}
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Describe the complaint in detail (min 10 characters)…"
            maxLength={2000}
          />
          <Form.Text className="text-muted d-flex justify-content-end">{form.description.length}/2000</Form.Text>
        </Form.Group>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="danger" onClick={() => create.mutate()} disabled={!canSubmit}>
          {create.isPending
            ? <><Spinner size="sm" animation="border" className="me-1" />Submitting…</>
            : 'Submit Complaint'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
