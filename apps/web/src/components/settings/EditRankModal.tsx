import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Form, Modal, Spinner } from 'react-bootstrap';
import { useToast } from '../../context/ToastContext';
import { useUpdateRank, useBulkUpdateRankSalary } from '../../hooks/useSettings';
import type { GuardRankResponse } from '@security360/shared';

interface Props {
  show: boolean;
  onHide: () => void;
  rank: GuardRankResponse | null;
}

export default function EditRankModal({ show, onHide, rank }: Props) {
  const { showToast } = useToast();
  const { mutateAsync: updateRank, isPending: isSaving } = useUpdateRank();
  const { mutateAsync: bulkUpdateSalary, isPending: isBulking } = useBulkUpdateRankSalary();

  const [name, setName] = useState('');
  const [defaultSalary, setDefaultSalary] = useState('');
  const [displayOrder, setDisplayOrder] = useState(0);
  const [nameError, setNameError] = useState('');

  // original salary captured when modal opens — used for filtering guards with old default
  const originalSalaryRef = useRef<number | null>(null);

  useEffect(() => {
    if (rank && show) {
      setName(rank.name);
      setDefaultSalary(rank.defaultSalary != null ? String(rank.defaultSalary) : '');
      setDisplayOrder(rank.displayOrder);
      setNameError('');
      originalSalaryRef.current = rank.defaultSalary ?? null;
    }
  }, [rank, show]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!rank) return;
    setNameError('');

    const salary = defaultSalary ? parseInt(defaultSalary.replace(/,/g, ''), 10) : null;
    const updatePayload = { name: name.trim(), defaultSalary: salary, displayOrder };

    const originalSalary = originalSalaryRef.current;
    const salaryChanged = salary !== originalSalary;
    const newSalaryIsSet = salary !== null && salary > 0;

    try {
      if (salaryChanged && newSalaryIsSet) {
        const confirmed = window.confirm(
          `The default salary for ${name.trim()} has changed to UGX ${salary.toLocaleString()}.\n\n` +
          `Do you want to update the salary for all existing ACTIVE guards currently on this rank ` +
          `whose salary has not been manually customised?\n\n` +
          `Click OK to update existing guards.\n` +
          `Click Cancel to apply to new assignments only.`,
        );

        await updateRank({ id: rank.id, data: updatePayload });

        if (confirmed) {
          const result = await bulkUpdateSalary({
            id:             rank.id,
            newSalary:      salary,
            previousSalary: originalSalary ?? undefined,
          });
          showToast(
            `Rank updated. ${result.updatedCount} guard(s) salary updated to UGX ${salary.toLocaleString()}.`,
            'success',
          );
        } else {
          showToast(
            'Rank salary updated. Existing guard salaries unchanged — applies to new assignments only.',
            'success',
          );
        }
      } else {
        await updateRank({ id: rank.id, data: updatePayload });
        showToast('Rank updated successfully', 'success');
      }
      onHide();
    } catch (err: any) {
      const msg: string = err?.response?.data?.error ?? err.message ?? 'Failed to update rank';
      if (err?.response?.status === 409) {
        setNameError('A rank with this name already exists.');
      } else {
        showToast(msg, 'danger');
      }
    }
  }

  const isPending = isSaving || isBulking;

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
              Auto-filled in the guard form when this rank is selected. Changing this will prompt
              you to update existing guards on this rank.
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
