import { z } from 'zod';
import { DEFAULT_COMPANY_NAME } from './constants/app';

export const COMPANY_BRANDING_DEFAULTS = {
  company_name: DEFAULT_COMPANY_NAME,
  company_short_name: 'STAP',
  company_address: 'Kampala, Uganda',
  company_email: 'info@stapsecurity.co.ug',
  company_phone: '+256 414 000 000',
  company_website: 'www.stapsecurity.co.ug',
  company_logo_url: '',
  company_registration_number: '',
  company_tax_id: '',
} as const;

export const COMPANY_BRANDING_KEYS = Object.keys(COMPANY_BRANDING_DEFAULTS) as Array<keyof typeof COMPANY_BRANDING_DEFAULTS>;
export type CompanyBrandingKey = keyof typeof COMPANY_BRANDING_DEFAULTS;
export type CompanyBranding = Record<CompanyBrandingKey, string>;
export const CompanyBrandingPatchSchema = z.object(
  Object.fromEntries(COMPANY_BRANDING_KEYS.map((key) => [key, z.string().trim().max(500)])) as Record<CompanyBrandingKey, z.ZodString>,
).partial().strict();

export function resolveCompanyBranding(overrides?: Partial<CompanyBranding> | null): CompanyBranding {
  return Object.fromEntries(COMPANY_BRANDING_KEYS.map((key) => {
    const candidate = overrides?.[key]?.trim();
    return [key, candidate || COMPANY_BRANDING_DEFAULTS[key]];
  })) as CompanyBranding;
}
