import { z } from 'zod';
import type { UserRole } from '../types/roles';

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
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
