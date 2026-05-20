import { useEffect, useState } from 'react';
import { Button, Form, Modal, Spinner } from 'react-bootstrap';
import { useToast } from '../../context/ToastContext';
import { useCreateRank, useAllGuardRanks } from '../../hooks/useSettings';

interface Props {
  show: boolean;
  onHide: () => void;
}

export default function AddRankModal({ show, onHide }: Props) {
  const { showToast } = useToast();
  const { data: allRanks = [] } = useAllGuardRanks();
  const { mutate: createRank, isPending } = useCreateRank();

  const [name, setName] = useState('');
  const [displayOrder, setDisplayOrder] = useState(1);
  const [nameError, setNameError] = useState('');

  useEffect(() => {
    if (show) {
      setName('');
      setNameError('');
      const maxOrder = allRanks.reduce((m, r) => Math.max(m, r.displayOrder), 0);
      setDisplayOrder(maxOrder + 1);
    }
  }, [show, allRanks]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setNameError('');
    createRank(
      { name: name.trim(), displayOrder },
      {
        onSuccess: () => {
          showToast('Rank added successfully', 'success');
          onHide();
        },
        onError: (err: any) => {
          const msg: string = err?.response?.data?.error ?? err.message ?? 'Failed to add rank';
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
          <Modal.Title className="fs-6">Add New Rank</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group className="mb-3">
            <Form.Label>Rank Name <span className="text-danger">*</span></Form.Label>
            <Form.Control
              value={name}
              onChange={(e) => { setName(e.target.value); setNameError(''); }}
              placeholder="e.g. Lance Corporal"
              isInvalid={!!nameError}
              required
            />
            <Form.Control.Feedback type="invalid">{nameError}</Form.Control.Feedback>
          </Form.Group>
          <Form.Group>
            <Form.Label>Display Order</Form.Label>
            <Form.Control
              type="number"
              min={1}
              value={displayOrder}
              onChange={(e) => setDisplayOrder(Number(e.target.value))}
            />
            <Form.Text className="text-muted">
              Determines position in the dropdown. Lower = shown first.
            </Form.Text>
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" size="sm" onClick={onHide} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" type="submit" disabled={isPending || !name.trim()}>
            {isPending ? <Spinner size="sm" /> : 'Add Rank'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
