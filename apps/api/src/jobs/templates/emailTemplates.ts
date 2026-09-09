import { COMPANY_NAME, APP_NAME } from '@stap/shared';

/**
 * Email bodies for the queued mail templates.
 *
 * Deliberately plain HTML with inline styles and no template engine: mail
 * clients strip <style> blocks and external stylesheets, and the set of
 * templates is small and stable enough that a dependency would cost more than
 * it saves.
 */

/** Job data reaches here unsanitised, and some of it is user-supplied. */
function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const NAVY = '#1B3A6B';
const GOLD = '#F2AA20';

function layout(title: string, body: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#F2F4F7;font-family:Arial,Helvetica,sans-serif;color:#1A1A1A;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F4F7;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;overflow:hidden;">
        <tr><td style="background:${NAVY};padding:18px 24px;">
          <div style="color:#ffffff;font-size:18px;font-weight:bold;">${esc(COMPANY_NAME)}</div>
        </td></tr>
        <tr><td style="background:${GOLD};height:4px;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:24px;">
          <h2 style="margin:0 0 14px;font-size:18px;color:${NAVY};">${esc(title)}</h2>
          ${body}
        </td></tr>
        <tr><td style="padding:16px 24px;background:#F2F4F7;color:#6c757d;font-size:12px;">
          Sent by ${esc(APP_NAME)}. If you were not expecting this, please contact your administrator.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

const p     = (t: string) => `<p style="margin:0 0 12px;font-size:14px;line-height:1.5;">${t}</p>`;
const label = (k: string, v: unknown) =>
  `<tr><td style="padding:4px 12px 4px 0;font-size:13px;color:#6c757d;">${esc(k)}</td>` +
  `<td style="padding:4px 0;font-size:13px;font-weight:bold;">${esc(v)}</td></tr>`;
const table  = (rows: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 14px;">${rows}</table>`;
const button = (href: string, text: string) =>
  `<p style="margin:18px 0 0;"><a href="${esc(href)}" style="background:${NAVY};color:#ffffff;` +
  `text-decoration:none;padding:10px 18px;border-radius:6px;font-size:14px;display:inline-block;">${esc(text)}</a></p>`;

const rows = (d: Record<string, unknown>) =>
  table(Object.entries(d).map(([k, v]) => label(k, v)).join(''));

/** A cautionary aside — used for "change this password" and similar. */
const notice = (text: string) =>
  `<div style="background:#FEF9E7;border-left:3px solid ${GOLD};border-radius:4px;` +
  `padding:10px 14px;margin:14px 0 0;font-size:12px;color:#856404;">${esc(text)}</div>`;

/** Plain list. Mail clients render <ul> inconsistently, so rows of text it is. */
const bullets = (items: string[]) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 0;">` +
  items.map((i) => `<tr><td style="padding:3px 0;font-size:13px;color:#4A5568;">• ${esc(i)}</td></tr>`).join('') +
  `</table>`;

/**
 * The link a recipient uses to sign in. Falls back to no button rather than a
 * dead `/login` when FRONTEND_URL is unset, which is what an empty base gives.
 */
export function loginUrl(): string {
  const base = (process.env.FRONTEND_URL ?? '').replace(/\/+$/, '');
  return base ? `${base}/login` : '';
}

export function renderEmail(template: string, subject: string, d: Record<string, unknown>): string {
  switch (template) {
    case 'welcome':
      return layout('Your account is ready', [
        p(`Hello ${esc(d.name)},`),
        p('An account has been created for you. Sign in with the details below, then change your password once you are in.'),
        table(label('Email', d.email)
              + (d.password ? label('Temporary password', d.password) : '')
              + (d.role ? label('Role', d.role) : '')),
        d.loginUrl ? button(String(d.loginUrl), 'Sign in') : '',
      ].join(''));

    case 'client-portal-welcome':
      // Addressed to a customer rather than a colleague, so it says what the
      // portal is for instead of assuming they already know.
      return layout('Your client portal is ready', [
        p(`Dear ${esc(d.contactName ?? d.name)},`),
        p(`An account has been set up for <strong>${esc(d.clientName)}</strong> on the ` +
          `${esc(COMPANY_NAME)} client portal. Sign in with the details below.`),
        table(label('Email', d.email) + label('Temporary password', d.password)),
        d.loginUrl ? button(String(d.loginUrl), 'Open the portal') : '',
        p('<strong style="font-size:13px;">Through the portal you can:</strong>') +
          bullets([
            'View and download your invoices',
            'Submit service requests',
            'Raise and track complaints',
            'See your sites and their deployments',
          ]),
        notice('Please change this password after you sign in, and keep it to yourself.'),
      ].join(''));

    case 'password-reset':
      return layout('Your password has been reset', [
        p(`Hello ${esc(d.name)},`),
        p('An administrator has reset your password. Use the password below to sign in, then change it immediately.'),
        table(label('Email', d.email) + label('New password', d.password)),
        d.loginUrl ? button(String(d.loginUrl), 'Sign in') : '',
      ].join(''));

    case 'notification':
      return layout(String(d.title ?? subject), p(esc(d.message)));

    case 'requisition-approval':
      return layout('A requisition needs your approval',
        p('A requisition has been submitted and is waiting on your decision.') + rows(d));

    case 'invoice':
      return layout(subject, p('Please find your invoice details below.') + rows(d));

    case 'incident-alert':
      return layout(subject, p('An incident has been reported that needs attention.') + rows(d));

    case 'scheduled-report':
      return layout(String(d.reportName ?? subject), p('Your scheduled report is ready.') + rows(d));

    default:
      // An unrecognised template must still deliver something readable rather
      // than dropping the message.
      return layout(subject, rows(d));
  }
}
