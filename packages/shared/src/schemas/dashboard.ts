/**
 * Role-scoped dashboard payload.
 *
 * Every role returns the same envelope — { role, stats, feeds } — but the keys
 * inside differ, because each role is shown only what it can act on. The
 * frontend picks a dashboard component off `role` and reads the keys it needs.
 */

export interface DashboardFeedItem {
  id:         string;
  primary:    string;
  secondary:  string;
  badge?:     string;
}

export interface DashboardData {
  role:  DashboardRole;
  stats: Record<string, number>;
  feeds: Record<string, DashboardFeedItem[]>;
}

export type DashboardRole =
  | 'DIRECTOR'
  | 'OPERATIONS_SUPERVISOR'
  | 'FIELD_SUPERVISOR'
  | 'ACCOUNTS_OFFICER'
  | 'ADMINISTRATOR'
  | 'CONTROL_ROOM'
  | 'MARKETING'
  | 'HR'
  | 'CLIENT';
