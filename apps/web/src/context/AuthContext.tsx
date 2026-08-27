import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import api, { setAccessToken } from '../lib/api';
import type { AuthState, User } from '../types/auth';

interface AuthContextValue extends AuthState {
  /** Permission keys the signed-in user's role holds, from the database. */
  permissions: string[];
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();

  // Fetched rather than inferred from the role: what a role may do lives in the
  // database and an administrator can change it, so the role name is no longer
  // enough to know.
  const [permissions, setPermissions] = useState<string[]>([]);

  const loadPermissions = useCallback(async () => {
    try {
      const { data } = await api.get<{ data: { permissions: string[] } }>('/permissions/me');
      setPermissions(data.data.permissions ?? []);
    } catch {
      // A failure here must not cost the user their session — it only means the
      // UI falls back to showing nothing permission-gated.
      setPermissions([]);
    }
  }, []);

  const [state, setState] = useState<AuthState>({
    user: null,
    accessToken: null,
    isAuthenticated: false,
    isLoading: true,
  });

  // ── Silent refresh on mount to restore session ───────────────────────────────
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const { data: refreshData } = await api.post<{
          success: boolean;
          data: { accessToken: string };
        }>('/auth/refresh');

        const token = refreshData.data.accessToken;
        setAccessToken(token);

        const { data: meData } = await api.get<{ success: boolean; data: User }>('/auth/me');

        setState({
          user: meData.data,
          accessToken: token,
          isAuthenticated: true,
          isLoading: false,
        });
        await loadPermissions();
      } catch {
        setPermissions([]);
        setPermissions([]);
      setState({ user: null, accessToken: null, isAuthenticated: false, isLoading: false });
      }
    };

    restoreSession();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api.post<{
      success: boolean;
      data: { accessToken: string; user: User };
    }>('/auth/login', { email, password });

    const { accessToken, user } = data.data;
    setAccessToken(accessToken);

    setState({ user, accessToken, isAuthenticated: true, isLoading: false });
    await loadPermissions();
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setAccessToken(null);
      setState({ user: null, accessToken: null, isAuthenticated: false, isLoading: false });
      navigate('/login');
    }
  }, [navigate]);

  const refreshToken = useCallback(async () => {
    const { data } = await api.post<{ success: boolean; data: { accessToken: string } }>(
      '/auth/refresh',
    );
    const token = data.data.accessToken;
    setAccessToken(token);
    setState((prev) => ({ ...prev, accessToken: token }));
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, permissions, login, logout, refreshToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** True when the user's role holds every listed permission. */
export function useHasPermission(...keys: string[]): boolean {
  const { permissions } = useAuth();
  return keys.every((k) => permissions.includes(k));
}

/** True when the user's role holds at least one of the listed permissions. */
export function useHasAnyPermission(...keys: string[]): boolean {
  const { permissions } = useAuth();
  return keys.some((k) => permissions.includes(k));
}
