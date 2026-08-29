import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Col, Form, Row, Spinner } from 'react-bootstrap';
import { useQuery } from '@tanstack/react-query';
import api, { getApiErrorMessage } from '../../lib/api';
import { useToast } from '../../context/ToastContext';

const NAVY = '#1B3A6B';

interface Setting {
  key: string; label: string; description: string; inputType: string;
  isRequired: boolean; isEncrypted: boolean;
  value: string | null; hasValue: boolean;
  source: 'database' | 'environment' | 'unset';
}
interface Group {
  group: string; label: string; description: string; icon: string; settings: Setting[];
}

const SOURCE = {
  database:    { text: 'Saved in the database', colour: '#1E8449' },
  environment: { text: 'From .env — save to move it into the database', colour: '#E8701A' },
  unset:       { text: 'Not configured', colour: '#adb5bd' },
} as const;

function GroupCard({ group, onSaved }: { group: Group; onSaved: () => void }) {
  const { showToast } = useToast();
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  // Secrets come back as null and are never pre-filled — an empty field means
  // "leave the stored value alone", which is what the API does with it.
  useEffect(() => {
    const initial: Record<string, string> = {};
    for (const s of group.settings) if (!s.isEncrypted && s.value !== null) initial[s.key] = s.value;
    setValues(initial);
  }, [group]);

  const complete = group.settings.every((s) => !s.isRequired || s.hasValue);

  async function save() {
    setSaving(true); setResult(null);
    try {
      const settings = Object.entries(values)
        .filter(([, v]) => v !== '' && v !== undefined)
        .map(([key, value]) => ({ key, value }));
      const { data } = await api.post(`/settings/integrations/${group.group}`, { settings });
      showToast(data.message ?? 'Settings saved', 'success');
      onSaved();
    } catch (err) {
      showToast(getApiErrorMessage(err), 'danger');
    } finally { setSaving(false); }
  }

  async function test() {
    setTesting(true); setResult(null);
    try {
      const { data } = await api.post(`/settings/integrations/${group.group}/test`);
      setResult(data.data);
    } catch (err) {
      setResult({ success: false, message: getApiErrorMessage(err) });
    } finally { setTesting(false); }
  }

  return (
    <div style={{ border: '1px solid #e9ecef', borderRadius: '0.75rem', marginBottom: 24, overflow: 'hidden' }}>
      <div style={{ background: NAVY, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: '1.5rem' }}>{group.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: 'white', fontWeight: 700 }}>{group.label}</div>
          <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: '0.78rem' }}>{group.description}</div>
        </div>
        <Badge bg={complete ? 'success' : 'warning'} text={complete ? undefined : 'dark'}>
          {complete ? 'Configured' : 'Incomplete'}
        </Badge>
      </div>

      <div style={{ padding: 20 }}>
        <Row className="g-3">
          {group.settings.map((s) => (
            <Col md={s.inputType === 'toggle' ? 12 : 6} key={s.key}>
              <Form.Group>
                <Form.Label className="fw-bold small mb-1">
                  {s.label}
                  {s.isRequired && <span className="text-danger ms-1">*</span>}
                  {s.isEncrypted && (
                    <Badge bg="secondary" className="ms-2" style={{ fontSize: '0.6rem' }}>🔒 encrypted</Badge>
                  )}
                </Form.Label>

                {s.inputType === 'toggle' ? (
                  <div className="d-flex align-items-center gap-2">
                    <Form.Check
                      type="switch"
                      checked={values[s.key] === 'true'}
                      onChange={(e) => setValues((p) => ({ ...p, [s.key]: String(e.target.checked) }))}
                    />
                    <span className="small text-muted">
                      {values[s.key] === 'true' ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                ) : (
                  <Form.Control
                    type={s.inputType === 'password' ? 'password' : s.inputType === 'number' ? 'number' : 'text'}
                    value={values[s.key] ?? ''}
                    onChange={(e) => setValues((p) => ({ ...p, [s.key]: e.target.value }))}
                    placeholder={s.isEncrypted && s.hasValue ? '•••••••• — leave blank to keep the stored value' : ''}
                    autoComplete="off"
                  />
                )}

                <Form.Text className="text-muted d-block" style={{ fontSize: '0.72rem' }}>
                  {s.description}
                </Form.Text>
                <div style={{ fontSize: '0.68rem', color: SOURCE[s.source].colour, marginTop: 2 }}>
                  ● {SOURCE[s.source].text}
                </div>
              </Form.Group>
            </Col>
          ))}
        </Row>

        {result && (
          <Alert variant={result.success ? 'success' : 'danger'} className="mt-3 mb-0 py-2 small">
            {result.success ? '✅' : '❌'} {result.message}
          </Alert>
        )}

        <div className="d-flex gap-2 mt-4">
          <Button style={{ background: NAVY, borderColor: NAVY }} size="sm" disabled={saving} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
          <Button variant="outline-secondary" size="sm" disabled={testing} onClick={() => void test()}>
            {testing ? 'Testing…' : '🔌 Test connection'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function IntegrationsPage() {
  const { data: groups = [], isLoading, refetch } = useQuery<Group[]>({
    queryKey: ['settings-integrations'],
    queryFn:  () => api.get<{ data: Group[] }>('/settings/integrations').then((r) => r.data.data),
  });

  if (isLoading) return <div className="text-center py-5"><Spinner animation="border" /></div>;

  return (
    <div className="p-3">
      <div className="mb-3">
        <h5 className="fw-bold mb-0" style={{ color: NAVY }}>🔌 Integrations</h5>
        <div className="text-muted small">
          Mail and payment credentials. Changes take effect on the next send or payment — no restart.
        </div>
      </div>

      <Alert variant="light" className="border small py-2">
        Secrets are encrypted before they are stored and are never sent back to this page. A password
        field left blank keeps the value already saved.
      </Alert>

      {groups.map((g) => <GroupCard key={g.group} group={g} onSaved={() => void refetch()} />)}
    </div>
  );
}
