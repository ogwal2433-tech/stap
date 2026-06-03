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
