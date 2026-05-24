import { z } from 'zod';

export const CreateZoneSchema = z.object({
  name:         z.string().min(1).max(100),
  description:  z.string().max(500).optional(),
  supervisorId: z.string().cuid().optional(),
  alternateId:  z.string().cuid().optional(),
});

export const UpdateZoneSchema = CreateZoneSchema.partial();

export const AssignSitesToZoneSchema = z.object({
  siteIds: z.array(z.string().cuid()).min(1),
});

export const RemoveSitesFromZoneSchema = z.object({
  siteIds: z.array(z.string().cuid()).min(1),
});

export type CreateZoneInput = z.infer<typeof CreateZoneSchema>;
export type UpdateZoneInput = z.infer<typeof UpdateZoneSchema>;
export type AssignSitesToZoneInput = z.infer<typeof AssignSitesToZoneSchema>;
export type RemoveSitesFromZoneInput = z.infer<typeof RemoveSitesFromZoneSchema>;

export interface ZonePersonnelResponse {
  id:    string;
  name:  string;
  email: string;
  role:  string;
}

export interface ZoneSiteResponse {
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
  isActive:    boolean;
  createdBy:   string;
  createdAt:   string;
  updatedAt:   string;
  supervisor:  ZonePersonnelResponse | null;
  alternate:   ZonePersonnelResponse | null;
  sites:       ZoneSiteResponse[];
  siteCount:   number;
}

export interface ZoneSummaryResponse {
  id:          string;
  name:        string;
  description: string | null;
  isActive:    boolean;
  siteCount:   number;
  supervisor:  ZonePersonnelResponse | null;
  alternate:   ZonePersonnelResponse | null;
}
