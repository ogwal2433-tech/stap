import { useState } from 'react';
import { Alert, Button, Form, Modal, Spinner } from 'react-bootstrap';
import { useQuery } from '@tanstack/react-query';
import { clientsApi } from '../../lib/clients.api';
import { useTransferGuard } from '../../hooks/useGuards';
import { useToast } from '../../context/ToastContext';

interface TransferModalProps {
  guardId: string;
  guardName: string;
  currentSiteName?: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function TransferModal({
  guardId,
  guardName,
  currentSiteName,
  onClose,
  onSuccess,
}: TransferModalProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [toSiteId, setToSiteId] = useState('');
  const [transferDate, setTransferDate] = useState(today);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const { showToast } = useToast();

  const { data: sitesPage, isLoading: sitesLoading } = useQuery({
    queryKey: ['sites-all'],
    queryFn: () => clientsApi.getAllSites({ limit: 500 }),
    staleTime: 5 * 60 * 1000,
  });

  const transfer = useTransferGuard(guardId);
  const sites = sitesPage?.data ?? [];

  const handleSubmit = () => {
    if (!toSiteId) {
      setError('Please select a destination site.');
      return;
    }
    if (reason.trim().length < 10) {
      setError('Reason must be at least 10 characters.');
      return;
    }
    setError('');
    transfer.mutate(
      {
        toSiteId,
        reason: reason.trim(),
        transferDate: new Date(transferDate).toISOString(),
      },
      {
        onSuccess: () => {
          showToast('Guard transferred successfully', 'success');
          onSuccess();
          onClose();
        },
        onError: (err: any) =>
          setError(err?.response?.data?.error || 'Transfer failed.'),
      },
    );
  };

  return (
    <Modal show onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title>Transfer Guard</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form.Group className="mb-3">
          <Form.Label className="fw-semibold small text-muted text-uppercase">Guard</Form.Label>
          <div className="fw-medium">{guardName}</div>
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label className="fw-semibold small text-muted text-uppercase">From Site</Form.Label>
          <div className="fw-medium text-muted">
            {currentSiteName ?? 'Not currently deployed'}
          </div>
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label>
            To Site <span className="text-danger">*</span>
          </Form.Label>
          {sitesLoading ? (
            <div className="d-flex align-items-center gap-2 text-muted small">
              <Spinner size="sm" /> Loading sites…
            </div>
          ) : (
            <Form.Select
              value={toSiteId}
              onChange={(e) => setToSiteId(e.target.value)}
            >
              <option value="">— Select destination site —</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.siteName} — {s.clientName}
                </option>
              ))}
            </Form.Select>
          )}
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label>
            Transfer Date <span className="text-danger">*</span>
          </Form.Label>
          <Form.Control
            type="date"
            value={transferDate}
            onChange={(e) => setTransferDate(e.target.value)}
          />
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label>
            Reason <span className="text-danger">*</span>
          </Form.Label>
          <Form.Control
            as="textarea"
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="State the reason for this transfer, e.g. client request, performance issue, roster balancing, etc."
          />
        </Form.Group>

        {error && (
          <Alert variant="danger" className="mb-0 py-2 small">
            {error}
          </Alert>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose} disabled={transfer.isPending}>
          Cancel
        </Button>
        <Button
          variant="primary"
          style={{ backgroundColor: '#1B3A6B', borderColor: '#1B3A6B' }}
          onClick={handleSubmit}
          disabled={transfer.isPending || sitesLoading}
        >
          {transfer.isPending && (
            <Spinner as="span" size="sm" className="me-2" animation="border" />
          )}
          Transfer Guard
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
