import { z } from 'zod';

// ── Input schemas ──────────────────────────────────────────────────────────────

export const CreateZoneSchema = z.object({
  name:         z.string().min(2).max(100),
  description:  z.string().optional(),
  supervisorId: z.string().optional(),
  alternateId:  z.string().optional(),
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

export interface ZoneDetailSite {
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
  sites:       ZoneDetailSite[];
  createdAt:   string;
  updatedAt:   string;
}

export interface ZoneSite {
  id:                  string;
  siteName:            string;
  location:            string;
  guardsRequired:      number;
  siteType:            string;
  defaultShiftType:    string | null;
  requiresArmedGuards: boolean;
  requiresFirearms:    boolean;
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
  phone:           string;
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
