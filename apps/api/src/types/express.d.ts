import type { UserRole } from '@stap/shared';

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        role: UserRole;
        name: string;
        email: string;
      };
    }
  }
}

export {};
