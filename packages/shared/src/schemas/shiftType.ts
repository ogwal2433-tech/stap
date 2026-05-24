import { z } from 'zod';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const CODE_RE = /^[A-Z0-9_]+$/;

export const CreateShiftTypeSchema = z.object({
  name:          z.string().min(1).max(100),
  code:          z.string().min(1).max(50).regex(CODE_RE, 'Uppercase letters, numbers and underscores only'),
  startTime:     z.string().regex(TIME_RE, 'Must be in HH:MM format').optional().nullable(),
  endTime:       z.string().regex(TIME_RE, 'Must be in HH:MM format').optional().nullable(),
  durationHours: z.coerce.number().positive().optional().nullable(),
  displayOrder:  z.coerce.number().int().min(0).default(0),
  isOvertime:    z.boolean().default(false),
});

export type CreateShiftTypeInput = z.infer<typeof CreateShiftTypeSchema>;

export const UpdateShiftTypeSchema = z.object({
  name:          z.string().min(1).max(100).optional(),
  startTime:     z.string().regex(TIME_RE, 'Must be in HH:MM format').optional().nullable(),
  endTime:       z.string().regex(TIME_RE, 'Must be in HH:MM format').optional().nullable(),
  durationHours: z.coerce.number().positive().optional().nullable(),
  displayOrder:  z.coerce.number().int().min(0).optional(),
  isActive:      z.boolean().optional(),
  isOvertime:    z.boolean().optional(),
});

export type UpdateShiftTypeInput = z.infer<typeof UpdateShiftTypeSchema>;

export const ReorderShiftTypesSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1),
});

export interface ShiftTypeResponse {
  id:            string;
  name:          string;
  code:          string;
  startTime:     string | null;
  endTime:       string | null;
  durationHours: number | null;
  displayOrder:  number;
  isActive:      boolean;
  isOvertime:    boolean;
}
