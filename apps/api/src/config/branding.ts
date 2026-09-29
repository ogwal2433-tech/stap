import { resolveBranding, resolveCompanyBrandingDefaults } from '@security360/shared';

/**
 * What this deployment calls itself, read at boot.
 *
 * The API can resolve this at runtime where the frontend cannot, so a rename
 * here needs only a restart. Used for the API docs title, the log banner and
 * the subject lines of anything the platform sends.
 */
const branding = resolveBranding(process.env);

export const APP_NAME           = branding.appName;
export const APP_TAGLINE        = branding.appTagline;
export const COMPANY_NAME       = branding.companyName;
export const COMPANY_NAME_UPPER = branding.companyNameUpper;

/**
 * Company details documents fall back to when Settings > Company Branding has
 * nothing saved, and what "Reset to defaults" returns to. COMPANY_NAME,
 * COMPANY_EMAIL, COMPANY_WEBSITE and so on override the original brand's.
 */
export const COMPANY_BRANDING_DEFAULTS = resolveCompanyBrandingDefaults(process.env);

/**
 * Prefix for anything the user downloads, e.g. Security360_Guards_2026-09-23.xlsx.
 *
 * Derived from the product name rather than written out, so each branded
 * deployment names its own files. Punctuation and spaces collapse to
 * underscores because a filename carrying either is awkward to handle once it
 * reaches someone's machine.
 */
export const FILE_PREFIX = APP_NAME.trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
