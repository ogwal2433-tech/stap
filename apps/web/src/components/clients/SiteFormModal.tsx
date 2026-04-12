import { useEffect } from 'react';
import { Modal, Form, Button, Row, Col, Alert } from 'react-bootstrap';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { UpdateSiteSchema } from '@stap/shared';
import { useCreateSite, useUpdateSite } from '../../hooks/useClients';
import { useToast } from '../../context/ToastContext';
import type { SiteResponse } from '@stap/shared';
import { z } from 'zod';

const SiteFormSchema = UpdateSiteSchema.extend({
  siteName: z.string().min(1, 'Site name is required'),
  location: z.string().min(1, 'Location is required'),
  guardsRequired: z.number().int().min(1).default(1),
});

type SiteFormValues = z.infer<typeof SiteFormSchema>;

interface Props {
  clientId: string;
  site?: SiteResponse;
  onClose: () => void;
  onSuccess: () => void;
}

export default function SiteFormModal({ clientId, site, onClose, onSuccess }: Props) {
  const { showToast } = useToast();
  const createSite = useCreateSite();
  const updateSite = useUpdateSite();
  const isEdit = Boolean(site);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SiteFormValues>({
    resolver: zodResolver(SiteFormSchema),
    defaultValues: {
      siteName: site?.siteName ?? '',
      location: site?.location ?? '',
      gpsLat: site?.gpsLat ?? undefined,
      gpsLon: site?.gpsLon ?? undefined,
      siteManagerName: site?.siteManagerName ?? '',
      siteManagerContact: site?.siteManagerContact ?? '',
      guardsRequired: site?.guardsRequired ?? 1,
      specialInstructions: site?.specialInstructions ?? '',
    },
  });

  useEffect(() => {
    if (site) {
      reset({
        siteName: site.siteName,
        location: site.location,
        gpsLat: site.gpsLat ?? undefined,
        gpsLon: site.gpsLon ?? undefined,
        siteManagerName: site.siteManagerName ?? '',
        siteManagerContact: site.siteManagerContact ?? '',
        guardsRequired: site.guardsRequired,
        specialInstructions: site.specialInstructions ?? '',
      });
    }
  }, [site, reset]);

  const onSubmit = async (values: SiteFormValues) => {
    try {
      if (isEdit && site) {
        await updateSite.mutateAsync({ siteId: site.id, clientId, data: values });
        showToast('Site updated', 'success');
      } else {
        await createSite.mutateAsync({ clientId, data: values });
        showToast('Site added', 'success');
      }
      onSuccess();
      onClose();
    } catch {
      showToast('Failed to save site', 'danger');
    }
  };

  return (
    <Modal show onHide={onClose} size="lg">
      <Modal.Header closeButton>
        <Modal.Title>{isEdit ? `Edit Site: ${site!.siteName}` : 'Add Site'}</Modal.Title>
      </Modal.Header>
      <Form onSubmit={handleSubmit(onSubmit)}>
        <Modal.Body>
          <Row className="g-3">
            <Col md={12}>
              <Form.Group>
                <Form.Label>Site Name <span className="text-danger">*</span></Form.Label>
                <Form.Control {...register('siteName')} isInvalid={!!errors.siteName} />
                <Form.Control.Feedback type="invalid">{errors.siteName?.message}</Form.Control.Feedback>
              </Form.Group>
            </Col>

            <Col md={12}>
              <Form.Group>
                <Form.Label>Location / Address <span className="text-danger">*</span></Form.Label>
                <Form.Control as="textarea" rows={2} {...register('location')} isInvalid={!!errors.location} />
                <Form.Control.Feedback type="invalid">{errors.location?.message}</Form.Control.Feedback>
              </Form.Group>
            </Col>

            <Col md={6}>
              <Form.Group>
                <Form.Label>GPS Latitude <span className="text-muted small">(optional)</span></Form.Label>
                <Form.Control
                  type="number"
                  step="any"
                  placeholder="e.g. 0.3163"
                  {...register('gpsLat', { valueAsNumber: true })}
                  isInvalid={!!errors.gpsLat}
                />
                <Form.Control.Feedback type="invalid">{errors.gpsLat?.message}</Form.Control.Feedback>
              </Form.Group>
            </Col>

            <Col md={6}>
              <Form.Group>
                <Form.Label>GPS Longitude <span className="text-muted small">(optional)</span></Form.Label>
                <Form.Control
                  type="number"
                  step="any"
                  placeholder="e.g. 32.5822"
                  {...register('gpsLon', { valueAsNumber: true })}
                  isInvalid={!!errors.gpsLon}
                />
                <Form.Control.Feedback type="invalid">{errors.gpsLon?.message}</Form.Control.Feedback>
              </Form.Group>
            </Col>

            <Col md={12}>
              <Form.Text className="text-muted">
                <i className="bi bi-info-circle me-1" />
                GPS coordinates help supervisors verify check-in location accuracy.
                {/* TODO Sprint 4: add map picker using Google Maps JS API or Leaflet for click-to-set GPS coordinates */}
              </Form.Text>
            </Col>

            <Col md={6}>
              <Form.Group>
                <Form.Label>Site Manager Name <span className="text-muted small">(optional)</span></Form.Label>
                <Form.Control {...register('siteManagerName')} />
              </Form.Group>
            </Col>

            <Col md={6}>
              <Form.Group>
                <Form.Label>Site Manager Contact <span className="text-muted small">(optional)</span></Form.Label>
                <Form.Control type="tel" {...register('siteManagerContact')} isInvalid={!!errors.siteManagerContact} />
                <Form.Control.Feedback type="invalid">{errors.siteManagerContact?.message}</Form.Control.Feedback>
              </Form.Group>
            </Col>

            <Col md={4}>
              <Form.Group>
                <Form.Label>Guards Required</Form.Label>
                <Form.Control
                  type="number"
                  min={1}
                  {...register('guardsRequired', { valueAsNumber: true })}
                  isInvalid={!!errors.guardsRequired}
                />
                <Form.Control.Feedback type="invalid">{errors.guardsRequired?.message}</Form.Control.Feedback>
              </Form.Group>
            </Col>

            <Col md={12}>
              <Form.Group>
                <Form.Label>Special Instructions <span className="text-muted small">(optional)</span></Form.Label>
                <Form.Control
                  as="textarea"
                  rows={3}
                  placeholder="e.g. Report to reception on arrival. Night guards must check perimeter every 2 hours."
                  {...register('specialInstructions')}
                />
              </Form.Group>
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
            {isSubmitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Site'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
