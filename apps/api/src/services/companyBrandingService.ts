import { COMPANY_BRANDING_KEYS, CompanyBrandingPatchSchema, resolveCompanyBranding, type CompanyBranding, type CompanyBrandingKey } from '@security360/shared';
import { COMPANY_BRANDING_DEFAULTS } from '../config/branding';
import prisma from '../db/prisma';
import { QueueService } from '../jobs/QueueService';
import { publishCompanyBrandingChange } from '../lib/companyBrandingCacheBus';

const companyBrandingCache = new Map<string, { value: CompanyBranding; expiresAt: number }>();
const CACHE_KEY = 'current';
export function clearCompanyBrandingCache(): void { companyBrandingCache.clear(); }

let legacyContactMigration: Promise<void> | null = null;
async function migrateLegacyCompanyContacts(): Promise<void> {
  if (legacyContactMigration) return legacyContactMigration;
  legacyContactMigration = prisma.$transaction(async (tx) => {
    const mapping = [
      ['company.address', 'company_address', COMPANY_BRANDING_DEFAULTS.company_address],
      ['company.email', 'company_email', COMPANY_BRANDING_DEFAULTS.company_email],
      ['company.phone', 'company_phone', COMPANY_BRANDING_DEFAULTS.company_phone],
      ['company.website', 'company_website', COMPANY_BRANDING_DEFAULTS.company_website],
    ] as const;
    for (const [legacyKey, canonicalKey, defaultValue] of mapping) {
      const legacy = await tx.systemSetting.findUnique({ where: { key: legacyKey } });
      if (!legacy) continue;
      const canonical = await tx.systemSetting.findUnique({ where: { key: canonicalKey } });
      // Legacy namespaced company.* values migrate only into absent/default underscore values.
      if (legacy.value.trim() && (!canonical || canonical.value === defaultValue)) {
        await tx.systemSetting.upsert({
          where: { key: canonicalKey }, update: { value: legacy.value },
          create: { key: canonicalKey, value: legacy.value, label: canonicalKey.replace(/_/g, ' '), group: 'GENERAL' },
        });
      }
      await tx.systemSetting.deleteMany({ where: { key: legacyKey } });
    }
  }).then(() => {
    clearCompanyBrandingCache();
    publishCompanyBrandingChange();
  }).catch((error) => { legacyContactMigration = null; throw error; });
  return legacyContactMigration;
}

export async function getCompanyBranding(): Promise<CompanyBranding> {
  await migrateLegacyCompanyContacts();
  const cached = companyBrandingCache.get(CACHE_KEY);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const rows = await prisma.systemSetting.findMany({
    where: { key: { in: COMPANY_BRANDING_KEYS } }, select: { key: true, value: true },
  });
  const values = Object.fromEntries(rows.map(({ key, value }) => [key, value]));
  const result = resolveCompanyBranding(values as Partial<CompanyBranding>, COMPANY_BRANDING_DEFAULTS);
  companyBrandingCache.set(CACHE_KEY, { value: result, expiresAt: Date.now() + 60_000 });
  return result;
}

export async function updateCompanyBranding(input: unknown, actorId: string): Promise<CompanyBranding> {
  const patch = CompanyBrandingPatchSchema.parse(input);
  const values = Object.entries(patch).filter(([, value]) => value !== undefined) as Array<[CompanyBrandingKey, string]>;
  for (const [key, value] of values) {
    if (['company_short_name', 'company_logo_url', 'company_registration_number', 'company_tax_id'].includes(key)
      && value.trim() === COMPANY_BRANDING_DEFAULTS[key]) {
      await prisma.systemSetting.deleteMany({ where: { key } });
      continue;
    }
    await prisma.systemSetting.upsert({
      where: { key }, update: { value, updatedBy: actorId },
      create: { key, value, label: key.replace(/_/g, ' '), group: 'COMPANY_BRANDING', dataType: 'string', updatedBy: actorId },
    });
  }
  await QueueService.logAudit({ userId: actorId, action: 'COMPANY_BRANDING_UPDATED', entity: 'SystemSetting', entityId: values.map(([key]) => key).join(','), newValue: Object.fromEntries(values) });
  clearCompanyBrandingCache();
  publishCompanyBrandingChange();
  return getCompanyBranding();
}

export async function resetCompanyBranding(keys: CompanyBrandingKey[], actorId: string): Promise<CompanyBranding> {
  const validKeys = [...new Set(keys)];
  const prior = await prisma.systemSetting.findMany({ where: { key: { in: validKeys } } });
  await prisma.systemSetting.deleteMany({ where: { key: { in: validKeys } } });
  await QueueService.logAudit({ userId: actorId, action: 'COMPANY_BRANDING_RESET', entity: 'SystemSetting', entityId: prior.map((row) => row.id).join(','), oldValue: Object.fromEntries(prior.map((row) => [row.key, row.value])) });
  clearCompanyBrandingCache();
  publishCompanyBrandingChange();
  return getCompanyBranding();
}

export const companyBrandingDefaults = COMPANY_BRANDING_DEFAULTS;
