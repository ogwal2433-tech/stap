import { resolveBranding } from '@stap/shared';

/**
 * What this build of the frontend calls itself.
 *
 * Fixed when the bundle is built, not when it is served: the output is static
 * files behind nginx, so there is no server to ask at page load. Each branded
 * deployment therefore builds its own image with its own VITE_APP_NAME, which
 * is what lets two of them sit on one host under different names.
 *
 * Imported instead of `@stap/shared`'s raw constants anywhere the name is shown
 * to someone. The shared module holds the defaults; this holds what this
 * deployment actually is.
 */
const branding = resolveBranding(import.meta.env as unknown as Record<string, string | undefined>);

export const APP_NAME           = branding.appName;
export const APP_TAGLINE        = branding.appTagline;
export const COMPANY_NAME       = branding.companyName;
export const COMPANY_NAME_UPPER = branding.companyNameUpper;
