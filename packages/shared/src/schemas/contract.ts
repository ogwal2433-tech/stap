import { z } from 'zod';

// ── Contract schemas ───────────────────────────────────────────────────────────

export const CreateContractSchema = z.object({
  clientId:        z.string().min(1),
  contractStart:   z.string().datetime(),
  contractEnd:     z.string().datetime(),
  guardsRequired:  z.number().int().min(1),
  billingPerGuard: z.number().int().positive()
                     .describe('Monthly billing per guard in UGX'),
  status:          z.enum(['DRAFT', 'ACTIVE', 'EXPIRING', 'EXPIRED']).default('ACTIVE'),
});

export type CreateContractInput = z.infer<typeof CreateContractSchema>;

export const UpdateContractSchema = CreateContractSchema.omit({ clientId: true }).partial();

export type UpdateContractInput = z.infer<typeof UpdateContractSchema>;

// ── Response interface ─────────────────────────────────────────────────────────

export interface ContractResponse {
  id:              string;
  client:          { id: string; clientName: string };
  contractStart:   string;
  contractEnd:     string;
  guardsRequired:  number;
  billingPerGuard: number;
  monthlyValue:    number; // computed: guardsRequired * billingPerGuard
  status:          'DRAFT' | 'ACTIVE' | 'EXPIRING' | 'EXPIRED';
  daysRemaining:   number; // computed: days until contractEnd
  createdAt:       string;
  updatedAt:       string;
}
