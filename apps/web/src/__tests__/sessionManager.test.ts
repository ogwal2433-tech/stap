import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  sessionManager,
  millisecondsSinceLastActivity,
  clearActivityRecord,
} from '../lib/sessionManager';

const ACCESS_MS     = 15 * 60 * 1000;
const INACTIVITY_MS = 30 * 60 * 1000;

function arm(overrides: Partial<Parameters<typeof sessionManager.init>[0]> = {}) {
  const options = {
    tokenExpiresInMs: ACCESS_MS,
    inactivityMs:     INACTIVITY_MS,
    onLogout:  vi.fn(),
    onRefresh: vi.fn().mockResolvedValue(true),
    onWarning: vi.fn(),
    ...overrides,
  };

  sessionManager.init(options);

  // Returned from `options`, not from the defaults above — otherwise an
  // overridden callback is handed to init while the test asserts on the unused
  // default and every assertion silently passes against the wrong spy.
  return options;
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
});

afterEach(() => {
  sessionManager.destroy();
  vi.useRealTimers();
});

describe('silent token refresh', () => {
  it('renews a minute before the token expires, without logging out', async () => {
    const { onRefresh, onLogout } = arm();

    // One second before the renewal is due.
    await vi.advanceTimersByTimeAsync(ACCESS_MS - 60_000 - 1_000);
    expect(onRefresh).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1_000);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onLogout).not.toHaveBeenCalled();
  });

  it('ends the session when the refresh cannot be done', async () => {
    const { onRefresh, onLogout } = arm({ onRefresh: vi.fn().mockResolvedValue(false) });

    await vi.advanceTimersByTimeAsync(ACCESS_MS);
    expect(onRefresh).toHaveBeenCalled();
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('ends the session when the refresh throws rather than resolving', async () => {
    const { onLogout } = arm({ onRefresh: vi.fn().mockRejectedValue(new Error('network')) });

    await vi.advanceTimersByTimeAsync(ACCESS_MS);
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('keeps renewing for as long as the session lasts', async () => {
    const onRefresh = vi.fn().mockImplementation(async () => {
      // What AuthContext does after a successful renewal.
      sessionManager.scheduleRefresh(ACCESS_MS);
      return true;
    });
    const { onLogout } = arm({ onRefresh });

    // Four token lifetimes with no user input at all would trip the inactivity
    // clock, so activity is reported along the way.
    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(ACCESS_MS - 60_000);
      window.dispatchEvent(new Event('keydown'));
    }

    expect(onRefresh).toHaveBeenCalledTimes(4);
    expect(onLogout).not.toHaveBeenCalled();
  });

  it('never schedules a renewal in the past for a very short token', async () => {
    const { onRefresh } = arm({ tokenExpiresInMs: 1_000 });

    // Clamped to the 5s floor rather than firing immediately in a tight loop.
    await vi.advanceTimersByTimeAsync(4_000);
    expect(onRefresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_100);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});

describe('inactivity', () => {
  it('signs out after the full idle window', async () => {
    const { onLogout } = arm();

    await vi.advanceTimersByTimeAsync(INACTIVITY_MS - 1_000);
    expect(onLogout).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1_000);
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('warns two minutes ahead of the sign-out', async () => {
    const { onWarning, onLogout } = arm();

    await vi.advanceTimersByTimeAsync(INACTIVITY_MS - 2 * 60 * 1000);
    expect(onWarning).toHaveBeenCalledTimes(1);
    expect(onLogout).not.toHaveBeenCalled();
  });

  it.each(['mousedown', 'keydown', 'scroll', 'touchstart', 'click', 'wheel'])(
    'a %s resets the idle clock',
    async (eventName) => {
      const { onLogout } = arm();

      await vi.advanceTimersByTimeAsync(INACTIVITY_MS - 5_000);
      window.dispatchEvent(new Event(eventName));

      // Past the original deadline — the reset must have moved it.
      await vi.advanceTimersByTimeAsync(10_000);
      expect(onLogout).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(INACTIVITY_MS);
      expect(onLogout).toHaveBeenCalledTimes(1);
    },
  );

  it('re-arms the warning after activity, so it is not shown only once', async () => {
    const { onWarning } = arm();

    await vi.advanceTimersByTimeAsync(INACTIVITY_MS - 2 * 60 * 1000);
    expect(onWarning).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new Event('keydown'));
    await vi.advanceTimersByTimeAsync(INACTIVITY_MS - 2 * 60 * 1000);
    expect(onWarning).toHaveBeenCalledTimes(2);
  });

  it('throttles bursts of mousemove instead of handling every one', async () => {
    arm();
    const armedAt = localStorage.getItem('security360:lastActivity');
    expect(armedAt).toBeTruthy();

    // Inside the throttle window, a burst is ignored entirely — the recorded
    // timestamp does not budge.
    for (let i = 0; i < 500; i++) window.dispatchEvent(new Event('mousemove'));
    expect(localStorage.getItem('security360:lastActivity')).toBe(armedAt);

    // Past it, one move is enough to register.
    await vi.advanceTimersByTimeAsync(300);
    window.dispatchEvent(new Event('mousemove'));
    expect(Number(localStorage.getItem('security360:lastActivity'))).toBeGreaterThan(Number(armedAt));
  });
});

describe('activity shared between tabs', () => {
  it('another tab reporting input keeps this one alive', async () => {
    const { onLogout } = arm();

    await vi.advanceTimersByTimeAsync(INACTIVITY_MS - 5_000);

    // What a second tab's write looks like here.
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'security360:lastActivity', newValue: String(Date.now()) }),
    );

    await vi.advanceTimersByTimeAsync(10_000);
    expect(onLogout).not.toHaveBeenCalled();
  });

  it('ignores an unrelated key', async () => {
    const { onLogout } = arm();
    await vi.advanceTimersByTimeAsync(INACTIVITY_MS - 5_000);

    window.dispatchEvent(
      new StorageEvent('storage', { key: 'something:else', newValue: String(Date.now()) }),
    );

    await vi.advanceTimersByTimeAsync(6_000);
    expect(onLogout).toHaveBeenCalledTimes(1);
  });
});

describe('teardown', () => {
  it('stops every timer, so a signed-out session cannot fire later', async () => {
    const { onLogout, onRefresh } = arm();
    sessionManager.destroy();

    await vi.advanceTimersByTimeAsync(INACTIVITY_MS * 3);
    expect(onLogout).not.toHaveBeenCalled();
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('re-arming does not leave the previous session’s timers running', async () => {
    const first = arm();
    const second = arm();

    await vi.advanceTimersByTimeAsync(INACTIVITY_MS);

    // The first session's callbacks are detached; only the live one fires.
    expect(first.onLogout).not.toHaveBeenCalled();
    expect(second.onLogout).toHaveBeenCalledTimes(1);
  });

  it('reports whether it is running', () => {
    expect(sessionManager.isRunning).toBe(false);
    arm();
    expect(sessionManager.isRunning).toBe(true);
    sessionManager.destroy();
    expect(sessionManager.isRunning).toBe(false);
  });
});

describe('idle time across a closed tab', () => {
  it('is null when nothing was ever recorded', () => {
    expect(millisecondsSinceLastActivity()).toBeNull();
  });

  it('measures how long ago the last input was', () => {
    localStorage.setItem('security360:lastActivity', String(Date.now() - 90_000));
    const idle = millisecondsSinceLastActivity();
    expect(idle).toBeGreaterThanOrEqual(90_000);
    expect(idle).toBeLessThan(95_000);
  });

  it('treats a timestamp in the future as "just now" rather than very stale', () => {
    // A corrected system clock should not sign someone out.
    localStorage.setItem('security360:lastActivity', String(Date.now() + 60_000));
    expect(millisecondsSinceLastActivity()).toBe(0);
  });

  it('ignores a corrupted value', () => {
    localStorage.setItem('security360:lastActivity', 'not-a-number');
    expect(millisecondsSinceLastActivity()).toBeNull();
  });

  it('clears the record on sign-out', () => {
    localStorage.setItem('security360:lastActivity', String(Date.now()));
    clearActivityRecord();
    expect(millisecondsSinceLastActivity()).toBeNull();
  });
});
