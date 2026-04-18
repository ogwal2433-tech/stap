import { z } from 'zod';

// ── Schemas ────────────────────────────────────────────────────────────────────

export const NotificationPreferenceInput = z.object({
  role: z.string(),
  preferences: z.record(
    z.object({
      inApp: z.boolean(),
      email: z.boolean(),
      sms:   z.boolean(),
    }),
  ),
});
export type NotificationPreferenceInput = z.infer<typeof NotificationPreferenceInput>;

// ── Interfaces ─────────────────────────────────────────────────────────────────

export interface NotificationResponse {
  id:         string;
  type:       string;
  title:      string;
  message:    string;
  isRead:     boolean;
  readAt:     string | null;
  entityType: string | null;
  entityId:   string | null;
  createdAt:  string;
  timeAgo:    string;
}
