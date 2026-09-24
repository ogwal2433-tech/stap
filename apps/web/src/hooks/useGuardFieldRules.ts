import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

/**
 * Which guard fields this deployment insists on.
 *
 * Only fields the database allows to be absent are configurable. Name, date of
 * birth, salary and contract start are NOT NULL columns, so they are always
 * required and arrive in `alwaysRequired` rather than as a choice.
 *
 * The server enforces these too — this is for marking the labels and saying
 * what is missing before a round trip, not the rule itself.
 */
export interface GuardFieldRules {
  required:       Record<string, boolean>;
  labels:         Record<string, string>;
  alwaysRequired: string[];
}

/** Nothing extra required — what the system does before anyone configures it. */
export const NO_EXTRA_REQUIRED: GuardFieldRules = {
  required:       {},
  labels:         {},
  alwaysRequired: ['firstName', 'lastName', 'dateOfBirth', 'salaryRate', 'contractStart'],
};

export function useGuardFieldRules() {
  return useQuery<GuardFieldRules>({
    queryKey: ['guard-field-rules'],
    queryFn:  () => api
      .get<{ success: boolean; data: GuardFieldRules }>('/settings/guard-fields')
      .then((r) => r.data.data),
    // Changed about as often as a policy is: rarely, and a stale minute is
    // harmless because the server is what actually refuses the record.
    staleTime: 5 * 60 * 1000,
    placeholderData: NO_EXTRA_REQUIRED,
  });
}
