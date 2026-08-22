import nodemailer from 'nodemailer';
import { COMPANY_NAME } from '@stap/shared';

const SMTP_HOST = process.env.SMTP_HOST ?? 'sandbox.smtp.mailtrap.io';
const SMTP_PORT = parseInt(process.env.SMTP_PORT ?? '2525', 10);

/**
 * Implicit TLS on 465, STARTTLS everywhere else.
 *
 * Getting this wrong does not degrade — it hangs. A client that speaks plain
 * SMTP to an implicit-TLS port waits for a greeting that never arrives, and the
 * send times out rather than reporting a configuration problem. SMTP_SECURE
 * overrides for providers that put implicit TLS on a non-standard port.
 */
const SMTP_SECURE = process.env.SMTP_SECURE
  ? process.env.SMTP_SECURE === 'true'
  : SMTP_PORT === 465;

/**
 * The envelope sender.
 *
 * Must be the mailbox SMTP_USER authenticates as, or an alias of it. Providers
 * reject a From on a domain the session has not authenticated for — Titan
 * answers 550 — and anything that slips through fails SPF and DKIM at the
 * recipient, so it lands in spam rather than bouncing. Defaults to SMTP_USER
 * for that reason: the address that logged in is the one address always
 * allowed to send.
 */
const SMTP_FROM = process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@stapsecurity.co.ug';

export const transporter = nodemailer.createTransport({
  host:   SMTP_HOST,
  port:   SMTP_PORT,
  secure: SMTP_SECURE,
  auth: {
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
  },
});

/** True once credentials are configured — lets callers skip work that would fail. */
export const mailerConfigured = (): boolean =>
  Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);

/**
 * Confirms the host is reachable and the credentials are accepted, without
 * sending anything. Called at worker start so a bad password shows up in the
 * logs on deploy rather than silently swallowing every queued mail.
 */
export async function verifyMailer(): Promise<{ ok: boolean; error?: string }> {
  if (!mailerConfigured()) {
    return { ok: false, error: 'SMTP_USER and SMTP_PASS are not set' };
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
  return transporter.sendMail({
    // The company, not the platform: recipients are its guards and clients, and
    // a display name that does not match the sending domain reads as spoofing
    // to both people and spam filters.
    from:        `"${COMPANY_NAME}" <${SMTP_FROM}>`,
    to:          opts.to,
    subject:     opts.subject,
    html:        opts.html,
    text:        opts.text ?? opts.subject,
    attachments: opts.attachments,
  });
}
