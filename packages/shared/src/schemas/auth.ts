import { z } from 'zod';
import { ROLES, type UserRole } from '../types/roles';

export const LoginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});

export const StrongPasswordSchema = z
  .string()
  .min(8,  'Password must be at least 8 characters')
  .regex(/[A-Z]/,        'Must contain an uppercase letter')
  .regex(/[0-9]/,        'Must contain a number')
  .regex(/[^A-Za-z0-9]/, 'Must contain a special character');

/**
 * Any role name. Roles are rows now, created at runtime, so a schema cannot list
 * them; settingsService checks the name against the Role table instead — that
 * it exists and is enabled.
 */
const RoleName = z.string().trim().min(1).max(40);

// A CLIENT-role user must be linked to a client company; every other role
// must NOT carry a clientId — enforced here so this rule can't be bypassed
// by hitting the API directly.
function requireClientIdForClientRole<T extends { role?: string; clientId?: string | null }>(
  schema: z.ZodType<T>,
) {
  return schema
    .refine(
      (data) => (data.role === ROLES.CLIENT ? !!data.clientId && data.clientId.trim().length > 0 : true),
      { message: 'A client company must be selected when creating a Client account.', path: ['clientId'] },
    )
    .refine(
      (data) => !(data.role !== undefined && data.role !== ROLES.CLIENT && data.clientId),
      { message: 'Only Client accounts can be linked to a client company.', path: ['clientId'] },
    );
}

export const CreateUserSchema = requireClientIdForClientRole(
  z.object({
    name:     z.string().min(2),
    email:    z.string().email(),
    password: StrongPasswordSchema,
    role:     RoleName,
    clientId: z.string().min(1).optional().nullable(),
  }),
);

export const UpdateUserSchema = requireClientIdForClientRole(
  z.object({
    name:     z.string().min(2).optional(),
    role:     RoleName.optional(),
    status:   z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).optional(),
    clientId: z.string().min(1).optional().nullable(),
  }),
);

export const ResetPasswordSchema = z.object({
  newPassword: StrongPasswordSchema,
});

export type LoginInput = z.infer<typeof LoginSchema>;
export type CreateUserInput = z.infer<typeof CreateUserSchema>;
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;

export interface LoginResponse {
  accessToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
  };
  /**
   * When true the user has 2FA enabled.
   * The accessToken will be absent and tempToken will be set instead.
   * The frontend should show a 2FA verification screen (Sprint 3).
   */
  requiresTwoFactor?: boolean;
  /** Short-lived (5 min) JWT with type "2fa_pending". Present only when requiresTwoFactor=true. */
  tempToken?: string;
}

export interface RefreshResponse {
  accessToken: string;
}
