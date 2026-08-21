export function computeDisplayDuration(
  startDate: string | Date,
  endDate:   string | Date,
): string {
  const start = new Date(startDate);
  const end   = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) return 'Invalid range';

  const totalMonths =
    (end.getFullYear() - start.getFullYear()) * 12
    + (end.getMonth() - start.getMonth());

  const years  = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;

  const parts: string[] = [];
  if (years  > 0) parts.push(`${years} year${years !== 1 ? 's' : ''}`);
  if (months > 0) parts.push(`${months} month${months !== 1 ? 's' : ''}`);
  return parts.length > 0 ? parts.join(' and ') : 'Less than 1 month';
}

export function daysUntilExpiry(endDate: string | Date): number {
  return Math.ceil(
    (new Date(endDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24),
  );
}

/**
 * "3 hours ago", "yesterday", "12 Mar 2026" — coarse near the present and
 * absolute once past a week, which is how people read a last-login column.
 */
export function formatRelativeDate(value: string | Date | null | undefined): string {
  if (!value) return 'Never';
  const date = new Date(value);
  if (isNaN(date.getTime())) return '—';

  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 0)     return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  if (seconds < 60)    return 'Just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60)    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24)      return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  const days = Math.floor(hours / 24);
  if (days === 1)      return 'Yesterday';
  if (days < 7)        return `${days} days ago`;

  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Full date and time, for audit trails where the exact moment matters. */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}
