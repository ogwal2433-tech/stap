import { useState } from 'react';
import {
  Accordion,
  Alert,
  Button,
  Col,
  Form,
  Modal,
  Row,
  Spinner,
} from 'react-bootstrap';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { LetterGenerationSchema } from '@stap/shared';
import { useGenerateLetter } from '../../hooks/useDisciplinary';
import { useToast } from '../../context/ToastContext';
import type { DisciplinaryResponse } from '@stap/shared';
import { z } from 'zod';

const FormSchema = LetterGenerationSchema.omit({ guardId: true });
type FormValues = z.infer<typeof FormSchema>;

const LETTER_GROUPS = {
  'Disciplinary Letters': [
    { value: 'WARNING',          label: 'Warning Letter' },
    { value: 'TERMINATION_NOTICE', label: 'Termination Notice' },
    { value: 'REINSTATEMENT',    label: 'Reinstatement Letter' },
  ],
};

const DISCIPLINARY_TYPES = new Set([
  'WARNING',
  'TERMINATION_NOTICE',
  'REINSTATEMENT',
]);

interface Props {
  guardId: string;
  guardName: string;
  disciplinaryRecords: DisciplinaryResponse[];
  onClose: () => void;
  onSuccess: () => void;
}

export default function LetterGenerationModal({
  guardId,
  guardName,
  disciplinaryRecords,
  onClose,
  onSuccess,
}: Props) {
  const { showToast } = useToast();
  const generateLetter = useGenerateLetter();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      directorName: 'The Director',
      letterType: 'WARNING',
    },
  });

  const letterType = watch('letterType');
  const directorName = watch('directorName');
  const disciplinaryRecordId = watch('disciplinaryRecordId');
  const isDisciplinaryLetter = DISCIPLINARY_TYPES.has(letterType ?? '');

  const selectedRecord = disciplinaryRecords.find((r) => r.id === disciplinaryRecordId);

  const onSubmit = async (values: FormValues) => {
    try {
      const result = await generateLetter.mutateAsync({ guardId, data: values });

      showToast('Letter generated successfully', 'success');

      // Attempt to open in new tab
      window.open(result.filePath, '_blank', 'noopener,noreferrer');

      onSuccess();
      onClose();
    } catch {
      showToast('Failed to generate letter', 'danger');
    }
  };

  const today = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <Modal show onHide={onClose} size="lg">
      <Modal.Header closeButton>
        <Modal.Title>Generate Letter — {guardName}</Modal.Title>
      </Modal.Header>
      <Form onSubmit={handleSubmit(onSubmit)}>
        <Modal.Body>
          <Row className="g-3">
            <Col md={12}>
              <Form.Group>
                <Form.Label>Letter Type <span className="text-danger">*</span></Form.Label>
                <Form.Select {...register('letterType')} isInvalid={!!errors.letterType}>
                  {Object.entries(LETTER_GROUPS).map(([group, options]) => (
                    <optgroup key={group} label={group}>
                      {options.map(({ value, label }) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </optgroup>
                  ))}
                </Form.Select>
                <Form.Control.Feedback type="invalid">{errors.letterType?.message}</Form.Control.Feedback>
              </Form.Group>
            </Col>

            {isDisciplinaryLetter && disciplinaryRecords.length > 0 && (
              <Col md={12}>
                <Form.Group>
                  <Form.Label>Link to Disciplinary Record <span className="text-muted small">(optional)</span></Form.Label>
                  <Form.Select {...register('disciplinaryRecordId')}>
                    <option value="">None</option>
                    {disciplinaryRecords.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.type.replace(/_/g, ' ')} —{' '}
                        {new Date(r.incidentDate).toLocaleDateString()} —{' '}
                        {r.reason.substring(0, 40)}{r.reason.length > 40 ? '…' : ''}
                      </option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Col>
            )}

            <Col md={6}>
              <Form.Group>
                <Form.Label>Director Name</Form.Label>
                <Form.Control
                  {...register('directorName')}
                  isInvalid={!!errors.directorName}
                  placeholder="The Director"
                />
                <Form.Control.Feedback type="invalid">{errors.directorName?.message}</Form.Control.Feedback>
              </Form.Group>
            </Col>

            <Col md={12}>
              <Form.Group>
                <Form.Label>Custom Notes <span className="text-muted small">(optional)</span></Form.Label>
                <Form.Control
                  as="textarea"
                  rows={2}
                  placeholder="Additional content to include in the letter body…"
                  {...register('customFields.notes')}
                />
              </Form.Group>
            </Col>

            <Col md={12}>
              <Accordion>
                <Accordion.Item eventKey="preview">
                  <Accordion.Header>Letter Preview</Accordion.Header>
                  <Accordion.Body className="small text-muted">
                    <p className="mb-1">
                      This letter will be a{' '}
                      <strong>{letterType?.replace(/_/g, ' ')}</strong> addressed to{' '}
                      <strong>{guardName}</strong>, issued on <strong>{today}</strong>, signed
                      by <strong>{directorName || 'The Director'}</strong>.
                    </p>
                    {selectedRecord && (
                      <p className="mb-0">
                        Referencing incident on{' '}
                        <strong>
                          {new Date(selectedRecord.incidentDate).toLocaleDateString()}
                        </strong>
                        .
                      </p>
                    )}
                  </Accordion.Body>
                </Accordion.Item>
              </Accordion>
            </Col>
          </Row>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            style={{ backgroundColor: '#1B3A6B', borderColor: '#1B3A6B' }}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" />
                Generating…
              </>
            ) : (
              <>
                <i className="bi bi-file-earmark-pdf me-1" />
                Generate & Download
              </>
            )}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
