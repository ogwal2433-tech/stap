import { useEffect, useState } from 'react';
import { Alert, Button, Form, Modal, Spinner } from 'react-bootstrap';
import { useToast } from '../../context/ToastContext';
import { useCreateStaffPosition, useUpdateStaffPosition } from '../../hooks/useSettings';
import type { StaffPositionResponse } from '@stap/shared';

interface Props {
  show: boolean;
  onHide: () => void;
  /** null adds a position; a position edits it. */
  position: StaffPositionResponse | null;
  /** Departments already in use, offered before typing a new one. */
  departments: string[];
}

/**
 * Adds or edits one staff position. The two cases share every field, so they
 * share a modal rather than drifting apart as two.
 */
export default function StaffPositionModal({ show, onHide, position, departments }: Props) {
  const { showToast } = useToast();
  const create = useCreateStaffPosition();
  const update = useUpdateStaffPosition();
  const isEdit = Boolean(position);
  const isPending = create.isPending || update.isPending;

  const [title, setTitle]             = useState('');
  const [department, setDepartment]   = useState('');
  const [grade, setGrade]             = useState('');
  const [description, setDescription] = useState('');
  const [displayOrder, setDisplayOrder] = useState(0);
  const [newDepartment, setNewDepartment] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!show) return;
    setTitle(position?.title ?? '');
    setDepartment(position?.department ?? '');
    setGrade(position?.grade ?? '');
    setDescription(position?.description ?? '');
    setDisplayOrder(position?.displayOrder ?? 0);
    // A position already in a department nobody else uses still edits normally.
    setNewDepartment(!position && departments.length === 0);
    setError('');
  }, [position, show, departments.length]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const data = {
      title:        title.trim(),
      department:   department.trim(),
      grade:        grade.trim() || null,
      description:  description.trim() || null,
      displayOrder,
    };

    const onError = (err: any) => {
      setError(err?.response?.data?.error ?? err?.message ?? 'Could not save the position.');
    };

    if (isEdit && position) {
      update.mutate({ id: position.id, data }, {
        onSuccess: () => { showToast('Position updated', 'success'); onHide(); },
        onError,
      });
    } else {
      create.mutate(data, {
        onSuccess: () => { showToast('Position added', 'success'); onHide(); },
        onError,
      });
    }
  };

  const canSave = title.trim().length > 0 && department.trim().length > 0 && !isPending;

  return (
    <Modal show={show} onHide={onHide} centered>
      <Form onSubmit={handleSubmit}>
        <Modal.Header closeButton>
          <Modal.Title className="h6 fw-bold">
            {isEdit ? 'Edit Position' : 'Add Position'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {error && <Alert variant="danger" className="small py-2">{error}</Alert>}

          <Form.Group className="mb-3" controlId="position-title">
            <Form.Label className="small fw-semibold">
              Position Title <span className="text-danger">*</span>
            </Form.Label>
            <Form.Control
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Zone 1 Supervisor"
              autoFocus
            />
            {isEdit && (
              <Form.Text className="text-muted">
                Renaming is safe — the {position?.staffCount ?? 0} staff member
                {position?.staffCount === 1 ? '' : 's'} holding this position keep it.
              </Form.Text>
            )}
          </Form.Group>

          <Form.Group className="mb-3" controlId="position-department">
            <Form.Label className="small fw-semibold">
              Department <span className="text-danger">*</span>
            </Form.Label>
            {newDepartment ? (
              <div className="d-flex gap-2">
                <Form.Control
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="New department name"
                />
                {departments.length > 0 && (
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    onClick={() => { setNewDepartment(false); setDepartment(''); }}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            ) : (
              <div className="d-flex gap-2">
                <Form.Select value={department} onChange={(e) => setDepartment(e.target.value)}>
                  <option value="">— Select department —</option>
                  {departments.map((d) => <option key={d} value={d}>{d}</option>)}
                </Form.Select>
                <Button variant="outline-primary" size="sm" onClick={() => { setNewDepartment(true); setDepartment(''); }}>
                  + New
                </Button>
              </div>
            )}
          </Form.Group>

          <Form.Group className="mb-3" controlId="position-grade">
            <Form.Label className="small fw-semibold">
              Grade / Level <span className="text-muted fw-normal">(optional)</span>
            </Form.Label>
            <Form.Control
              type="text"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              placeholder="e.g. Officer, Supervisor, Manager, Head"
            />
          </Form.Group>

          <Form.Group className="mb-3" controlId="position-description">
            <Form.Label className="small fw-semibold">
              Description <span className="text-muted fw-normal">(optional)</span>
            </Form.Label>
            <Form.Control
              as="textarea"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this position does"
            />
          </Form.Group>

          <Form.Group className="mb-0" controlId="position-order">
            <Form.Label className="small fw-semibold">Display Order</Form.Label>
            <Form.Control
              type="number"
              min={0}
              value={displayOrder}
              onChange={(e) => setDisplayOrder(Number(e.target.value) || 0)}
            />
            <Form.Text className="text-muted">
              Lower numbers come first within the department.
            </Form.Text>
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" size="sm" onClick={onHide} disabled={isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm" disabled={!canSave}>
            {isPending
              ? <><Spinner as="span" size="sm" animation="border" className="me-1" />Saving…</>
              : isEdit ? 'Save Changes' : 'Add Position'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
