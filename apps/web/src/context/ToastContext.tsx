import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import { Toast, ToastContainer } from 'react-bootstrap';

type ToastVariant = 'success' | 'danger' | 'warning' | 'info';

interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
  duration: number;
}

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant, duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_ICON: Record<ToastVariant, string> = {
  success: '✅',
  danger: '❌',
  warning: '⚠️',
  info: 'ℹ️',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback(
    (message: string, variant: ToastVariant = 'success', duration = 4000) => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { id, message, variant, duration }]);
    },
    [],
  );

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <ToastContainer position="top-end" className="p-3" style={{ zIndex: 9999 }}>
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            bg={toast.variant}
            autohide
            delay={toast.duration}
            onClose={() => dismiss(toast.id)}
            className={toast.variant === 'warning' ? 'text-dark' : 'text-white'}
          >
            <Toast.Header closeVariant={toast.variant === 'warning' ? undefined : 'white'}>
              <strong className="me-auto">
                {VARIANT_ICON[toast.variant]}&nbsp;
                {toast.variant === 'success' && 'Success'}
                {toast.variant === 'danger' && 'Error'}
                {toast.variant === 'warning' && 'Warning'}
                {toast.variant === 'info' && 'Info'}
              </strong>
            </Toast.Header>
            <Toast.Body>{toast.message}</Toast.Body>
          </Toast>
        ))}
      </ToastContainer>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
