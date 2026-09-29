import type { UserRole } from '@security360/shared';

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        role: UserRole;
        name: string;
        email: string;
        clientId: string | null;
      };
    }
  }
}

export {};
