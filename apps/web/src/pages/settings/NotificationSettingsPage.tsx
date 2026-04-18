import { useState, useEffect } from 'react';
import { Accordion, Alert, Badge, Button, Container, Form, Spinner, Table } from 'react-bootstrap';
import { notificationsApi } from '../../lib/notifications.api';
import { useToast } from '../../context/ToastContext';
import { ROLES } from '@stap/shared';

const ALL_ROLES = Object.values(ROLES);

const NOTIFICATION_TYPES = [
  'ATTENDANCE_ALERT',
  'PAYMENT_RECEIVED',
  'COMPLAINT_ASSIGNED',
  'APPROVAL_REQUIRED',
  'CONTRACT_EXPIRING',
  'INCIDENT_REPORTED',
  'PAYROLL_APPROVED',
  'INVOICE_OVERDUE',
  'SYSTEM',
];

const DIRECTOR_LOCKED_TYPES = ['ATTENDANCE_ALERT', 'INCIDENT_REPORTED', 'PAYROLL_APPROVED', 'INVOICE_OVERDUE'];

type ChannelPrefs = { inApp: boolean; email: boolean; sms: boolean };
type RolePrefs    = Record<string, ChannelPrefs>;

const DEFAULT_PREFS = (): RolePrefs =>
  Object.fromEntries(
    NOTIFICATION_TYPES.map(t => [t, { inApp: true, email: false, sms: false }]),
  );

export default function NotificationSettingsPage() {
  const { showToast } = useToast();
  const [saving, setSaving] = useState<string | null>(null);
  const [prefsMap, setPrefsMap] = useState<Record<string, RolePrefs>>({});

  async function loadRole(role: string) {
    if (prefsMap[role]) return;
    try {
      const data = await notificationsApi.getPreferences(role);
      setPrefsMap(prev => ({ ...prev, [role]: data?.preferences ?? DEFAULT_PREFS() }));
    } catch {
      setPrefsMap(prev => ({ ...prev, [role]: DEFAULT_PREFS() }));
    }
  }

  function toggle(role: string, type: string, channel: keyof ChannelPrefs) {
    if (role === ROLES.DIRECTOR && DIRECTOR_LOCKED_TYPES.includes(type)) return;
    setPrefsMap(prev => ({
      ...prev,
      [role]: {
        ...prev[role],
        [type]: { ...prev[role][type], [channel]: !prev[role][type][channel] },
      },
    }));
  }

  async function save(role: string) {
    setSaving(role);
    try {
      await notificationsApi.savePreferences(role, prefsMap[role]);
      showToast('Preferences saved', 'success');
    } catch {
      showToast('Failed to save', 'danger');
    } finally {
      setSaving(null);
    }
  }

  return (
    <Container className="py-4" style={{ maxWidth: 900 }}>
      <h4 className="fw-bold mb-1" style={{ color: '#1B3A6B' }}>Notification Preferences</h4>
      <p className="text-muted small mb-4">Configure which notifications each role receives and through which channels.</p>

      <Alert variant="info" className="small py-2 mb-4">
        🔒 DIRECTOR always receives all critical alerts regardless of preferences (shown as locked toggles).
      </Alert>

      <Accordion onSelect={role => { if (role) loadRole(role as string); }}>
        {ALL_ROLES.filter(r => r !== ROLES.GUARD && r !== ROLES.CLIENT).map(role => (
          <Accordion.Item key={role} eventKey={role}>
            <Accordion.Header>
              <span className="fw-semibold">{role.replace(/_/g, ' ')}</span>
            </Accordion.Header>
            <Accordion.Body>
              {!prefsMap[role] ? (
                <div className="text-center py-3"><Spinner animation="border" size="sm" /></div>
              ) : (
                <>
                  <Table size="sm" bordered responsive className="align-middle small mb-3">
                    <thead className="table-light">
                      <tr>
                        <th style={{ width: '40%' }}>Notification Type</th>
                        <th className="text-center">In-App</th>
                        <th className="text-center">Email</th>
                        <th className="text-center">SMS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {NOTIFICATION_TYPES.map(type => {
                        const locked  = role === ROLES.DIRECTOR && DIRECTOR_LOCKED_TYPES.includes(type);
                        const current = prefsMap[role][type] ?? { inApp: true, email: false, sms: false };
                        return (
                          <tr key={type}>
                            <td>
                              {type.replace(/_/g, ' ')}
                              {locked && <Badge bg="secondary" className="ms-2 small">Locked</Badge>}
                            </td>
                            {(['inApp', 'email', 'sms'] as const).map(ch => (
                              <td key={ch} className="text-center">
                                <Form.Check
                                  type="switch"
                                  checked={locked ? true : current[ch]}
                                  disabled={locked}
                                  onChange={() => toggle(role, type, ch)}
                                />
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </Table>
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={saving === role}
                    onClick={() => save(role)}
                  >
                    {saving === role ? <Spinner size="sm" animation="border" /> : 'Save Preferences'}
                  </Button>
                </>
              )}
            </Accordion.Body>
          </Accordion.Item>
        ))}
      </Accordion>
    </Container>
  );
}
