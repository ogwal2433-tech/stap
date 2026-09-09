/**
 * Keeps a signed-in browser signed in while it is being used, and signs it out
 * once it is not.
 *
 * Two separate clocks, easily confused:
 *
 *  - The access token expires every few minutes. That is a property of the
 *    token, not of the person, so it is renewed quietly in the background and
 *    nobody should ever see it happen. Before this existed the only thing that
 *    renewed a token was a request failing with 401 — so the first action after
 *    fifteen minutes always paid for a retry, and anything that fired several
 *    requests at once paid several times.
 *
 *  - The inactivity clock is about the person. It resets on any real input and
 *    only fires when the browser has genuinely been left alone, which is the
 *    point: sitting on a page reading it is not idleness, and reading a long
 *    report should not cost you your session.
 */

const DEFAULT_INACTIVITY_MS = 30 * 60 * 1000;

/** Renew this far ahead of expiry, so a slow network still beats the deadline. */
const REFRESH_LEAD_MS = 60 * 1000;

/** Never schedule a renewal tighter than this, however short the token is. */
const MIN_REFRESH_DELAY_MS = 5_000;

/** How long before the logout the warning appears. */
const WARNING_LEAD_MS = 2 * 60 * 1000;

/**
 * mousemove fires continuously, so activity is sampled rather than handled.
 * A quarter-second is far below human reaction time and turns thousands of
 * events into a handful of timer resets.
 */
const ACTIVITY_THROTTLE_MS = 250;

const ACTIVITY_EVENTS = [
  'mousedown', 'mousemove', 'keydown', 'scroll',
  'touchstart', 'click', 'wheel', 'focus',
] as const;

/**
 * Activity is shared between tabs through this key. Typing in one tab counts as
 * activity in all of them — otherwise a background tab signs the whole session
 * out from under the tab actually being worked in.
 */
const ACTIVITY_KEY = 'stap:lastActivity';

interface SessionOptions {
  /** Called when the session should end. Must be idempotent. */
  onLogout: () => void;
  /** Renews the access token. Resolves false when the session cannot continue. */
  onRefresh: () => Promise<boolean>;
  /** Lifetime of the access token just issued, in milliseconds. */
  tokenExpiresInMs: number;
  inactivityMs?: number;
  /** Fired once, two minutes before the logout. */
  onWarning?: () => void;
}

/**
 * How long ago the last input was seen, across tabs and across restarts, or
 * null when nothing has been recorded.
 *
 * A closed tab runs no timers, so without this a session could be left idle
 * overnight and reopened straight back into itself — the inactivity limit would
 * only ever apply to a tab that happened to stay open.
 */
export function millisecondsSinceLastActivity(): number | null {
  try {
    const raw = localStorage.getItem(ACTIVITY_KEY);
    if (!raw) return null;
    const at = Number(raw);
    if (!Number.isFinite(at) || at <= 0) return null;
    // A clock change can put the stored time in the future; treat that as now
    // rather than as a very stale session.
    return Math.max(0, Date.now() - at);
  } catch {
    return null;
  }
}

/** Called on sign-out so the next visitor to this browser starts clean. */
export function clearActivityRecord(): void {
  try {
    localStorage.removeItem(ACTIVITY_KEY);
  } catch {
    // Nothing to clear.
  }
}

class SessionManager {
  private refreshTimer:    ReturnType<typeof setTimeout> | null = null;
  private inactivityTimer: ReturnType<typeof setTimeout> | null = null;
  private warningTimer:    ReturnType<typeof setTimeout> | null = null;

  private onLogout:  (() => void)             | null = null;
  private onRefresh: (() => Promise<boolean>) | null = null;
  private onWarning: (() => void)             | null = null;

  private inactivityMs = DEFAULT_INACTIVITY_MS;
  private lastActivityAt = 0;
  private started = false;

  /**
   * Held as a field, not rebuilt per call. removeEventListener compares by
   * identity, so a fresh arrow function detaches nothing and every login would
   * leave another set of listeners running against a dead session.
   */
  private readonly handleActivity = (): void => {
    const now = Date.now();
    if (now - this.lastActivityAt < ACTIVITY_THROTTLE_MS) return;
    this.recordActivity(now);
    this.resetInactivity();
  };

  private recordActivity(at: number): void {
    this.lastActivityAt = at;
    try {
      localStorage.setItem(ACTIVITY_KEY, String(at));
    } catch {
      // Private mode, or storage disabled. Per-tab timers still work.
    }
  }

  /** Another tab reporting input. Extends this tab's clock without echoing back. */
  private readonly handleStorage = (event: StorageEvent): void => {
    if (event.key !== ACTIVITY_KEY || !event.newValue) return;
    const at = Number(event.newValue);
    if (!Number.isFinite(at) || at <= this.lastActivityAt) return;
    this.lastActivityAt = at;
    this.resetInactivity();
  };

  init(options: SessionOptions): void {
    // Re-arming without tearing down first is how duplicate timers appear.
    this.destroy();

    this.onLogout     = options.onLogout;
    this.onRefresh    = options.onRefresh;
    this.onWarning    = options.onWarning ?? null;
    this.inactivityMs = options.inactivityMs ?? DEFAULT_INACTIVITY_MS;
    // Signing in is itself activity, and it has to be written down: without
    // this, logging in and closing the tab straight away leaves no record, and
    // the idle check on the next visit has nothing to measure against.
    this.recordActivity(Date.now());

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, this.handleActivity, { passive: true });
    }
    window.addEventListener('storage', this.handleStorage);

    this.scheduleRefresh(options.tokenExpiresInMs);
    this.resetInactivity();
    this.started = true;
  }

  get isRunning(): boolean {
    return this.started;
  }

  /**
   * Arms the next silent renewal. Called again after each successful refresh
   * with the new token's lifetime, which is what keeps the chain going.
   */
  scheduleRefresh(expiresInMs: number): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);

    const delay = Math.max(expiresInMs - REFRESH_LEAD_MS, MIN_REFRESH_DELAY_MS);

    this.refreshTimer = setTimeout(async () => {
      let ok = false;
      try {
        ok = (await this.onRefresh?.()) ?? false;
      } catch {
        ok = false;
      }

      // A failure here means the refresh token is gone or revoked; there is no
      // way back to a working session, so end it rather than retry in a loop.
      if (!ok) this.endSession();
    }, delay);
  }

  private resetInactivity(): void {
    if (this.inactivityTimer) clearTimeout(this.inactivityTimer);
    if (this.warningTimer)    clearTimeout(this.warningTimer);

    this.inactivityTimer = setTimeout(() => this.endSession(), this.inactivityMs);

    const warnAfter = this.inactivityMs - WARNING_LEAD_MS;
    if (warnAfter > 0 && this.onWarning) {
      this.warningTimer = setTimeout(() => this.onWarning?.(), warnAfter);
    }
  }

  private endSession(): void {
    const logout = this.onLogout;
    this.destroy();
    logout?.();
  }

  /** Stops every timer and listener. Safe to call when nothing is running. */
  destroy(): void {
    if (this.refreshTimer)    clearTimeout(this.refreshTimer);
    if (this.inactivityTimer) clearTimeout(this.inactivityTimer);
    if (this.warningTimer)    clearTimeout(this.warningTimer);
    this.refreshTimer = this.inactivityTimer = this.warningTimer = null;

    for (const event of ACTIVITY_EVENTS) {
      window.removeEventListener(event, this.handleActivity);
    }
    window.removeEventListener('storage', this.handleStorage);

    this.onLogout = this.onRefresh = null;
    this.onWarning = null;
    this.started = false;
  }
}

export const sessionManager = new SessionManager();
