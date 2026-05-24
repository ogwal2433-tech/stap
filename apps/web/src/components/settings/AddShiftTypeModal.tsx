import { useState, useEffect } from 'react';
import { Alert, Button, Form, Modal, Spinner } from 'react-bootstrap';
import { useCreateShiftType } from '../../hooks/useSettings';
import { useToast } from '../../context/ToastContext';

interface Props {
  show: boolean;
  nextOrder: number;
  onClose: () => void;
}

export default function AddShiftTypeModal({ show, nextOrder, onClose }: Props) {
  const { showToast } = useToast();
  const create = useCreateShiftType();

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [durationHours, setDurationHours] = useState('');
  const [displayOrder, setDisplayOrder] = useState(String(nextOrder));
  const [isOvertime, setIsOvertime] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (show) {
      setName(''); setCode(''); setStartTime(''); setEndTime('');
      setDurationHours(''); setDisplayOrder(String(nextOrder));
      setIsOvertime(false); setError('');
    }
  }, [show, nextOrder]);

  function suggestCode(n: string) {
    return n.toUpperCase().replace(/[^A-Z0-9]/g, '_').replace(/__+/g, '_').slice(0, 20);
  }

  async function handleSubmit() {
    setError('');
    try {
      await create.mutateAsync({
        name,
        code: code || suggestCode(name),
        startTime: startTime || null,
        endTime:   endTime || null,
        durationHours: durationHours ? parseFloat(durationHours) : null,
        displayOrder: parseInt(displayOrder, 10) || nextOrder,
        isOvertime,
      });
      showToast('Shift type added', 'success');
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add shift type');
    }
  }

  return (
    <Modal show={show} onHide={onClose}>
      <Modal.Header closeButton>
        <Modal.Title className="fs-6">Add Shift Type</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && <Alert variant="danger" className="small py-2">{error}</Alert>}
        <Form.Group className="mb-3">
          <Form.Label className="small fw-semibold">Shift Name <span className="text-danger">*</span></Form.Label>
          <Form.Control
            value={name}
            onChange={(e) => { setName(e.target.value); if (!code) setCode(suggestCode(e.target.value)); }}
            placeholder="e.g. Morning Shift"
          />
        </Form.Group>
        <Form.Group className="mb-3">
          <Form.Label className="small fw-semibold">Code <span className="text-danger">*</span></Form.Label>
          <Form.Control
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
            placeholder="e.g. MORNING"
          />
          <Form.Text className="text-muted">Uppercase letters, numbers and underscores only.</Form.Text>
        </Form.Group>
        <div className="row g-3 mb-3">
          <div className="col-6">
            <Form.Label className="small">Start Time</Form.Label>
            <Form.Control type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            <Form.Text className="text-muted">Auto-fills start time on roster</Form.Text>
          </div>
          <div className="col-6">
            <Form.Label className="small">End Time</Form.Label>
            <Form.Control type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
        </div>
        <Form.Group className="mb-3">
          <Form.Label className="small">Duration (hours)</Form.Label>
          <Form.Control
            type="number"
            min={0}
            step={0.5}
            value={durationHours}
            onChange={(e) => setDurationHours(e.target.value)}
            placeholder="e.g. 12"
          />
        </Form.Group>
        <Form.Group className="mb-3">
          <Form.Label className="small">Display Order</Form.Label>
          <Form.Control
            type="number"
            min={0}
            value={displayOrder}
            onChange={(e) => setDisplayOrder(e.target.value)}
          />
        </Form.Group>
        <Form.Check
          type="switch"
          id="is-overtime"
          label="This is an overtime shift"
          checked={isOvertime}
          onChange={(e) => setIsOvertime(e.target.checked)}
        />
        {isOvertime && (
          <Alert variant="info" className="small py-2 mt-2">
            This shift records extra hours per guard.
          </Alert>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
        <Button
          variant="primary"
          size="sm"
          disabled={create.isPending || !name || !code}
          onClick={handleSubmit}
        >
          {create.isPending ? <Spinner size="sm" className="me-1" /> : null}
          Add Shift Type
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
