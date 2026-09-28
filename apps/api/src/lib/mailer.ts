import nodemailer from 'nodemailer';
import { smtpConfig } from '../services/integrationSettings';
import { getCompanyBranding } from '../services/companyBrandingService';

/**
 * Built per send from the settings resolver rather than once at import.
 *
 * A transporter created at module load pins whatever .env held at boot, which
 * is why changing mail settings used to need a restart. The resolver caches for
 * a minute and is cleared on save, so this costs a map lookup and picks up a
 * change immediately.
 */
async function transport() {
  const cfg = await smtpConfig();
  return {
    transporter: nodemailer.createTransport({
      host:   cfg.host,
      port:   cfg.port,
      secure: cfg.secure,
      auth:   { user: cfg.auth.user, pass: cfg.auth.pass },
    }),
    from: cfg.from,
    configured: Boolean(cfg.host && cfg.auth.user && cfg.auth.pass),
  };
}

/** True once a host, user and password resolve from either source. */
export const mailerConfigured = async (): Promise<boolean> => (await transport()).configured;

/**
 * Confirms the host is reachable and the credentials are accepted, without
 * sending anything. Used by the worker at start-up and by the Test button.
 */
export async function verifyMailer(): Promise<{ ok: boolean; error?: string }> {
  const { transporter, configured } = await transport();
  if (!configured) {
    return { ok: false, error: 'SMTP is not configured. Set it in Settings → Integrations.' };
  }
  try {
    await transporter.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function sendEmail(opts: {
  to:           string;
  subject:      string;
  html:         string;
  text?:        string;
  attachments?: Array<{ filename: string; content: Buffer; contentType: string }>;
}) {
  const { transporter, from, configured } = await transport();
  if (!configured) {
    throw new Error('SMTP is not configured. Set it in Settings → Integrations.');
  }
  const companyName = (await getCompanyBranding()).company_name;
  return transporter.sendMail({
    // The company, not the platform: recipients are its guards and clients, and
    // a display name that does not match the sending domain reads as spoofing
    // to both people and spam filters.
    from:        `"${companyName}" <${from}>`,
    to:          opts.to,
    subject:     opts.subject,
    html:        opts.html,
    text:        opts.text ?? opts.subject,
    attachments: opts.attachments,
  });
}
