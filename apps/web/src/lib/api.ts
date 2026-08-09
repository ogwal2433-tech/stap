import axios from 'axios';
import type { AxiosRequestConfig } from 'axios';

// ── In-memory token store (never localStorage — XSS protection) ───────────────
let _accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  _accessToken = token;
}

export function getAccessToken(): string | null {
  return _accessToken;
}

// ── Axios instance ─────────────────────────────────────────────────────────────
const api = axios.create({
  baseURL: '/api/v1',
  withCredentials: true, // needed to send the httpOnly refresh cookie
  headers: { 'Content-Type': 'application/json' },
});

// ── Request interceptor — attach Bearer token ─────────────────────────────────
api.interceptors.request.use((config) => {
  if (_accessToken) {
    config.headers.Authorization = `Bearer ${_accessToken}`;
  }
  return config;
});

// ── Response interceptor — silent refresh on 401 ─────────────────────────────
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };
    const url = originalRequest?.url ?? '';

    // Skip refresh loop for auth endpoints themselves
    const isAuthEndpoint = url.includes('/auth/refresh') || url.includes('/auth/login');

    if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
      originalRequest._retry = true;

      try {
        // Call refresh directly (withCredentials sends the httpOnly cookie)
        const refreshRes = await axios.post(
          '/api/v1/auth/refresh',
          {},
          { withCredentials: true },
        );
        const newToken: string = refreshRes.data.data.accessToken;
        setAccessToken(newToken);

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
        }
        return api(originalRequest);
      } catch {
        setAccessToken(null);
        window.location.href = '/login';
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  },
);

// ── Error message extraction ───────────────────────────────────────────────────

/** Human labels for the field names Zod reports, so toasts don't say "clientId". */
const FIELD_LABELS: Record<string, string> = {
  name:        'Full name',
  email:       'Email',
  password:    'Password',
  newPassword: 'New password',
  role:        'Role',
  clientId:    'Client company',
  status:      'Status',
};

/**
 * Pulls a readable message out of an API error.
 *
 * A 400 from `validate()` carries `error: 'Validation failed'` plus the real
 * reasons in `details.fieldErrors` — surfacing only `error` tells the user
 * nothing about what to change, so field errors are flattened into the message.
 */
export function getApiErrorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const data = (err as { response?: { data?: unknown } })?.response?.data as
    | { error?: string; message?: string; details?: { formErrors?: string[]; fieldErrors?: Record<string, string[]> } }
    | undefined;

  const details = data?.details;
  if (details) {
    const messages = [
      ...(details.formErrors ?? []),
      ...Object.entries(details.fieldErrors ?? {}).flatMap(([field, errors]) =>
        (errors ?? []).map(msg => `${FIELD_LABELS[field] ?? field}: ${msg}`),
      ),
    ];
    if (messages.length) return messages.join(' • ');
  }

  return data?.error || data?.message || (err as Error)?.message || fallback;
}

export default api;
