import { z } from 'zod';
import { DEFAULT_COMPANY_NAME } from './constants/app';

export const COMPANY_BRANDING_DEFAULTS = {
  company_name: DEFAULT_COMPANY_NAME,
  company_short_name: 'Security360',
  company_address: 'Kampala, Uganda',
  company_email: 'info@security360.co.ug',
  company_phone: '+256 414 000 000',
  company_website: 'www.security360.co.ug',
  company_logo_url: '',
  company_registration_number: '',
  company_tax_id: '',
  // Where we take payment. Printed on the invoice, so a client does not have to
  // email to ask. No placeholder value on purpose: an invoice carrying a wrong
  // account number sends money to somebody else. Every one is optional — a
  // document prints only what has actually been filled in.
  company_bank_name: '',
  company_bank_branch_name: '',
  company_bank_branch_no: '',
  company_bank_account_name: '',
  company_bank_account: '',
} as const;

export const COMPANY_BRANDING_KEYS = Object.keys(COMPANY_BRANDING_DEFAULTS) as Array<keyof typeof COMPANY_BRANDING_DEFAULTS>;
export type CompanyBrandingKey = keyof typeof COMPANY_BRANDING_DEFAULTS;
export type CompanyBranding = Record<CompanyBrandingKey, string>;
export const CompanyBrandingPatchSchema = z.object(
  Object.fromEntries(COMPANY_BRANDING_KEYS.map((key) => [key, z.string().trim().max(500)])) as Record<CompanyBrandingKey, z.ZodString>,
).partial().strict();

/**
 * The branding this deployment falls back to when nothing is saved in settings.
 *
 * COMPANY_BRANDING_DEFAULTS is the original deployment's identity. Another
 * deployment overrides any field from the environment, named after its key in
 * capitals (company_short_name -> COMPANY_SHORT_NAME), so one server can run
 * more than one brand without either renaming the other. `VITE_` keys win, as
 * in resolveBranding(), since those are all a browser bundle can see.
 */
export function resolveCompanyBrandingDefaults(env: Record<string, string | undefined> = {}): CompanyBranding {
  return Object.fromEntries(COMPANY_BRANDING_KEYS.map((key) => {
    const name = key.toUpperCase();
    const value = (env[`VITE_${name}`] ?? env[name])?.trim();
    return [key, value || COMPANY_BRANDING_DEFAULTS[key]];
  })) as CompanyBranding;
}

export function resolveCompanyBranding(
  overrides?: Partial<CompanyBranding> | null,
  defaults: CompanyBranding = COMPANY_BRANDING_DEFAULTS,
): CompanyBranding {
  return Object.fromEntries(COMPANY_BRANDING_KEYS.map((key) => {
    const candidate = overrides?.[key]?.trim();
    return [key, candidate || defaults[key]];
  })) as CompanyBranding;
}

// ── Company payment accounts ─────────────────────────────────────────────────
// A company usually holds more than one account to be paid into. These back the
// CompanyBankAccount table; the flat company_bank_* branding keys above stay as
// the single-account fallback printed on documents that name only one.

export const PAYMENT_ACCOUNT_TYPES = ['BANK_ACCOUNT', 'MOBILE_MONEY', 'OTHER'] as const;
export type PaymentAccountType = (typeof PAYMENT_ACCOUNT_TYPES)[number];

const paymentAccountFields = {
  label:         z.string().trim().min(1, 'Label is required').max(120),
  type:          z.enum(PAYMENT_ACCOUNT_TYPES),
  currency:      z.string().trim().max(10).nullish(),
  bankName:      z.string().trim().max(150).nullish(),
  branchName:    z.string().trim().max(150).nullish(),
  branchNo:      z.string().trim().max(50).nullish(),
  accountName:   z.string().trim().max(150).nullish(),
  accountNumber: z.string().trim().max(80).nullish(),
  isDefault:     z.boolean().optional(),
  isActive:      z.boolean().optional(),
  sortOrder:     z.number().int().min(0).optional(),
};

export const CompanyBankAccountCreateSchema = z.object(paymentAccountFields).superRefine((value, ctx) => {
  // Bank and mobile-money accounts are worthless without a number to pay into;
  // "OTHER" is the escape hatch for anything printed as free text.
  if (value.type !== 'OTHER' && !value.accountNumber?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['accountNumber'],
      message: 'An account number is required for bank and mobile-money accounts.',
    });
  }
});

export const CompanyBankAccountUpdateSchema = z.object(paymentAccountFields).partial();

export type CompanyBankAccountCreateInput = z.infer<typeof CompanyBankAccountCreateSchema>;
export type CompanyBankAccountUpdateInput = z.infer<typeof CompanyBankAccountUpdateSchema>;

export interface CompanyBankAccountResponse {
  id:            string;
  label:         string;
  type:          PaymentAccountType;
  currency:      string | null;
  bankName:      string | null;
  branchName:    string | null;
  branchNo:      string | null;
  accountName:   string | null;
  accountNumber: string | null;
  isDefault:     boolean;
  isActive:      boolean;
  sortOrder:     number;
  createdAt:     string;
  updatedAt:     string;
}
