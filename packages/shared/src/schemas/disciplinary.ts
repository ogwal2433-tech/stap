import { z } from 'zod';

// ── Disciplinary schemas ───────────────────────────────────────────────────────

export const CreateDisciplinarySchema = z.object({
  guardId: z.string().cuid(),
  incidentDate: z.string().datetime(),
  type: z.enum(['VERBAL_WARNING', 'WRITTEN_WARNING', 'SUSPENSION', 'TERMINATION']),
  reason: z.string().min(10).max(2000),
  outcome: z.string().min(5).max(1000),
});

export const LetterGenerationSchema = z.object({
  guardId: z.string().cuid(),
  letterType: z.enum([
    'VERBAL_WARNING',
    'FIRST_WARNING',
    'FINAL_WARNING',
    'TERMINATION_NOTICE',
    'APPOINTMENT_LETTER',
    'CONTRACT_EXTENSION',
    'CONFIRMATION_OF_EMPLOYMENT',
    'SALARY_REVIEW',
  ]),
  disciplinaryRecordId: z
    .string()
    .cuid()
    .optional()
    .describe('Link letter to a disciplinary record if applicable'),
  customFields: z
    .record(z.string())
    .optional()
    .describe('Override template placeholders with custom values'),
  directorName: z.string().min(1).default('The Director'),
});

// ── Inferred input types ───────────────────────────────────────────────────────

export type CreateDisciplinaryInput = z.infer<typeof CreateDisciplinarySchema>;
export type LetterGenerationInput = z.infer<typeof LetterGenerationSchema>;

// ── Response interfaces ────────────────────────────────────────────────────────

export interface DisciplinaryResponse {
  id: string;
  guard: { id: string; fullName: string; nationalId: string };
  incidentDate: string;
  type: string;
  officer: { id: string; name: string };
  reason: string;
  outcome: string;
  letterPath: string | null;
  createdAt: string;
}
