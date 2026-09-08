import { z } from 'zod';

/**
 * Granting a login to a guard or a client company.
 *
 * The record and the login are one action, not two: a guard is hired and may
 * or may not need to sign in; a client company is taken on and may or may not
 * want the portal. Both stay optional, and both are switched on from the
 * profile that already exists rather than from a separate user-admin screen.
 */

/** Rejects the accidental space a pasted password carries in with it. */
const TemporaryPassword = z
  .string()
  .min(8, 'A temporary password needs at least 8 characters')
  .max(128)
  .refine((p) => p.trim() === p, 'The password cannot start or end with a space');

export const GrantGuardAccessSchema = z.object({
  email:    z.string().email().transform((e) => e.trim().toLowerCase()),
  password: TemporaryPassword,
});

export const GrantClientPortalSchema = z.object({
  email:       z.string().email().transform((e) => e.trim().toLowerCase()),
  password:    TemporaryPassword,
  contactName: z.string().min(2, 'Name the person who will use this login').max(100),
});

export const ResetPortalPasswordSchema = z.object({
  /** Which login to reset — a company may hold several. */
  userId:      z.string().min(1),
  newPassword: TemporaryPassword,
});

export type GrantGuardAccessInput   = z.infer<typeof GrantGuardAccessSchema>;
export type GrantClientPortalInput  = z.infer<typeof GrantClientPortalSchema>;
export type ResetPortalPasswordInput = z.infer<typeof ResetPortalPasswordSchema>;

/** The login attached to a guard, or to one of a client's portal contacts. */
export interface LinkedAccount {
  userId: string;
  name:   string;
  email:  string;
  status: string;
}
