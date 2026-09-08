import { Button, Form } from 'react-bootstrap';
import { generatePassword } from '@stap/shared';
import { copyText } from '../../lib/clipboard';
import { useToast } from '../../context/ToastContext';

interface TemporaryPasswordFieldProps {
  value:    string;
  onChange: (next: string) => void;
  label?:   string;
  /** Shown under the field; omitted, no hint is rendered. */
  hint?:    React.ReactNode;
  size?:    'sm' | 'lg';
}

/**
 * The temporary password handed to someone who is about to sign in for the
 * first time — staff, a guard, or a client contact.
 *
 * Shared by all three so a password generated in one place is the same shape as
 * one generated in another, and so "copy" behaves the same everywhere: the
 * person doing the inviting is usually reading it out or pasting it into a
 * message while the form is still open.
 */
export default function TemporaryPasswordField({
  value,
  onChange,
  label = 'Temporary Password',
  hint,
  size = 'sm',
}: TemporaryPasswordFieldProps) {
  const { showToast } = useToast();

  const copy = async () => {
    const ok = await copyText(value);
    showToast(
      ok ? 'Password copied.' : 'Could not copy — select the password and copy it manually.',
      ok ? 'success' : 'warning',
    );
  };

  return (
    <Form.Group className="mb-3">
      <Form.Label className="fw-bold small">{label}</Form.Label>
      <div className="d-flex gap-2">
        <Form.Control
          size={size}
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{ fontFamily: 'monospace' }}
        />
        <Button
          variant="outline-secondary"
          size={size}
          type="button"
          title="Generate a different password"
          onClick={() => onChange(generatePassword())}
        >
          🔄
        </Button>
        <Button
          variant="outline-secondary"
          size={size}
          type="button"
          title="Copy to clipboard"
          onClick={copy}
        >
          📋
        </Button>
      </div>
      {hint && <Form.Text className="text-muted">{hint}</Form.Text>}
    </Form.Group>
  );
}
