import { z } from 'zod';
import type { UserRole } from '../types/roles';

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

export const CreateUserSchema = z.object({
  name:     z.string().min(2),
  email:    z.string().email(),
  password: StrongPasswordSchema,
  role:     z.string().min(1),
});

export const ResetPasswordSchema = z.object({
  newPassword: StrongPasswordSchema,
});

export type LoginInput = z.infer<typeof LoginSchema>;

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
