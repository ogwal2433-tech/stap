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

/**
 * One refresh at a time.
 *
 * A dashboard opens with several requests in flight, so an expired token
 * produces several simultaneous 401s. Refreshing per response meant each one
 * started its own refresh, and because the server rotates the refresh token,
 * the first to land invalidated the cookie the others were still using — the
 * losers got "token has been revoked" and the user was bounced to the login
 * screen mid-session. Now the first 401 refreshes and the rest wait for it.
 */
let refreshInFlight: Promise<string> | null = null;

/** Set by AuthContext so a dead session tears down its timers and React state. */
let onSessionLost: (() => void) | null = null;

export function setSessionLostHandler(handler: (() => void) | null): void {
  onSessionLost = handler;
}

function refreshAccessToken(): Promise<string> {
  // A bare axios call, not `api` — going back through this instance would send
  // the dead Bearer token and recurse through this same interceptor.
  refreshInFlight ??= axios
    .post<{ data: { accessToken: string } }>('/api/v1/auth/refresh', {}, { withCredentials: true })
    .then((res) => {
      const token = res.data.data.accessToken;
      setAccessToken(token);
      return token;
    })
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };
    const url = originalRequest?.url ?? '';

    // Skip refresh loop for auth endpoints themselves
    const isAuthEndpoint = url.includes('/auth/refresh') || url.includes('/auth/login');

    if (error.response?.status === 401 && !originalRequest?._retry && !isAuthEndpoint) {
      originalRequest._retry = true;

      try {
        const newToken = await refreshAccessToken();

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
        }
        return api(originalRequest);
      } catch {
        setAccessToken(null);
        // Preferred over assigning window.location: it lets AuthContext clear
        // its timers and state, and keeps the SPA from doing a full reload.
        if (onSessionLost) {
          onSessionLost();
        } else {
          window.location.href = '/login';
        }
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
