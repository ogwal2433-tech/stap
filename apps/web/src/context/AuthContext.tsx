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
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();

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
      } catch {
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
    <AuthContext.Provider value={{ ...state, login, logout, refreshToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
