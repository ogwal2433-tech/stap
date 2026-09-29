import { useEffect, useState } from 'react';
import { Alert, Button, Form, InputGroup, Modal, Spinner } from 'react-bootstrap';
import { useToast } from '../../context/ToastContext';
import { useUpdateDeductionType } from '../../hooks/useSettings';
import type { DeductionTypeResponse } from '@security360/shared';

interface Props {
  show: boolean;
  onHide: () => void;
  type: DeductionTypeResponse | null;
}

export default function EditDeductionTypeModal({ show, onHide, type }: Props) {
  const { showToast } = useToast();
  const { mutate: updateType, isPending } = useUpdateDeductionType();

  const [name, setName] = useState('');
  const [defaultAmount, setDefaultAmount] = useState('');
  const [description, setDescription] = useState('');
  const [displayOrder, setDisplayOrder] = useState(0);
  const [nameError, setNameError] = useState('');

  useEffect(() => {
    if (type && show) {
      setName(type.name);
      setDefaultAmount(type.defaultAmount != null ? String(type.defaultAmount) : '');
      setDescription(type.description ?? '');
      setDisplayOrder(type.displayOrder);
      setNameError('');
    }
  }, [type, show]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!type) return;
    setNameError('');
    updateType(
      {
        id:   type.id,
        data: {
          name:          name.trim(),
          defaultAmount: defaultAmount ? Number(defaultAmount) : null,
          description:   description.trim() || undefined,
          displayOrder,
        },
      },
      {
        onSuccess: () => {
          showToast('Deduction type updated', 'success');
          onHide();
        },
        onError: (err: any) => {
          const msg: string = err?.response?.data?.error ?? err.message ?? 'Failed to update deduction type';
          if (err?.response?.status === 409) {
            setNameError('A deduction type with this name already exists.');
          } else {
            showToast(msg, 'danger');
          }
        },
      },
    );
  };

  return (
    <Modal show={show} onHide={onHide} size="lg" centered>
      <Form onSubmit={handleSubmit}>
        <Modal.Header closeButton>
          <Modal.Title className="fs-6">Edit Deduction Type</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group className="mb-3">
            <Form.Label>Code (cannot be changed)</Form.Label>
            <Form.Control value={type?.code ?? ''} disabled className="font-monospace" />
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>Name <span className="text-danger">*</span></Form.Label>
            <Form.Control
              value={name}
              onChange={(e) => { setName(e.target.value); setNameError(''); }}
              isInvalid={!!nameError}
              required
            />
            <Form.Control.Feedback type="invalid">{nameError}</Form.Control.Feedback>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>Default Amount</Form.Label>
            <InputGroup>
              <InputGroup.Text>UGX</InputGroup.Text>
              <Form.Control
                type="number"
                min={1}
                value={defaultAmount}
                onChange={(e) => setDefaultAmount(e.target.value)}
                placeholder="Leave blank if amount varies"
              />
            </InputGroup>
            <Form.Text className="text-muted">
              Clear to remove the default amount. Existing deduction records are not affected.
            </Form.Text>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>Description</Form.Label>
            <Form.Control
              as="textarea"
              rows={2}
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>Display Order</Form.Label>
            <Form.Control
              type="number"
              min={0}
              value={displayOrder}
              onChange={(e) => setDisplayOrder(Number(e.target.value))}
            />
          </Form.Group>

          <Alert variant="info" className="py-2 px-3 small mb-0">
            Changing the name or default amount will take effect immediately in the deduction form.
            Existing deduction records are not affected.
          </Alert>
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
