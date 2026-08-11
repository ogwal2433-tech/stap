import { z } from 'zod';

// ── Constants ──────────────────────────────────────────────────────────────────

export const GUN_TYPES = ['AK-47', 'G3', 'Pistol', 'Shotgun', 'SMG', 'Other'] as const;
export type GunType = (typeof GUN_TYPES)[number];

export const GUN_CONDITIONS = [
  { value: 'GOOD',         label: '✅ Good' },
  { value: 'FAIR',         label: '⚠️ Fair' },
  { value: 'NEEDS_REPAIR', label: '🔧 Needs Repair' },
  { value: 'RETIRED',      label: '❌ Retired' },
] as const;

export const GUN_CONDITION_VALUES = ['GOOD', 'FAIR', 'NEEDS_REPAIR', 'RETIRED'] as const;
export type GunCondition = (typeof GUN_CONDITION_VALUES)[number];

/**
 * Where a gun is right now.
 *
 * There is no WITHDRAWN state: withdrawing a gun returns it to the armoury, so
 * it lands back on IN_ARMOURY. A separate WITHDRAWN status would be a second
 * name for the same place and would make "guns in the armoury" ambiguous.
 */
export const GUN_STATUSES = {
  IN_ARMOURY: 'IN_ARMOURY',
  DEPLOYED:   'DEPLOYED',
  RETIRED:    'RETIRED',
} as const;
export type GunStatus = (typeof GUN_STATUSES)[keyof typeof GUN_STATUSES];

export const GUN_MOVEMENT_TYPES = {
  DEPLOYMENT: 'DEPLOYMENT',
  WITHDRAWAL: 'WITHDRAWAL',
  TRANSFER:   'TRANSFER',
} as const;
export type GunMovementType = (typeof GUN_MOVEMENT_TYPES)[keyof typeof GUN_MOVEMENT_TYPES];

export const GUN_MOVEMENT_LABELS: Record<GunMovementType, string> = {
  DEPLOYMENT: '🚀 Deployed to site',
  WITHDRAWAL: '↩️ Withdrawn to armoury',
  TRANSFER:   '🔄 Transferred between sites',
};

/** Shown wherever a gun is in the armoury rather than at a site. */
export const ARMOURY_LABEL = '🏛️ Armoury';

// ── Input schemas ──────────────────────────────────────────────────────────────

export const RegisterGunSchema = z.object({
  serialNumber:   z.string().min(1, 'Serial number is required').max(60).trim(),
  gunType:        z.string().min(1, 'Gun type is required').max(60),
  manufacturer:   z.string().max(100).optional().nullable(),
  calibre:        z.string().max(40).optional().nullable(),
  condition:      z.enum(GUN_CONDITION_VALUES).default('GOOD'),
  currentBullets: z.coerce.number().int().min(0, 'Bullet count cannot be negative').default(0),
  notes:          z.string().max(1000).optional().nullable(),
});
export type RegisterGunInput = z.infer<typeof RegisterGunSchema>;

/** Armoury → site. */
export const DeployGunSchema = z.object({
  gunId:         z.string().min(1, 'Select a gun'),
  siteId:        z.string().min(1, 'Select a site'),
  bullets:       z.coerce.number().int().min(0, 'Bullet count cannot be negative').default(0),
  movementDate:  z.string().datetime().optional(),
  notes:         z.string().max(1000).optional().nullable(),
});
export type DeployGunInput = z.infer<typeof DeployGunSchema>;

/** Site → armoury. */
export const WithdrawGunSchema = z.object({
  gunId:        z.string().min(1, 'Select a gun'),
  fromSiteId:   z.string().min(1, 'Select the site the gun is being withdrawn from'),
  bullets:      z.coerce.number().int().min(0, 'Bullet count cannot be negative').default(0),
  movementDate: z.string().datetime().optional(),
  reason:       z.string().max(500).optional().nullable(),
  notes:        z.string().max(1000).optional().nullable(),
});
export type WithdrawGunInput = z.infer<typeof WithdrawGunSchema>;

/**
 * Site → site, without passing through the armoury.
 *
 * The feedback describes transfer as "from armoury to site", which is what
 * DeployGunSchema already does. This covers the case deploy cannot: moving a
 * gun straight from one site to another.
 */
export const TransferGunSchema = z.object({
  gunId:        z.string().min(1, 'Select a gun'),
  toSiteId:     z.string().min(1, 'Select the destination site'),
  bullets:      z.coerce.number().int().min(0, 'Bullet count cannot be negative').default(0),
  movementDate: z.string().datetime().optional(),
  reason:       z.string().max(500).optional().nullable(),
  notes:        z.string().max(1000).optional().nullable(),
});
export type TransferGunInput = z.infer<typeof TransferGunSchema>;

// ── Responses ──────────────────────────────────────────────────────────────────

export interface GunMovementResponse {
  id:           string;
  gunId:        string;
  serialNumber: string;
  gunType:      string;
  movementType: GunMovementType;
  /** Null when the gun came from the armoury. */
  fromSite:     { id: string; siteName: string } | null;
  /** Null when the gun went back to the armoury. */
  toSite:       { id: string; siteName: string } | null;
  bullets:      number;
  movementDate: string;
  reason:       string | null;
  notes:        string | null;
  recordedBy:   { id: string; name: string };
  createdAt:    string;
}

export interface GunResponse {
  id:             string;
  serialNumber:   string;
  gunType:        string;
  manufacturer:   string | null;
  calibre:        string | null;
  condition:      GunCondition;
  status:         GunStatus;
  currentSiteId:  string | null;
  currentSiteName: string | null;
  currentBullets: number;
  notes:          string | null;
  registeredBy:   { id: string; name: string } | null;
  createdAt:      string;
  updatedAt:      string;
}

export interface GunWithHistory extends GunResponse {
  movements: GunMovementResponse[];
}

/** One row of the inventory table — the armoury, or a site holding guns. */
export interface GunInventoryRow {
  /** Null for the armoury. */
  siteId:        string | null;
  siteName:      string;
  gunCount:      number;
  serialNumbers: string[];
  gunTypes:      string[];
  totalBullets:  number;
}
