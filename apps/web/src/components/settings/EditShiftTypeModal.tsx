import { useState, useEffect } from 'react';
import { Alert, Badge, Button, Form, Modal, Spinner } from 'react-bootstrap';
import { useUpdateShiftType } from '../../hooks/useSettings';
import { useToast } from '../../context/ToastContext';
import type { ShiftTypeResponse } from '@stap/shared';

interface Props {
  shift: ShiftTypeResponse | null;
  onClose: () => void;
}

export default function EditShiftTypeModal({ shift, onClose }: Props) {
  const { showToast } = useToast();
  const update = useUpdateShiftType();

  const [name, setName] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [durationHours, setDurationHours] = useState('');
  const [displayOrder, setDisplayOrder] = useState('');
  const [isOvertime, setIsOvertime] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (shift) {
      setName(shift.name);
      setStartTime(shift.startTime ?? '');
      setEndTime(shift.endTime ?? '');
      setDurationHours(shift.durationHours != null ? String(shift.durationHours) : '');
      setDisplayOrder(String(shift.displayOrder));
      setIsOvertime(shift.isOvertime);
      setError('');
    }
  }, [shift]);

  async function handleSubmit() {
    if (!shift) return;
    setError('');
    try {
      await update.mutateAsync({
        id: shift.id,
        data: {
          name,
          startTime: startTime || null,
          endTime:   endTime || null,
          durationHours: durationHours ? parseFloat(durationHours) : null,
          displayOrder: parseInt(displayOrder, 10),
          isOvertime,
        },
      });
      showToast('Shift type updated', 'success');
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update shift type');
    }
  }

  return (
    <Modal show={!!shift} onHide={onClose}>
      <Modal.Header closeButton>
        <Modal.Title className="fs-6">Edit Shift Type</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && <Alert variant="danger" className="small py-2">{error}</Alert>}
        <Form.Group className="mb-2">
          <Form.Label className="small text-muted">Code (read-only)</Form.Label>
          <div className="d-flex align-items-center gap-2">
            <Badge bg="light" text="dark" className="font-monospace fs-6">{shift?.code}</Badge>
          </div>
        </Form.Group>
        <Form.Group className="mb-3">
          <Form.Label className="small fw-semibold">Shift Name <span className="text-danger">*</span></Form.Label>
          <Form.Control value={name} onChange={(e) => setName(e.target.value)} />
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
          id="is-overtime-edit"
          label="This is an overtime shift"
          checked={isOvertime}
          onChange={(e) => setIsOvertime(e.target.checked)}
        />
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
        <Button
          variant="primary"
          size="sm"
          disabled={update.isPending || !name}
          onClick={handleSubmit}
        >
          {update.isPending ? <Spinner size="sm" className="me-1" /> : null}
          Save Changes
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
