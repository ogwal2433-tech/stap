import { z } from 'zod';

// ── Constants ──────────────────────────────────────────────────────────────────

/**
 * The gun types the company actually holds.
 *
 * Stored as the value, shown as the label. gunType stays a plain String in the
 * database rather than an enum, so a gun registered under an older list — there
 * is one on 'Pistol' — keeps its type and stays readable instead of failing to
 * load. New registrations are held to this list at the schema.
 */
export const GUN_TYPES = [
  { value: 'AK-47',            label: 'AK-47' },
  { value: 'SAR_RIFLE',        label: 'SAR Rifle' },
  { value: 'RIFLE',            label: 'Rifle' },
  { value: 'PARDUS_SHORT_GUN', label: 'Pardus Short Gun' },
  { value: '12_BORE_SG_DB',    label: '12 Bore S/G D/B' },
  { value: 'A-TAC',            label: 'A-TAC' },
] as const;

export const GUN_TYPE_VALUES = [
  'AK-47', 'SAR_RIFLE', 'RIFLE', 'PARDUS_SHORT_GUN', '12_BORE_SG_DB', 'A-TAC',
] as const;
export type GunType = (typeof GUN_TYPE_VALUES)[number];

/** Falls back to the stored value, so a legacy type still reads as itself. */
export const gunTypeLabel = (value: string): string =>
  GUN_TYPES.find((t) => t.value === value)?.label ?? value;

/**
 * Who owns the gun, which decides the licence fee.
 *
 * The fee and period are derived from this on the server rather than being
 * accepted from the client — the rate is company policy, not something the
 * person filling the form should be able to type in.
 */
export const GUN_OWNERSHIP = [
  {
    value:       'COMPANY',
    label:       'Company-Owned',
    fee:         160_000,
    period:      'YEARLY',
    periodLabel: 'per year',
    description: 'UGX 160,000 per year',
    colour:      '#1B3A6B',
    icon:        '🏢',
  },
  {
    value:       'GOVERNMENT',
    label:       'Government-Owned',
    fee:         20_000,
    period:      'MONTHLY',
    periodLabel: 'per month',
    description: 'UGX 20,000 per month',
    colour:      '#1E8449',
    icon:        '🏛️',
  },
] as const;

export const GUN_OWNERSHIP_VALUES = ['COMPANY', 'GOVERNMENT'] as const;
export type GunOwnership = (typeof GUN_OWNERSHIP_VALUES)[number];

export const ownershipConfig = (value: string) =>
  GUN_OWNERSHIP.find((o) => o.value === value);

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
  serialNumber: z.string().min(1, 'Serial number is required').max(60).trim(),
  gunType:      z.enum(GUN_TYPE_VALUES, { errorMap: () => ({ message: 'Select a gun type' }) }),
  ownership:    z.enum(GUN_OWNERSHIP_VALUES, { errorMap: () => ({ message: 'Select who owns this gun' }) }),
  manufacturer: z.string().max(100).optional().nullable(),
  condition:    z.enum(GUN_CONDITION_VALUES).default('GOOD'),
  /** Rounds issued with the gun at registration; the current count starts here. */
  totalBullets: z.coerce.number().int().min(0, 'Bullet count cannot be negative').default(0),
  notes:        z.string().max(1000).optional().nullable(),
  // licenceFee and licencePeriod are deliberately absent: the server derives
  // them from ownership, so the rate cannot be set from the form.
});
export type RegisterGunInput = z.infer<typeof RegisterGunSchema>;

/** Every field optional — a partial edit should not have to resend the rest. */
export const UpdateGunSchema = RegisterGunSchema.partial();
export type UpdateGunInput = z.infer<typeof UpdateGunSchema>;

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
  /** GUN-001, issued on registration. */
  systemId:       string | null;
  serialNumber:   string;
  gunType:        string;
  /** Resolved label, so a legacy type still displays as itself. */
  gunTypeLabel:   string;
  ownership:      string;
  ownershipLabel: string;
  /** Derived from ownership on the server; UGX. */
  licenceFee:     number | null;
  /** YEARLY | MONTHLY */
  licencePeriod:  string | null;
  manufacturer:   string | null;
  condition:      GunCondition;
  status:         GunStatus;
  currentSiteId:  string | null;
  currentSiteName: string | null;
  /** Rounds issued at registration. */
  totalBullets:   number;
  /** Rounds held now — falls as they are used, tops back up on a refill. */
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
