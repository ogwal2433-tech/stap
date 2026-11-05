import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import api, { setAccessToken, setSessionLostHandler } from '../lib/api';
import {
  sessionManager,
  millisecondsSinceLastActivity,
  clearActivityRecord,
} from '../lib/sessionManager';
import { useToast } from './ToastContext';
import type { AuthState, User } from '../types/auth';

/** Falls back to the built-in defaults if /auth/session-config cannot be read. */
const FALLBACK_ACCESS_TOKEN_SECONDS = 15 * 60;
const FALLBACK_INACTIVITY_MINUTES   = 30;

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
  const { showToast } = useToast();

  /**
   * Read once from the server so the timeout can be changed in .env without
   * rebuilding this bundle. Kept in a ref because the timers read it from
   * inside callbacks that must not be rebuilt when it arrives.
   */
  const sessionConfig = useRef({
    accessTokenSeconds: FALLBACK_ACCESS_TOKEN_SECONDS,
    inactivityMinutes:  FALLBACK_INACTIVITY_MINUTES,
  });

  // Fetched rather than inferred from the role: what a role may do lives in the
  // database and an administrator can change it, so the role name is no longer
  // enough to know.
  const [permissions, setPermissions] = useState<string[]>([]);

  const loadPermissions = useCallback(async (keepOnFailure = false) => {
    try {
      const { data } = await api.get<{ data: { permissions: string[] } }>('/permissions/me');
      setPermissions(data.data.permissions ?? []);
    } catch {
      // A failure here must not cost the user their session. At sign-in it
      // means the UI shows nothing permission-gated; on a background refresh it
      // means keep what was already known, so a dropped request when a tab
      // regains focus does not hide every gated page from someone mid-task.
      if (!keepOnFailure) setPermissions([]);
    }
  }, []);

  const [state, setState] = useState<AuthState>({
    user: null,
    accessToken: null,
    isAuthenticated: false,
    isLoading: true,
  });

  /** Clears local session state. Does not call the API — used when it is already gone. */
  const clearSession = useCallback(() => {
    sessionManager.destroy();
    clearActivityRecord();
    setAccessToken(null);
    setPermissions([]);
    setState({ user: null, accessToken: null, isAuthenticated: false, isLoading: false });
  }, []);

  /**
   * Renews the access token and re-arms the next renewal.
   *
   * Returning a boolean rather than throwing is what the session manager needs:
   * it has to tell "renewed" from "this session is over" without unwrapping an
   * axios error.
   */
  const renewAccessToken = useCallback(async (): Promise<boolean> => {
    try {
      const { data } = await api.post<{
        success: boolean;
        data: { accessToken: string; expiresIn?: number };
      }>('/auth/refresh');

      const token = data.data.accessToken;
      setAccessToken(token);
      setState((prev) => (prev.isAuthenticated ? { ...prev, accessToken: token } : prev));

      const seconds = data.data.expiresIn ?? sessionConfig.current.accessTokenSeconds;
      sessionManager.scheduleRefresh(seconds * 1000);
      // Grants can change while someone is signed in. Renewal already talks to
      // the server on a timer, so permissions are re-read here too — otherwise
      // a role granted guards.create only saw it after signing out and back in.
      void loadPermissions(true);
      return true;
    } catch {
      return false;
    }
  }, [loadPermissions]);

  /**
   * Ends the session properly: the server drops the stored refresh token and
   * clears its cookie, then local state goes.
   *
   * The API call matters even when the sign-out was decided in the browser. The
   * refresh cookie outlives the access token, so clearing only local state
   * would leave a session that any reload could walk straight back into — the
   * inactivity timeout would look enforced and be decorative. If the access
   * token has already expired by then, the 401 interceptor refreshes and
   * retries this call on its own.
   */
  const signOut = useCallback(
    async (reason?: 'inactivity') => {
      try {
        await api.post('/auth/logout');
      } catch {
        // Already invalid server-side; local teardown below is what matters.
      } finally {
        clearSession();
        if (reason === 'inactivity') {
          showToast('You were signed out after a period of inactivity.', 'info');
        }
        navigate('/');
      }
    },
    [clearSession, showToast, navigate],
  );

  /**
   * Arms the background renewal and the inactivity clock for a session that is
   * now live. Safe to call again — init() tears down any previous timers first.
   */
  const startSession = useCallback(
    (accessTokenSeconds: number) => {
      sessionManager.init({
        tokenExpiresInMs: accessTokenSeconds * 1000,
        inactivityMs:     sessionConfig.current.inactivityMinutes * 60 * 1000,
        onRefresh:        renewAccessToken,
        onLogout: () => {
          // Reached only from the session manager, so the session ended on a
          // timer rather than by choice — signOut says why, or landing on the
          // login screen looks like the app dropped them for no reason.
          void signOut('inactivity');
        },
        onWarning: () => {
          showToast(
            'You will be signed out in 2 minutes unless you do something. Move the mouse or press a key to stay signed in.',
            'warning',
            10_000,
          );
        },
      });
    },
    [renewAccessToken, signOut, showToast],
  );

  // ── Silent refresh on mount to restore session ───────────────────────────────
  useEffect(() => {
    const restoreSession = async () => {
      // Fetched first and never fatal: without it the built-in defaults apply.
      try {
        const { data } = await api.get<{
          data: { inactivityTimeoutMinutes: number; accessTokenExpiresIn: number };
        }>('/auth/session-config');
        sessionConfig.current = {
          accessTokenSeconds: data.data.accessTokenExpiresIn || FALLBACK_ACCESS_TOKEN_SECONDS,
          inactivityMinutes:  data.data.inactivityTimeoutMinutes || FALLBACK_INACTIVITY_MINUTES,
        };
      } catch {
        // Defaults already in place.
      }

      // The refresh cookie outlives the inactivity window, so a browser left
      // closed overnight would otherwise reopen into a live session. Checked
      // before the cookie is spent, so a stale one is not rotated on the way out.
      const idleFor = millisecondsSinceLastActivity();
      const idleLimitMs = sessionConfig.current.inactivityMinutes * 60 * 1000;
      if (idleFor !== null && idleFor > idleLimitMs) {
        clearActivityRecord();
        setPermissions([]);
        setState({ user: null, accessToken: null, isAuthenticated: false, isLoading: false });
        return;
      }

      try {
        const { data: refreshData } = await api.post<{
          success: boolean;
          data: { accessToken: string; expiresIn?: number };
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

        startSession(refreshData.data.expiresIn ?? sessionConfig.current.accessTokenSeconds);
      } catch {
        // No usable refresh cookie — a first visit or an expired session.
        setPermissions([]);
        setState({ user: null, accessToken: null, isAuthenticated: false, isLoading: false });
      }
    };

    restoreSession();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * A 401 that survived the interceptor's refresh attempt means the refresh
   * token is gone too. Routed through here so the timers stop and React state
   * clears, instead of the hard window.location redirect it used to do.
   */
  useEffect(() => {
    setSessionLostHandler(() => {
      clearSession();
      navigate('/');
    });
    return () => setSessionLostHandler(null);
  }, [clearSession, navigate]);

  /**
   * Re-reads permissions when the tab comes back into view — the usual moment
   * after an administrator has changed a grant in another tab or on another
   * machine. Without it the change waits for the next token renewal.
   */
  useEffect(() => {
    if (!state.isAuthenticated) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void loadPermissions(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [state.isAuthenticated, loadPermissions]);

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api.post<{
      success: boolean;
      data: { accessToken: string; expiresIn?: number; user: User };
    }>('/auth/login', { email, password });

    const { accessToken, user } = data.data;
    setAccessToken(accessToken);

    setState({ user, accessToken, isAuthenticated: true, isLoading: false });
    await loadPermissions();

    startSession(data.data.expiresIn ?? sessionConfig.current.accessTokenSeconds);
  }, [loadPermissions, startSession]);

  const logout = useCallback(() => signOut(), [signOut]);

  const refreshToken = useCallback(async () => {
    await renewAccessToken();
  }, [renewAccessToken]);

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
