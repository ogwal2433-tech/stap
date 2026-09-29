/**
 * Product and company identity.
 *
 * Two different things that are spelled almost the same:
 *
 *  APP_NAME     the software itself — browser tab, sidebar, login screen.
 *  COMPANY_NAME the legal entity guards are employed by and clients contract
 *               with. It appears on invoices, letters, ID cards, contracts and
 *               anything addressed to a client, where naming the platform
 *               instead would leave the reader unsure who wrote to them.
 *
 * Renaming the product is a change here; renaming the business is not the same
 * decision and is deliberately a separate constant.
 *
 * Both are resolved from the environment rather than fixed, because one server
 * runs more than one branding of this code at once. The software has already
 * been renamed to Security360 and back again in this repository; a deployment
 * that carries its own name cannot force that churn on the others.
 */

export const DEFAULT_APP_NAME     = 'Security360';
export const DEFAULT_APP_TAGLINE  = 'Guard Management Platform';
export const DEFAULT_COMPANY_NAME = 'Security360 Ltd';

export interface Branding {
  appName:          string;
  appTagline:       string;
  /** The legal entity. Not renamed by renaming the product. */
  companyName:      string;
  /** Same entity as it appears on letterheads, which are set in caps. */
  companyNameUpper: string;
}

/**
 * Reads branding out of an environment bag.
 *
 * Takes the bag as an argument rather than touching `process.env` or
 * `import.meta.env` directly: this module is bundled for both the browser and
 * Node, and only one of those exists in each. The caller knows which it has.
 *
 * `VITE_`-prefixed keys win because that is the only form Vite will expose to
 * the browser bundle; the bare names are what the API is given.
 */
export function resolveBranding(env: Record<string, string | undefined> = {}): Branding {
  const pick = (name: string, fallback: string): string => {
    const value = env[`VITE_${name}`] ?? env[name];
    return value && value.trim() ? value.trim() : fallback;
  };

  const appName     = pick('APP_NAME', DEFAULT_APP_NAME);
  const companyName = pick('COMPANY_NAME', DEFAULT_COMPANY_NAME);

  return {
    appName,
    appTagline:  pick('APP_TAGLINE', DEFAULT_APP_TAGLINE),
    companyName,
    // Derived rather than configured separately: a deployment that set one and
    // forgot the other would print two different company names on one letter.
    companyNameUpper: pick('COMPANY_NAME_UPPER', companyName.toUpperCase()),
  };
}
