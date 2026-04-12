import { useRef, useState } from 'react';
import {
  Alert, Button, Form, Modal, ProgressBar, Spinner,
} from 'react-bootstrap';
import { guardsApi } from '../../lib/guards.api';
import { useToast } from '../../context/ToastContext';

const DOCUMENT_TYPES = [
  { value: 'NIN', label: 'National ID' },
  { value: 'LC1_LETTER', label: 'LC1 Letter' },
  { value: 'CONTRACT', label: 'Contract' },
  { value: 'PSO_CERTIFICATE', label: 'PSO Certificate' },
  { value: 'NSSF', label: 'NSSF' },
  { value: 'WARNING_LETTER', label: 'Warning Letter' },
  { value: 'OTHER', label: 'Other' },
];

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

interface DocumentUploadModalProps {
  guardId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function DocumentUploadModal({ guardId, onClose, onSuccess }: DocumentUploadModalProps) {
  const [documentType, setDocumentType] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [sizeError, setSizeError] = useState('');
  const [apiError, setApiError] = useState('');
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] ?? null;
    setFile(selected);
    setSizeError('');
    if (selected && selected.size > MAX_SIZE) {
      setSizeError(`File is too large (${(selected.size / 1024 / 1024).toFixed(1)} MB). Maximum is 5 MB.`);
    }
  };

  const handleUpload = async () => {
    if (!file || !documentType || sizeError) return;
    setApiError('');
    setUploading(true);
    try {
      await guardsApi.uploadDocument(guardId, file, documentType);
      showToast('Document uploaded successfully', 'success');
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Upload failed. Please try again.';
      setApiError(msg);
    } finally {
      setUploading(false);
    }
  };

  const canSubmit = Boolean(documentType && file && !sizeError);

  return (
    <Modal show onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title>Upload Document</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {apiError && <Alert variant="danger">{apiError}</Alert>}

        <Form.Group className="mb-3">
          <Form.Label>
            Document Type <span className="text-danger">*</span>
          </Form.Label>
          <Form.Select
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value)}
            disabled={uploading}
          >
            <option value="">Select type…</option>
            {DOCUMENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Form.Select>
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label>
            File <span className="text-danger">*</span>
          </Form.Label>
          <Form.Control
            ref={inputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={handleFileChange}
            disabled={uploading}
            isInvalid={Boolean(sizeError)}
          />
          {file && !sizeError && (
            <Form.Text className="text-muted">
              Selected: {file.name} ({(file.size / 1024).toFixed(0)} KB)
            </Form.Text>
          )}
          {sizeError && (
            <Form.Control.Feedback type="invalid">{sizeError}</Form.Control.Feedback>
          )}
        </Form.Group>

        {uploading && (
          <ProgressBar animated striped variant="primary" now={100} className="mt-2" />
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose} disabled={uploading}>
          Cancel
        </Button>
        <Button variant="primary" onClick={handleUpload} disabled={!canSubmit || uploading}>
          {uploading ? <Spinner as="span" animation="border" size="sm" className="me-2" /> : null}
          Upload
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
