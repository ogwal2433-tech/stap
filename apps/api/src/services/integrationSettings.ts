import prisma from '../db/prisma';
import { encrypt, decrypt, isEncryptionConfigured } from '../lib/settingsEncryption';
import { SETTINGS_CONFIG, definitionFor, type SettingsGroup } from '../constants/settingsConfig';
import { COMPANY_NAME } from '../config/branding';
import { AppError } from '../errors/AppError';
import { QueueService } from '../jobs/QueueService';

/**
 * Resolves the integration credentials, database first and environment second.
 *
 * Kept apart from settingsService, which owns the plain operational settings
 * already in the table — these are encrypted, fall back to .env, and are read on
 * the path of every email and payment, which the others are not.
 */

/** Where a resolved value came from — shown on the settings page. */
export type Source = 'database' | 'environment' | 'unset';

interface Resolved { value: string; source: Source }

/**
 * Cached because the mailer and the gateway client resolve settings on every
 * send and every call. Short-lived so a change made in the UI takes effect
 * without a restart; cleared outright on save so it takes effect at once.
 */
const TTL_MS = 60_000;
let cache: Map<string, Resolved> | null = null;
let cachedAt = 0;

export function clearSettingsCache(): void {
  cache = null;
  cachedAt = 0;
}

async function resolveAll(): Promise<Map<string, Resolved>> {
  if (cache && Date.now() - cachedAt < TTL_MS) return cache;

  const rows = await prisma.systemSetting.findMany({
    where:  { key: { in: SETTINGS_CONFIG.map((d) => d.key) } },
    select: { key: true, value: true, isEncrypted: true },
  });
  const byKey = new Map(rows.map((r) => [r.key, r]));

  const out = new Map<string, Resolved>();
  for (const def of SETTINGS_CONFIG) {
    const row = byKey.get(def.key);

    if (row?.value) {
      try {
        out.set(def.key, {
          value:  row.isEncrypted ? decrypt(row.value) : row.value,
          source: 'database',
        });
        continue;
      } catch {
        // A value that will not decrypt — a rotated key, a hand-edited row —
        // falls through to the environment rather than taking down mail or
        // payments with it. The settings page reports the source as
        // environment, which is the signal that something needs re-saving.
      }
    }

    const fromEnv = process.env[def.envFallback];
    if (fromEnv) out.set(def.key, { value: fromEnv, source: 'environment' });
  }

  cache = out;
  cachedAt = Date.now();
  return out;
}

/** One resolved value, or null when neither the database nor .env has it. */
export async function getSetting(key: string): Promise<string | null> {
  return (await resolveAll()).get(key)?.value ?? null;
}

export interface CompanyProfile {
  /** Legal entity. Falls back to the deployment's COMPANY_NAME branding. */
  name:      string;
  nameUpper: string;
  email:     string | null;
  phone:     string | null;
  whatsapp:  string | null;
  website:   string | null;
  address:   string | null;
  facebook:  string | null;
  instagram: string | null;
  twitter:   string | null;
}

/**
 * The company as it should appear on anything printed or posted.
 *
 * Saved in Settings → Company details, falling back to the environment and
 * finally to the branding defaults, so a deployment that has configured
 * nothing still prints a name rather than a blank letterhead.
 *
 * Contacts have no fallback on purpose: a wrong address on an invoice is worse
 * than none, so an unset one is omitted from the document instead of guessed.
 */
export async function companyProfile(): Promise<CompanyProfile> {
  const all = await resolveAll();
  const val = (key: string): string | null => {
    const v = all.get(key)?.value;
    return v && v.trim() ? v.trim() : null;
  };

  // The registered name has a home already: the `company_name` system setting
  // the HR letter templates substitute. Read it here rather than keeping a
  // second copy, falling back to this deployment's branding.
  const stored = await prisma.systemSetting.findUnique({ where: { key: 'company_name' } });
  const name = (stored?.value?.trim() || COMPANY_NAME);

  return {
    name,
    nameUpper: name.toUpperCase(),
    email:     val('company.email'),
    phone:     val('company.phone'),
    whatsapp:  val('company.whatsapp'),
    website:   val('company.website'),
    address:   val('company.address'),
    facebook:  val('company.facebook'),
    instagram: val('company.instagram'),
    twitter:   val('company.twitter'),
  };
}

export async function smtpConfig(): Promise<{
  host: string; port: number; secure: boolean;
  auth: { user: string; pass: string }; from: string;
}> {
  const all  = await resolveAll();
  const get  = (k: string) => all.get(k)?.value ?? '';
  const port = parseInt(get('smtp.port') || '587', 10);
  return {
    host:   get('smtp.host'),
    port,
    // Follows the port unless set explicitly, matching the rule that 465 is
    // implicit TLS and everything else is STARTTLS.
    secure: get('smtp.secure') ? get('smtp.secure') === 'true' : port === 465,
    auth:   { user: get('smtp.user'), pass: get('smtp.password') },
    // The authenticated mailbox is the one address always allowed to send.
    from:   get('smtp.from') || get('smtp.user'),
  };
}

export async function xcelConfig(): Promise<{
  baseUrl: string; apiKey: string; merchantId: string;
  webhookUrl: string; partnerId: string; partnerApiKey: string; partnerBaseUrl: string;
  dlCodeBaseUrl: string; configPreset: string; merchantAccount: string; disbursementPath: string;
}> {
  const all = await resolveAll();
  const get = (k: string) => all.get(k)?.value ?? '';
  return {
    baseUrl:        (get('xcel.baseUrl') || 'https://sandbox-api.xcelapp.com').replace(/\/$/, ''),
    apiKey:         get('xcel.apiKey'),
    merchantId:     get('xcel.merchantId'),
    webhookUrl:     get('xcel.webhookUrl'),
    partnerId:      get('xcel.partnerId'),
    partnerApiKey:  get('xcel.partnerApiKey'),
    partnerBaseUrl: (get('xcel.partnerBaseUrl') || 'https://sandbox-api.xcelapp.com/xas/v1').replace(/\/$/, ''),
    dlCodeBaseUrl:  (get('xcel.dlCodeBaseUrl') || 'https://sandbox-api.xcelapp.com/esa-api/api').replace(/\/$/, ''),
    configPreset:   get('xcel.configPreset'),
    // The account debited. Falls back to the partner id, which is what the
    // code sent before this setting existed and is the same value on accounts
    // where XCEL issues one identifier for both.
    merchantAccount: get('xcel.merchantAccount') || get('xcel.partnerId'),
    disbursementPath: get('xcel.disbursementPath') || '/external/payment/momo',
  };
}

export interface SettingView {
  key: string; group: string; label: string; description: string;
  inputType: string; isRequired: boolean; isEncrypted: boolean;
  /** Null for encrypted settings — ciphertext is never sent to the browser. */
  value: string | null;
  hasValue: boolean;
  source: Source;
}

/** The settings in a group, shaped for the form. */
export async function groupView(group: SettingsGroup): Promise<SettingView[]> {
  const all  = await resolveAll();
  const defs = SETTINGS_CONFIG.filter((d) => d.group === group);

  return defs.map((def) => {
    const hit = all.get(def.key);
    return {
      key: def.key, group: def.group, label: def.label, description: def.description,
      inputType: def.inputType, isRequired: def.isRequired, isEncrypted: def.isEncrypted,
      // A secret is reported as present or absent, never echoed back. Sending
      // it would put every stored credential in any response the browser logs.
      value:    def.isEncrypted ? null : hit?.value ?? null,
      hasValue: Boolean(hit?.value),
      source:   hit?.source ?? 'unset',
    };
  });
}

/** Writes one group's settings. Blank values are left alone, not blanked out. */
export async function saveGroup(
  group: SettingsGroup,
  entries: Array<{ key: string; value: string }>,
  updatedBy: string,
): Promise<{ saved: string[]; skipped: string[] }> {
  const saved: string[] = [];
  const skipped: string[] = [];

  for (const { key, value } of entries) {
    const def = definitionFor(key);
    if (!def) throw new AppError(`Unknown setting "${key}".`, 400);
    if (def.group !== group) {
      throw new AppError(`Setting "${key}" does not belong to the ${group} group.`, 400);
    }

    // The form cannot show an existing secret, so it submits an empty field for
    // one left untouched. Writing that through would erase the credential.
    if (value === '' || value === undefined) { skipped.push(key); continue; }

    if (def.isEncrypted && !isEncryptionConfigured()) {
      throw new AppError(
        'SETTINGS_ENCRYPTION_KEY is not set on the server, so secrets cannot be stored. ' +
        'Set it and restart the API before saving this field.',
        500,
      );
    }

    await prisma.systemSetting.upsert({
      where:  { key },
      update: {
        value:       def.isEncrypted ? encrypt(value) : value,
        isEncrypted: def.isEncrypted,
        updatedBy,
      },
      create: {
        key,
        value:       def.isEncrypted ? encrypt(value) : value,
        label:       def.label,
        group:       def.group,
        dataType:    def.inputType === 'number' ? 'number' : def.inputType === 'toggle' ? 'boolean' : 'string',
        description: def.description,
        inputType:   def.inputType,
        isRequired:  def.isRequired,
        isEncrypted: def.isEncrypted,
        updatedBy,
      },
    });
    saved.push(key);
  }

  // Cleared rather than left to expire, so the next email or payment uses what
  // was just saved instead of the previous value for up to a minute.
  clearSettingsCache();

  await QueueService.logAudit({
    userId:   updatedBy,
    action:   'INTEGRATION_SETTINGS_UPDATED',
    entity:   'systemSetting',
    entityId: group,
    // Keys only. The values are the credentials themselves.
    newValue: { group, saved, skipped },
  });

  return { saved, skipped };
}
