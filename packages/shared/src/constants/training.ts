/**
 * Who a training session is for, and who runs it.
 *
 * Sessions began as part of recruiting guards — an applicant is moved to
 * training and linked to a session. Office staff need training too, and the
 * same session cannot serve both: the attendee is a different kind of record,
 * and only guard sessions belong in the recruitment pipeline.
 */

export const TRAINING_TARGET_GROUPS = [
  {
    value:       'GUARDS',
    label:       'Security Guards',
    description: 'Field guards, including applicants in training',
  },
  {
    value:       'STAFF',
    label:       'Office Staff',
    description: 'Supervisors, controllers, administrators and other office staff',
  },
] as const;

export const TRAINING_TARGET_GROUP_VALUES = ['GUARDS', 'STAFF'] as const;
export type TrainingTargetGroup = (typeof TRAINING_TARGET_GROUP_VALUES)[number];

export const GUARDS_TARGET_GROUP = 'GUARDS';
export const STAFF_TARGET_GROUP  = 'STAFF';

export const FACILITATOR_TYPES = [
  { value: 'INTERNAL', label: 'Internal (our own staff)' },
  { value: 'EXTERNAL', label: 'External (guest facilitator)' },
] as const;

export const FACILITATOR_TYPE_VALUES = ['INTERNAL', 'EXTERNAL'] as const;
export type FacilitatorType = (typeof FACILITATOR_TYPE_VALUES)[number];

export const INTERNAL_FACILITATOR = 'INTERNAL';
export const EXTERNAL_FACILITATOR = 'EXTERNAL';

export const TRAINING_STATUSES = [
  { value: 'SCHEDULED', label: 'Scheduled', colour: '#1B3A6B' },
  { value: 'COMPLETED', label: 'Completed', colour: '#1E8449' },
  { value: 'CANCELLED', label: 'Cancelled', colour: '#C0392B' },
] as const;

export const targetGroupLabel = (value: string): string =>
  TRAINING_TARGET_GROUPS.find((g) => g.value === value)?.label ?? value;
