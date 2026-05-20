import { useEffect, useState } from 'react';
import { Alert, Button, Form, InputGroup, Modal, Spinner } from 'react-bootstrap';
import { useToast } from '../../context/ToastContext';
import { useCreateDeductionType, useAllDeductionTypes } from '../../hooks/useSettings';

interface Props {
  show: boolean;
  onHide: () => void;
}

function toCode(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

export default function AddDeductionTypeModal({ show, onHide }: Props) {
  const { showToast } = useToast();
  const { mutate: createType, isPending } = useCreateDeductionType();
  const { data: allTypes = [] } = useAllDeductionTypes();

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(false);
  const [defaultAmount, setDefaultAmount] = useState('');
  const [description, setDescription] = useState('');
  const [displayOrder, setDisplayOrder] = useState(0);
  const [nameError, setNameError] = useState('');
  const [codeError, setCodeError] = useState('');

  useEffect(() => {
    if (show) {
      setName('');
      setCode('');
      setCodeManuallyEdited(false);
      setDefaultAmount('');
      setDescription('');
      setDisplayOrder(allTypes.length > 0 ? Math.max(...allTypes.map((t) => t.displayOrder)) + 1 : 1);
      setNameError('');
      setCodeError('');
    }
  }, [show, allTypes]);

  const handleNameChange = (val: string) => {
    setName(val);
    setNameError('');
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
    setNameError('');
    setCodeError('');
    createType(
      {
        name: name.trim(),
        code: code.trim(),
        defaultAmount: defaultAmount ? Number(defaultAmount) : null,
        description: description.trim() || undefined,
        displayOrder,
      },
      {
        onSuccess: () => {
          showToast('Deduction type added', 'success');
          onHide();
        },
        onError: (err: any) => {
          const msg: string = err?.response?.data?.error ?? err.message ?? 'Failed to add deduction type';
          if (err?.response?.status === 409) {
            if (msg.toLowerCase().includes('code')) {
              setCodeError('A deduction type with this code already exists.');
            } else {
              setNameError('A deduction type with this name already exists.');
            }
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
          <Modal.Title className="fs-6">Add Deduction Type</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group className="mb-3">
            <Form.Label>Name <span className="text-danger">*</span></Form.Label>
            <Form.Control
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. Loan Repayment"
              isInvalid={!!nameError}
              required
            />
            <Form.Control.Feedback type="invalid">{nameError}</Form.Control.Feedback>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>Code <span className="text-danger">*</span></Form.Label>
            <Form.Control
              value={code}
              onChange={(e) => handleCodeChange(e.target.value)}
              placeholder="e.g. LOAN_REPAYMENT"
              isInvalid={!!codeError}
              required
            />
            <Form.Control.Feedback type="invalid">{codeError}</Form.Control.Feedback>
            <Form.Text className="text-muted">
              Uppercase letters, numbers, and underscores only. Cannot be changed after creation.
            </Form.Text>
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
              If set, the deduction form will pre-fill this amount when this type is selected.
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
              placeholder="Shown as a hint in the deduction form"
            />
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
          <Button variant="primary" size="sm" type="submit" disabled={isPending || !name.trim() || !code.trim()}>
            {isPending ? <Spinner size="sm" /> : 'Add Type'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
