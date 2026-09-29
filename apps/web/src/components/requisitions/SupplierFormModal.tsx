import { Modal, Form, Button, Row, Col } from 'react-bootstrap';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CreateSupplierSchema } from '@security360/shared';
import type { CreateSupplierInput } from '@security360/shared';
import { useCreateSupplier } from '../../hooks/useRequisitions';
import { useToast } from '../../context/ToastContext';

interface Props { onClose: () => void }

const ITEM_CATEGORIES = ['UNIFORM', 'EQUIPMENT', 'STATIONERY', 'VEHICLE_MAINTENANCE', 'OTHER'];

export default function SupplierFormModal({ onClose }: Props) {
  const { showToast } = useToast();
  const createSupplier = useCreateSupplier();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CreateSupplierInput>({
    resolver: zodResolver(CreateSupplierSchema),
    defaultValues: { itemCategories: [] },
  });

  const onSubmit = async (values: CreateSupplierInput) => {
    try {
      await createSupplier.mutateAsync(values);
      showToast('Supplier added', 'success');
      onClose();
    } catch {
      showToast('Failed to add supplier', 'danger');
    }
  };

  return (
    <Modal show onHide={onClose} size="lg">
      <Modal.Header closeButton>
        <Modal.Title>Add Supplier</Modal.Title>
      </Modal.Header>
      <Form onSubmit={handleSubmit(onSubmit)}>
        <Modal.Body>
          <Row className="g-3">
            <Col md={12}>
              <Form.Group>
                <Form.Label>Supplier Name <span className="text-danger">*</span></Form.Label>
                <Form.Control {...register('name')} isInvalid={!!errors.name} />
                <Form.Control.Feedback type="invalid">{errors.name?.message}</Form.Control.Feedback>
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group>
                <Form.Label>Contact Person</Form.Label>
                <Form.Control {...register('contactPerson')} />
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group>
                <Form.Label>Phone</Form.Label>
                <Form.Control type="tel" {...register('phone')} isInvalid={!!errors.phone} />
                <Form.Control.Feedback type="invalid">{errors.phone?.message}</Form.Control.Feedback>
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group>
                <Form.Label>Email</Form.Label>
                <Form.Control type="email" {...register('email')} isInvalid={!!errors.email} />
                <Form.Control.Feedback type="invalid">{errors.email?.message}</Form.Control.Feedback>
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group>
                <Form.Label>Payment Terms</Form.Label>
                <Form.Control placeholder="e.g. Net 30 days" {...register('paymentTerms')} />
              </Form.Group>
            </Col>
            <Col md={12}>
              <Form.Group>
                <Form.Label>Address</Form.Label>
                <Form.Control as="textarea" rows={2} {...register('address')} />
              </Form.Group>
            </Col>
            <Col md={12}>
              <Form.Label>Item Categories</Form.Label>
              <div className="d-flex flex-wrap gap-2">
                <Controller
                  control={control}
                  name="itemCategories"
                  render={({ field }) => (
                    <>
                      {ITEM_CATEGORIES.map((cat) => (
                        <Form.Check
                          key={cat}
                          type="checkbox"
                          id={`cat-${cat}`}
                          label={cat}
                          checked={(field.value ?? []).includes(cat)}
                          onChange={(e) => {
                            const current = field.value ?? [];
                            field.onChange(
                              e.target.checked
                                ? [...current, cat]
                                : current.filter((c) => c !== cat),
                            );
                          }}
                        />
                      ))}
                    </>
                  )}
                />
              </div>
            </Col>
          </Row>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" style={{ background: '#1B3A6B', borderColor: '#1B3A6B' }} disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Add Supplier'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
