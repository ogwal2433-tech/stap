import { z } from 'zod';

// ── Input schemas ──────────────────────────────────────────────────────────────

export const CreateZoneSchema = z.object({
  name:         z.string().min(2).max(100),
  description:  z.string().optional(),
  supervisorId: z.string().optional(),
  alternateId:  z.string().optional(),
  siteIds:      z.array(z.string()).optional(),
});

export const UpdateZoneSchema = CreateZoneSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export type CreateZoneInput = z.infer<typeof CreateZoneSchema>;
export type UpdateZoneInput = z.infer<typeof UpdateZoneSchema>;

// ── Response interfaces ────────────────────────────────────────────────────────

export interface ZonePersonRef {
  id:   string;
  name: string;
  role: string;
}

export interface ZoneResponseSite {
  id:             string;
  siteName:       string;
  location:       string;
  siteType:       string;
  guardsRequired: number;
  clientName:     string;
}

export interface ZoneResponse {
  id:          string;
  name:        string;
  description: string | null;
  supervisorId: string | null;
  alternateId:  string | null;
  isActive:    boolean;
  supervisor:  ZonePersonRef | null;
  alternate:   ZonePersonRef | null;
  siteCount:   number;
  sites:       ZoneResponseSite[];
  createdAt:   string;
  updatedAt:   string;
}

/**
 * A site as offered in the deployment sheet's Site dropdown, carrying the shift
 * the site will deploy on so the sheet can show it without a second round trip.
 */
export interface ZoneSiteOption {
  id:           string;
  siteName:     string;
  location:     string;
  clientName:   string;
  /** Resolved deployable shift code (DAY | NIGHT | FULL_24 …), null if none set. */
  shift:        string | null;
  /** The client contract's shift pattern (SINGLE_SHIFT, TWO_SHIFTS …), for context. */
  shiftPattern: string | null;
  /**
   * Shifts this site may be deployed on. One entry (or none) means the shift is
   * fixed and the sheet shows it read-only; several means the site runs more
   * than one shift and a row must be able to say which.
   */
  shiftOptions: string[];
}

/** Where a site's deployment shift was resolved from. */
export type SiteShiftSource =
  | 'SITE_DEFAULT'
  | 'SITE_ALLOWED'
  | 'CONTRACT'
  | 'SYSTEM_DEFAULT'
  | 'NONE';

export interface SiteShiftResponse {
  siteId:       string;
  siteName:     string;
  /** Deployable shift code, or null when nothing could be resolved. */
  shift:        string | null;
  source:       SiteShiftSource;
  /** Shift pattern on the client's active contract, when there is one. */
  shiftPattern: string | null;
  /**
   * Shifts this site may be deployed on. One entry (or none) means the shift is
   * fixed and the sheet shows it read-only; several means the site runs more
   * than one shift and a row must be able to say which.
   */
  shiftOptions: string[];
  /** Human-readable note explaining where the shift came from. */
  note:         string;
}

export interface ZoneSite {
  id:                  string;
  siteName:            string;
  location:            string;
  guardsRequired:      number;
  siteType:            string;
  defaultShiftType:    string | null;
  armedGuardsRequired: number;
  firearmsRequired:    number;
  batonRequired:       number;
  otherWeaponsNotes:   string | null;
  isArmed:             boolean;
  specialInstructions: string | null;
  sitePeriodStart:     string | null;
  sitePeriodEnd:       string | null;
  sitePeriodNotes:     string | null;
  hasPeriod:           boolean;
  periodDays:          number | null;
  client: {
    id:         string;
    clientName: string;
  };
}

export interface ZoneRosterGuard {
  id:              string;
  firstName:       string;
  lastName:        string;
  fullName:        string;
  rank:            string | null;
  photoUrl:        string | null;
  /** Optional on a guard, so it can be absent here too. */
  phone:           string | null;
  alreadyDeployed: boolean;
}

export interface ZoneRosterData {
  zone: {
    id:         string;
    name:       string;
    supervisor: ZonePersonRef | null;
    alternate:  ZonePersonRef | null;
  };
  sites:  ZoneSite[];
  guards: ZoneRosterGuard[];
  date:   string;
}
