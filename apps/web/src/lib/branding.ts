import { resolveBranding, resolveCompanyBrandingDefaults } from '@security360/shared';

/**
 * What this build of the frontend calls itself.
 *
 * Fixed when the bundle is built, not when it is served: the output is static
 * files behind nginx, so there is no server to ask at page load. Each branded
 * deployment therefore builds its own image with its own VITE_APP_NAME, which
 * is what lets two of them sit on one host under different names.
 *
 * Imported instead of `@security360/shared`'s raw constants anywhere the name is shown
 * to someone. The shared module holds the defaults; this holds what this
 * deployment actually is.
 */
const branding = resolveBranding(import.meta.env as unknown as Record<string, string | undefined>);

export const APP_NAME           = branding.appName;
export const APP_TAGLINE        = branding.appTagline;
export const COMPANY_NAME       = branding.companyName;
export const COMPANY_NAME_UPPER = branding.companyNameUpper;

/**
 * Company details to show until the API's saved branding arrives. The API
 * holds the authoritative defaults; this only keeps the first paint on brand.
 */
export const COMPANY_BRANDING_DEFAULTS = resolveCompanyBrandingDefaults(import.meta.env as unknown as Record<string, string | undefined>);

/**
 * Prefix for anything the user downloads, e.g. Security360_Guards_2026-09-23.xlsx.
 *
 * Derived from the product name rather than written out, so each branded
 * deployment names its own files. Punctuation and spaces collapse to
 * underscores because a filename carrying either is awkward to handle once it
 * reaches someone's machine.
 */
export const FILE_PREFIX = APP_NAME.trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
