import { ROLE_CONFIG } from '@stap/shared';

/**
 * The roles code names directly — in requireRole, in ROLES, in the default
 * permission sets. They are rows in the Role table like any other, but they are
 * seeded rather than created, and they cannot be deleted.
 *
 * Seeded once by the 20260910000002 migration and upserted by the seed, which
 * never overwrites an existing row: a label or colour changed in the UI must
 * survive a re-seed.
 */

export interface SystemRoleDefinition {
  name:        string;
  label:       string;
  description: string;
  colour:      string;
  isActive:    boolean;
}

/** Portal logins rather than staff: outside the staff directory and the matrix. */
export const PORTAL_ROLES = ['GUARD', 'CLIENT'] as const;

const PORTAL_DEFINITIONS: SystemRoleDefinition[] = [
  {
    name:        'GUARD',
    label:       'Guard',
    description: 'A security guard. Signs in to check in and see their own records.',
    colour:      '#34495E',
    isActive:    true,
  },
  {
    name:        'CLIENT',
    label:       'Client',
    description: "A customer's portal login. Sees only their own company.",
    colour:      '#7F8C8D',
    isActive:    true,
  },
];

export const SYSTEM_ROLES: SystemRoleDefinition[] = [
  ...Object.entries(ROLE_CONFIG).map(([name, c]) => ({
    name,
    label:       c.label,
    description: c.description,
    colour:      c.colour,
    // Retired when Marketing split into Marketing Head and Sales. Kept, and
    // disabled, so its grants and any token issued before the split resolve.
    isActive:    name !== 'MARKETING',
  })),
  ...PORTAL_DEFINITIONS,
];
