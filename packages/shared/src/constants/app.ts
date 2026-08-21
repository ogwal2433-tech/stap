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
 */
export const APP_NAME    = 'STAP Security';
export const APP_TAGLINE = 'Guard Management Platform';

/** The legal entity. Unchanged by the product rename. */
export const COMPANY_NAME       = 'STAP Security Ltd';
/** Same entity as it appears on letterheads, which are set in caps. */
export const COMPANY_NAME_UPPER = 'STAP SECURITY LTD';
