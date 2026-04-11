export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Matches the Prisma Role enum (uppercase)
export type UserRole =
  | 'DIRECTOR'
  | 'ASSISTANT_MANAGER'
  | 'ADMINISTRATOR'
  | 'OPERATIONS_SUPERVISOR'
  | 'FIELD_SUPERVISOR'
  | 'TRAINER'
  | 'ACCOUNTS_OFFICER'
  | 'MARKETING'
  | 'GUARD'
  | 'CLIENT';
