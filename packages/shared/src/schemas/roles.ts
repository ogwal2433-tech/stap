import { z } from 'zod';

/**
 * Roles as data. A role is a row now, created at runtime, so what code once got
 * from an enum it gets from these shapes and the /roles endpoint.
 */

/** DIRECTOR, FIELD_SUPERVISOR, ZONE_MANAGER — what code and sign-in tokens compare. */
export const ROLE_NAME_PATTERN = /^[A-Z][A-Z0-9_]{1,39}$/;

/** "Zone manager (North)" → "ZONE_MANAGER_NORTH". Validate the result with ROLE_NAME_PATTERN. */
export function normaliseRoleName(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

const Colour = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Colour must be a hex value such as #1B3A6B');

export const CreateRoleSchema = z.object({
  label:       z.string().trim().min(2, 'Give the role a name of at least 2 characters').max(60),
  /** Optional: derived from the label when omitted. Normalised either way. */
  name:        z.string().trim().max(60).optional(),
  description: z.string().trim().max(300).optional().nullable(),
  colour:      Colour.optional().nullable(),
});
export type CreateRoleInput = z.infer<typeof CreateRoleSchema>;

/**
 * Strict on purpose: a role's name is fixed once created, because code and
 * sign-in tokens refer to it. Sending one is refused rather than quietly ignored.
 */
export const UpdateRoleSchema = z
  .object({
    label:       z.string().trim().min(2).max(60).optional(),
    description: z.string().trim().max(300).optional().nullable(),
    colour:      Colour.optional().nullable(),
    isActive:    z.boolean().optional(),
  })
  .strict();
export type UpdateRoleInput = z.infer<typeof UpdateRoleSchema>;

export interface RoleRecord {
  id:              string;
  name:            string;
  label:           string;
  description:     string | null;
  colour:          string | null;
  /** Named in code; cannot be deleted. */
  isSystem:        boolean;
  /** Disabled roles hold no permissions and cannot sign in. */
  isActive:        boolean;
  userCount:       number;
  permissionCount: number;
  createdAt:       string;
  updatedAt:       string;
}
