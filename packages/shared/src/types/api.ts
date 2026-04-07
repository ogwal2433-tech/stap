export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export type UserRole =
  | 'director'
  | 'assistant_manager'
  | 'administrator'
  | 'operations_supervisor'
  | 'field_supervisor'
  | 'trainer'
  | 'accounts_officer'
  | 'marketing'
  | 'guard'
  | 'client';