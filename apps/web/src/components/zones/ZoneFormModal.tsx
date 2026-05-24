import { useEffect, useState } from 'react';
import { Button, Form, Modal, Spinner } from 'react-bootstrap';
import { useUsers } from '../../hooks/useSettings';
import type { CreateZoneInput, ZoneResponse } from '@stap/shared';

interface Props {
  show:     boolean;
  zone?:    ZoneResponse;
  onHide:   () => void;
  onSave:   (data: CreateZoneInput) => Promise<void>;
  isSaving: boolean;
}

export default function ZoneFormModal({ show, zone, onHide, onSave, isSaving }: Props) {
  const isEdit = !!zone;

  const [name,         setName]         = useState('');
  const [description,  setDescription]  = useState('');
  const [supervisorId, setSupervisorId] = useState('');
  const [alternateId,  setAlternateId]  = useState('');
  const [error,        setError]        = useState('');

  const { data: usersData } = useUsers({ status: 'ACTIVE', limit: 200 });
  const users = usersData?.data ?? [];
  const supervisorOptions = users.filter(
    (u) => !['GUARD', 'CLIENT'].includes(u.role),
  );

  useEffect(() => {
    if (show) {
      setName(zone?.name ?? '');
      setDescription(zone?.description ?? '');
      setSupervisorId(zone?.supervisor?.id ?? '');
      setAlternateId(zone?.alternate?.id ?? '');
      setError('');
    }
  }, [show, zone]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!name.trim()) { setError('Zone name is required.'); return; }
    if (supervisorId && alternateId && supervisorId === alternateId) {
      setError('Supervisor and alternate cannot be the same person.');
      return;
    }

    try {
      await onSave({
        name:         name.trim(),
        description:  description.trim() || undefined,
        supervisorId: supervisorId || undefined,
        alternateId:  alternateId  || undefined,
      });
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'An error occurred.');
    }
  }

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title>{isEdit ? 'Edit Zone' : 'New Zone'}</Modal.Title>
      </Modal.Header>
      <Form onSubmit={handleSubmit}>
        <Modal.Body>
          {error && <div className="alert alert-danger small py-2">{error}</div>}

          <Form.Group className="mb-3">
            <Form.Label>Zone Name <span className="text-danger">*</span></Form.Label>
            <Form.Control
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Central Kampala Zone"
              required
            />
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>Description</Form.Label>
            <Form.Control
              as="textarea"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
            />
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>Supervisor</Form.Label>
            <Form.Select value={supervisorId} onChange={(e) => setSupervisorId(e.target.value)}>
              <option value="">-- None --</option>
              {supervisorOptions
                .filter((u) => u.id !== alternateId)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role.replace(/_/g, ' ')})
                  </option>
                ))}
            </Form.Select>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>Alternate Supervisor</Form.Label>
            <Form.Select value={alternateId} onChange={(e) => setAlternateId(e.target.value)}>
              <option value="">-- None --</option>
              {supervisorOptions
                .filter((u) => u.id !== supervisorId)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role.replace(/_/g, ' ')})
                  </option>
                ))}
            </Form.Select>
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onHide} disabled={isSaving}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={isSaving}>
            {isSaving ? <Spinner size="sm" animation="border" /> : (isEdit ? 'Save Changes' : 'Create Zone')}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
