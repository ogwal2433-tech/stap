import { useEffect, useState } from 'react';
import { Alert, Button, Form, Modal, Spinner } from 'react-bootstrap';
import { useToast } from '../../context/ToastContext';
import { useUpdateRank } from '../../hooks/useSettings';
import type { GuardRankResponse } from '@stap/shared';

interface Props {
  show: boolean;
  onHide: () => void;
  rank: GuardRankResponse | null;
}

export default function EditRankModal({ show, onHide, rank }: Props) {
  const { showToast } = useToast();
  const { mutate: updateRank, isPending } = useUpdateRank();

  const [name, setName] = useState('');
  const [defaultSalary, setDefaultSalary] = useState('');
  const [displayOrder, setDisplayOrder] = useState(0);
  const [nameError, setNameError] = useState('');

  useEffect(() => {
    if (rank && show) {
      setName(rank.name);
      setDefaultSalary(rank.defaultSalary != null ? String(rank.defaultSalary) : '');
      setDisplayOrder(rank.displayOrder);
      setNameError('');
    }
  }, [rank, show]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!rank) return;
    setNameError('');
    const salary = parseInt(defaultSalary.replace(/,/g, ''), 10);
    updateRank(
      { id: rank.id, data: { name: name.trim(), defaultSalary: defaultSalary ? salary : null, displayOrder } },
      {
        onSuccess: () => {
          showToast('Rank updated successfully', 'success');
          onHide();
        },
        onError: (err: any) => {
          const msg: string = err?.response?.data?.error ?? err.message ?? 'Failed to update rank';
          if (err?.response?.status === 409) {
            setNameError('A rank with this name already exists.');
          } else {
            showToast(msg, 'danger');
          }
        },
      },
    );
  }

  return (
    <Modal show={show} onHide={onHide} size="sm" centered>
      <Form onSubmit={handleSubmit}>
        <Modal.Header closeButton>
          <Modal.Title className="fs-6">Edit Rank</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Alert variant="info" className="py-2 px-3 small">
            Changing the name updates how it appears in the dropdown. Existing guard records will
            still show the old name — consider adding a new rank instead.
          </Alert>
          <Form.Group className="mb-3">
            <Form.Label>Rank Name <span className="text-danger">*</span></Form.Label>
            <Form.Control
              value={name}
              onChange={(e) => { setName(e.target.value); setNameError(''); }}
              isInvalid={!!nameError}
              required
            />
            <Form.Control.Feedback type="invalid">{nameError}</Form.Control.Feedback>
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>Default Salary (UGX)</Form.Label>
            <Form.Control
              type="text"
              inputMode="numeric"
              value={defaultSalary}
              onChange={(e) => setDefaultSalary(e.target.value.replace(/[^\d]/g, ''))}
              placeholder="e.g. 450000"
            />
            <Form.Text className="text-muted">
              Auto-filled in the guard form when this rank is selected.
            </Form.Text>
          </Form.Group>
          <Form.Group>
            <Form.Label>Display Order</Form.Label>
            <Form.Control
              type="number"
              min={0}
              value={displayOrder}
              onChange={(e) => setDisplayOrder(Number(e.target.value))}
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" size="sm" onClick={onHide} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" type="submit" disabled={isPending || !name.trim()}>
            {isPending ? <Spinner size="sm" /> : 'Save Changes'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
