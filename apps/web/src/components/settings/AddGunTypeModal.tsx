import { useEffect, useState } from 'react';
import { Alert, Button, Form, Modal, Spinner } from 'react-bootstrap';
import { useToast } from '../../context/ToastContext';
import { useCreateGunType, useAllGunTypes } from '../../hooks/useSettings';
import { getApiErrorMessage } from '../../lib/api';

interface Props {
  show: boolean;
  onHide: () => void;
}

function toCode(label: string): string {
  return label.toUpperCase().replace(/[^A-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

export default function AddGunTypeModal({ show, onHide }: Props) {
  const { showToast } = useToast();
  const { mutate: createType, isPending } = useCreateGunType();
  const { data: allTypes = [] } = useAllGunTypes();

  const [label, setLabel] = useState('');
  const [code, setCode] = useState('');
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(false);
  const [labelError, setLabelError] = useState('');
  const [codeError, setCodeError] = useState('');

  useEffect(() => {
    if (show) {
      setLabel('');
      setCode('');
      setCodeManuallyEdited(false);
      setLabelError('');
      setCodeError('');
    }
  }, [show]);

  const handleLabelChange = (val: string) => {
    setLabel(val);
    setLabelError('');
    if (!codeManuallyEdited) {
      setCode(toCode(val));
    }
  };

  const handleCodeChange = (val: string) => {
    setCode(val.toUpperCase().replace(/[^A-Z0-9_]/g, ''));
    setCodeManuallyEdited(true);
    setCodeError('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLabelError('');
    setCodeError('');
    if (label.trim().length < 2) { setLabelError('Give the type a label of at least 2 characters.'); return; }
    if (code.trim().length < 2) { setCodeError('Give the type a code of at least 2 characters.'); return; }
    if (allTypes.some((t) => t.code === code.trim())) { setCodeError('This code is already in use.'); return; }
    createType(
      {
        code: code.trim(),
        label: label.trim(),
        displayOrder: allTypes.length > 0 ? Math.max(...allTypes.map((t) => t.displayOrder)) + 1 : 1,
      },
      {
        onSuccess: () => {
          showToast(`Gun type "${label.trim()}" added. It is now offered in the register form.`, 'success');
          onHide();
        },
        onError: (err) => setCodeError(getApiErrorMessage(err, 'Could not add the gun type.')),
      },
    );
  };

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: '1.05rem' }}>
          <i className="bi bi-plus-lg me-2" />Add Gun Type
        </Modal.Title>
      </Modal.Header>
      <Form onSubmit={handleSubmit}>
        <Modal.Body>
          <Form.Group className="mb-3">
            <Form.Label className="fw-bold small">Label <span className="text-danger">*</span></Form.Label>
            <Form.Control
              value={label} maxLength={60} placeholder="e.g. Glock 19"
              onChange={(e) => handleLabelChange(e.target.value)}
            />
            <Form.Text className="text-muted">Shown in dropdowns and printouts.</Form.Text>
            {labelError && <div className="text-danger small mt-1">{labelError}</div>}
          </Form.Group>
          <Form.Group className="mb-1">
            <Form.Label className="fw-bold small">Code <span className="text-danger">*</span></Form.Label>
            <Form.Control
              value={code} maxLength={40} placeholder="e.g. GLOCK_19" style={{ fontFamily: 'monospace' }}
              onChange={(e) => handleCodeChange(e.target.value)}
            />
            <Form.Text className="text-muted">
              Permanent once created - existing guns point at it. Uppercase letters, numbers and underscores.
            </Form.Text>
            {codeError && <div className="text-danger small mt-1">{codeError}</div>}
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={onHide} disabled={isPending}>Cancel</Button>
          <Button type="submit" style={{ background: '#1B3A6B', borderColor: '#1B3A6B' }} disabled={isPending}>
            {isPending ? <><Spinner as="span" size="sm" animation="border" className="me-1" /> Saving...</> : 'Add Type'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
