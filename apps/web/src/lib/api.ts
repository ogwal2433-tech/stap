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

export default api;
