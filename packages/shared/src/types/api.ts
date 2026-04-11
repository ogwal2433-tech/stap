export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// UserRole is now the canonical export from ./types/roles
// Re-exported via packages/shared/src/index.ts → types/roles
