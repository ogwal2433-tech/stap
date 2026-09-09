/**
 * Leave, for guards and for office staff alike.
 *
 * A request belongs to exactly one of the two. Which one is not stored as a
 * separate field — it is read from whichever subject the row carries, so the
 * label can never disagree with the record.
 */

export const LEAVE_TYPES = [
  { value: 'ANNUAL',        label: 'Annual Leave',        colour: '#1B3A6B' },
  { value: 'SICK',          label: 'Sick Leave',          colour: '#E8701A' },
  { value: 'EMERGENCY',     label: 'Emergency Leave',     colour: '#C0392B' },
  { value: 'COMPASSIONATE', label: 'Compassionate Leave', colour: '#6c757d' },
  { value: 'MATERNITY',     label: 'Maternity Leave',     colour: '#0F7B6C' },
  { value: 'PATERNITY',     label: 'Paternity Leave',     colour: '#0F7B6C' },
  { value: 'STUDY',         label: 'Study Leave',         colour: '#1E8449' },
  { value: 'UNPAID',        label: 'Unpaid Leave',        colour: '#856404' },
] as const;

/**
 * EMERGENCY is kept rather than replaced by COMPASSIONATE: it is one of the
 * three types the leave balance already reports, and dropping it would orphan
 * every request recorded under it.
 */
export const LEAVE_TYPE_VALUES = [
  'ANNUAL', 'SICK', 'EMERGENCY', 'COMPASSIONATE',
  'MATERNITY', 'PATERNITY', 'STUDY', 'UNPAID',
] as const;
export type LeaveType = (typeof LEAVE_TYPE_VALUES)[number];

export const leaveTypeLabel = (value: string): string =>
  LEAVE_TYPES.find((t) => t.value === value)?.label ?? value;

export const LEAVE_STATUSES = [
  { value: 'PENDING',   label: 'Pending',   colour: '#856404', bg: '#FEF9E7' },
  { value: 'APPROVED',  label: 'Approved',  colour: '#1E8449', bg: '#E8F8F5' },
  { value: 'REJECTED',  label: 'Rejected',  colour: '#C0392B', bg: '#FDEDEC' },
  { value: 'CANCELLED', label: 'Cancelled', colour: '#6c757d', bg: '#F2F4F7' },
] as const;

/** Who a request is for. Derived from the record, not stored alongside it. */
export const LEAVE_APPLICANT_TYPES = [
  { value: 'GUARD', label: 'Security Guard', description: 'Field security guard' },
  { value: 'STAFF', label: 'Office Staff',   description: 'Supervisor, controller, administrator or other office staff' },
] as const;

export const LEAVE_APPLICANT_TYPE_VALUES = ['GUARD', 'STAFF'] as const;
export type LeaveApplicantType = (typeof LEAVE_APPLICANT_TYPE_VALUES)[number];

export const GUARD_APPLICANT = 'GUARD';
export const STAFF_APPLICANT = 'STAFF';

export const leaveApplicantLabel = (value: string): string =>
  LEAVE_APPLICANT_TYPES.find((t) => t.value === value)?.label ?? value;
