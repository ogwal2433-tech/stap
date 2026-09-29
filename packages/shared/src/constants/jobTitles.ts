/**
 * The positions Security360 actually holds.
 *
 * A job title is a label, not a permission. The system role beside it decides
 * what someone can reach; two people can share the title "Zone 1 Supervisor"
 * and hold different roles, and changing a title grants nothing.
 *
 * Grouped so an eighteen-item dropdown reads as a structure rather than a list.
 */
export const JOB_TITLES = [
  { value: 'MD',                         label: 'MD',                          category: 'Executive' },
  { value: 'ASSISTANT_MANAGER',          label: 'Assistant Manager',           category: 'Executive' },

  { value: 'OPERATIONS_MANAGER',         label: 'Operations Manager',          category: 'Operations' },
  { value: 'FIELD_OPERATIONS_MANAGER',   label: 'Field Operations Manager',    category: 'Operations' },
  { value: 'QRF',                        label: 'QRF — Quick Reaction Force',  category: 'Operations' },

  { value: 'ADMINISTRATOR',              label: 'Administrator',               category: 'Administration' },

  { value: 'HEAD_OF_SUPERVISORS',        label: 'Head of Supervisors',         category: 'Supervisors' },
  { value: 'NORTHERN_REGION_SUPERVISOR', label: 'Northern Region Supervisor',  category: 'Supervisors' },
  { value: 'MOYO_REGION_SUPERVISOR',     label: 'Moyo Region Supervisor',      category: 'Supervisors' },
  { value: 'ZONE_1_SUPERVISOR',          label: 'Zone 1 Supervisor',           category: 'Supervisors' },
  { value: 'ZONE_2_SUPERVISOR',          label: 'Zone 2 Supervisor',           category: 'Supervisors' },
  { value: 'ZONE_3_SUPERVISOR',          label: 'Zone 3 Supervisor',           category: 'Supervisors' },
  { value: 'ZONE_4_SUPERVISOR',          label: 'Zone 4 Supervisor',           category: 'Supervisors' },
  { value: 'DAY_SUPERVISOR',             label: 'Day Supervisor',              category: 'Supervisors' },

  { value: 'CONTROLLER',                 label: 'Controller',                  category: 'Control Room' },
  { value: 'ASSISTANT_CONTROLLER',       label: 'Assistant Controller',        category: 'Control Room' },

  { value: 'TRAINER',                    label: 'Trainer',                     category: 'Training' },

  { value: 'COMPANY_TAX_CONSULTANT',     label: 'Company Tax Consultant',      category: 'Finance' },
] as const;

export type JobTitleValue = (typeof JOB_TITLES)[number]['value'];

/** Category order follows the list, so the dropdown groups read top-down. */
export const JOB_TITLE_CATEGORIES: string[] =
  [...new Set(JOB_TITLES.map((j) => j.category))];

export const JOB_TITLE_VALUES = JOB_TITLES.map((j) => j.value) as unknown as
  [JobTitleValue, ...JobTitleValue[]];

/**
 * Falls back to the stored string. A title recorded before this list existed
 * still reads as whatever was typed rather than disappearing from the profile.
 */
export function getJobTitleLabel(value: string | null | undefined): string {
  if (!value) return '—';
  return JOB_TITLES.find((j) => j.value === value)?.label ?? value;
}

/** True for a stored value this build does not know — a legacy free-text title. */
export const isLegacyJobTitle = (value: string | null | undefined): boolean =>
  !!value && !JOB_TITLES.some((j) => j.value === value);
