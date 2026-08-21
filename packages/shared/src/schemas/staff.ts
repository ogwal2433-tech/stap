import { z } from 'zod';
import { ROLES } from '../types/roles';

/**
 * Staff directory schemas.
 *
 * "Staff" means an internal account — everything the Role enum holds except
 * GUARD and CLIENT, which are people the business tracks rather than people who
 * work the system. The /staff module never lists or creates those two.
 */

// ── Role metadata ──────────────────────────────────────────────────────────────

export interface RoleConfig {
  label:       string;
  description: string;
  colour:      string;
  icon:        string;
}

/**
 * What each role means, in the words shown to whoever is assigning it.
 *
 * Keyed by the Role enum, so MARKETING carries the "Marketing Officer" label
 * the business uses without the database column having to be renamed.
 */
export const ROLE_CONFIG: Record<string, RoleConfig> = {
  DIRECTOR: {
    label:       'Director',
    description: 'Full system access. Can manage all modules, approve requisitions, and view all reports.',
    colour:      '#1B3A6B',
    icon:        '👑',
  },
  ASSISTANT_MANAGER: {
    label:       'Assistant Manager',
    description: 'Near-full access. Manages operations, HR, and finance but cannot change system settings.',
    colour:      '#17a2b8',
    icon:        '🏅',
  },
  OPERATIONS_SUPERVISOR: {
    label:       'Operations Supervisor',
    description: 'Manages deployments, rosters, sites, and guard assignments.',
    colour:      '#2E86C1',
    icon:        '📋',
  },
  FIELD_SUPERVISOR: {
    label:       'Field Supervisor',
    description: 'Builds rosters for their assigned zone. Views guards and attendance.',
    colour:      '#ffc107',
    icon:        '🗺️',
  },
  ADMINISTRATOR: {
    label:       'Administrator',
    description: 'Manages users, system settings, and error logs.',
    colour:      '#6c757d',
    icon:        '⚙️',
  },
  ACCOUNTS_OFFICER: {
    label:       'Accounts Officer',
    description: 'Manages invoices, payments, requisitions, and financial reports.',
    colour:      '#28a745',
    icon:        '💰',
  },
  CONTROL_ROOM: {
    label:       'Control Room',
    description: 'Receives and manages complaints. Forwards communications to department heads.',
    colour:      '#E8701A',
    icon:        '📡',
  },
  TRAINER: {
    label:       'Trainer',
    description: 'Manages guard recruitment, vetting, training records, and gun issuance.',
    colour:      '#6C3483',
    icon:        '🎯',
  },
  MARKETING: {
    label:       'Marketing Officer',
    description: 'Manages prospective clients, bids, targets, and marketing reports.',
    colour:      '#0F7B6C',
    icon:        '📈',
  },
};

/** Role values the staff directory accepts — the Role enum less GUARD and CLIENT. */
export const STAFF_ROLE_VALUES = [
  ROLES.DIRECTOR,
  ROLES.ASSISTANT_MANAGER,
  ROLES.OPERATIONS_SUPERVISOR,
  ROLES.FIELD_SUPERVISOR,
  ROLES.ADMINISTRATOR,
  ROLES.ACCOUNTS_OFFICER,
  ROLES.CONTROL_ROOM,
  ROLES.TRAINER,
  ROLES.MARKETING,
] as const;

const StaffRoleEnum = z.enum(STAFF_ROLE_VALUES);

/** A role a staff account may hold — UserRole less GUARD and CLIENT. */
export type StaffRole = (typeof STAFF_ROLE_VALUES)[number];

// ── Schemas ────────────────────────────────────────────────────────────────────

export const CreateStaffSchema = z.object({
  name:       z.string().min(2).max(100),
  email:      z.string().email().transform((e) => e.toLowerCase()),
  role:       StaffRoleEnum,
  phone:      z.string().max(20).optional().nullable(),
  department: z.string().max(100).optional().nullable(),
  jobTitle:   z.string().max(100).optional().nullable(),
  /** Left blank, a secure password is generated and emailed to the new account. */
  password:   z.string().min(8).max(128).optional(),
});

export const UpdateStaffSchema = z.object({
  name:             z.string().min(2).max(100).optional(),
  phone:            z.string().max(20).optional().nullable(),
  department:       z.string().max(100).optional().nullable(),
  jobTitle:         z.string().max(100).optional().nullable(),
  role:             StaffRoleEnum.optional(),
  emergencyContact: z.string().max(100).optional().nullable(),
  emergencyPhone:   z.string().max(20).optional().nullable(),
});

export const DeactivateStaffSchema = z.object({
  reason: z.string().min(5).max(500),
});

export const StaffListQuerySchema = z.object({
  role:     StaffRoleEnum.optional(),
  // Arrives on the query string, so accept the string form of the boolean.
  isActive: z.enum(['true', 'false']).optional(),
  search:   z.string().max(200).optional(),
  page:     z.coerce.number().int().min(1).default(1),
  limit:    z.coerce.number().int().min(1).max(100).default(20),
});

// ── Response types ─────────────────────────────────────────────────────────────

export interface StaffActivityEntry {
  id:        string;
  action:    string;
  entity:    string;
  createdAt: string;
}

export interface StaffResponse {
  id:                 string;
  systemId:           string | null;
  name:               string;
  email:              string;
  role:               StaffRole;
  phone:              string | null;
  department:         string | null;
  jobTitle:           string | null;
  /** Derived from `status` — true only for ACTIVE accounts. */
  isActive:           boolean;
  status:             string;
  lastLoginAt:        string | null;
  deactivatedAt:      string | null;
  deactivationReason: string | null;
  emergencyContact:   string | null;
  emergencyPhone:     string | null;
  createdAt:          string;
  updatedAt:          string;
  roleConfig:         RoleConfig | null;
  /** Present only on the single-staff endpoint. */
  recentActivity?:    StaffActivityEntry[];
}

export interface StaffListResponse {
  data:        StaffResponse[];
  total:       number;
  page:        number;
  limit:       number;
  pages:       number;
  /** Active head-count per role, for the stat cards. Unfiltered by the query. */
  countByRole: Record<string, number>;
}

// ── Inferred input types ───────────────────────────────────────────────────────

export type CreateStaffInput     = z.infer<typeof CreateStaffSchema>;
export type UpdateStaffInput     = z.infer<typeof UpdateStaffSchema>;
export type DeactivateStaffInput = z.infer<typeof DeactivateStaffSchema>;
export type StaffListQuery       = z.infer<typeof StaffListQuerySchema>;
