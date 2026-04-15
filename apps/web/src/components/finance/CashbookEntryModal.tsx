import { Modal, Form, Button, Row, Col } from 'react-bootstrap';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CashbookEntrySchema } from '@stap/shared';
import type { CashbookEntryInput } from '@stap/shared';
import { useAddCashbookEntry } from '../../hooks/useFinance';
import { useToast } from '../../context/ToastContext';

interface Props { onClose: () => void }

const CATEGORIES = ['STATIONERY', 'TRANSPORT', 'WELFARE', 'MAINTENANCE', 'OTHER'];

export default function CashbookEntryModal({ onClose }: Props) {
  const { showToast } = useToast();
  const addEntry = useAddCashbookEntry();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CashbookEntryInput>({
    resolver: zodResolver(CashbookEntrySchema),
    defaultValues: { type: 'OUT', category: 'OTHER' },
  });

  const type = watch('type');

  const onSubmit = async (values: CashbookEntryInput) => {
    try {
      await addEntry.mutateAsync({
        ...values,
        date: new Date(values.date).toISOString(),
      });
      showToast('Entry recorded', 'success');
      onClose();
    } catch {
      showToast('Failed to record entry', 'danger');
    }
  };

  return (
    <Modal show onHide={onClose}>
      <Modal.Header closeButton>
        <Modal.Title>Add Cashbook Entry</Modal.Title>
      </Modal.Header>
      <Form onSubmit={handleSubmit(onSubmit)}>
        <Modal.Body>
          <Row className="g-3">
            <Col md={6}>
              <Form.Group>
                <Form.Label>Date <span className="text-danger">*</span></Form.Label>
                <Form.Control type="date" {...register('date')} isInvalid={!!errors.date} />
                <Form.Control.Feedback type="invalid">{errors.date?.message}</Form.Control.Feedback>
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group>
                <Form.Label>Type <span className="text-danger">*</span></Form.Label>
                <div className="d-flex gap-3 mt-1">
                  {(['IN', 'OUT'] as const).map((t) => (
                    <Form.Check
                      key={t}
                      type="radio"
                      id={`type-${t}`}
                      label={t === 'IN' ? 'Income (IN)' : 'Expense (OUT)'}
                      value={t}
                      {...register('type')}
                      className={type === t ? (t === 'IN' ? 'text-success fw-bold' : 'text-danger fw-bold') : ''}
                    />
                  ))}
                </div>
              </Form.Group>
            </Col>
            <Col md={12}>
              <Form.Group>
                <Form.Label>Description <span className="text-danger">*</span></Form.Label>
                <Form.Control {...register('description')} isInvalid={!!errors.description} />
                <Form.Control.Feedback type="invalid">{errors.description?.message}</Form.Control.Feedback>
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group>
                <Form.Label>Category</Form.Label>
                <Form.Select {...register('category')}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </Form.Select>
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group>
                <Form.Label>Amount (UGX) <span className="text-danger">*</span></Form.Label>
                <Form.Control
                  type="number" min={1}
                  {...register('amount', { valueAsNumber: true })}
                  isInvalid={!!errors.amount}
                />
                <Form.Control.Feedback type="invalid">{errors.amount?.message}</Form.Control.Feedback>
              </Form.Group>
            </Col>
          </Row>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button
            type="submit"
            variant={type === 'IN' ? 'success' : 'danger'}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Saving…' : `Record ${type === 'IN' ? 'Income' : 'Expense'}`}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
