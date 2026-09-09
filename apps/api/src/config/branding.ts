import { resolveBranding } from '@stap/shared';

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
