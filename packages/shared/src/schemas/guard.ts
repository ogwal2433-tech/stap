import { z } from 'zod';

export const CreateGuardSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  nationalId: z.string().min(1),
  phone: z.string().min(10),
  salaryRate: z.number().positive(),
  contractStart: z.string().datetime(),
});

export type CreateGuardInput = z.infer<typeof CreateGuardSchema>;