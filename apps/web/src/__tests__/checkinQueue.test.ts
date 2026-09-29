import { describe, it, expect, beforeEach } from 'vitest';
import { loadQueue } from '../pages/attendance/CheckinPage';

/**
 * Check-ins made offline wait in localStorage until the device reconnects.
 * The key was renamed with the rebrand, so a phone that was offline across the
 * upgrade still holds its queue under the old key. Those check-ins must be
 * carried over, not stranded where nothing reads them.
 */

const entry = (siteId: string) => ({ data: { siteId } as never, timestamp: '2026-09-29T08:00:00.000Z' });

beforeEach(() => localStorage.clear());

describe('offline check-in queue', () => {
  it('carries check-ins queued under the old key into the new one', () => {
    localStorage.setItem('stap_checkin_queue', JSON.stringify([entry('site-a')]));
    localStorage.setItem('security360_checkin_queue', JSON.stringify([entry('site-b')]));

    expect(loadQueue().map((q) => (q.data as { siteId: string }).siteId)).toEqual(['site-b', 'site-a']);
    expect(localStorage.getItem('stap_checkin_queue')).toBeNull();
    // Carried once: a second read does not duplicate them.
    expect(loadQueue()).toHaveLength(2);
  });

  it('reads the new key when there is nothing to carry over', () => {
    localStorage.setItem('security360_checkin_queue', JSON.stringify([entry('site-b')]));
    expect(loadQueue()).toHaveLength(1);
  });

  it('is empty rather than throwing on an unreadable queue', () => {
    localStorage.setItem('stap_checkin_queue', 'not json');
    expect(loadQueue()).toEqual([]);
  });
});
