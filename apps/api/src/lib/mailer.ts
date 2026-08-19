import nodemailer from 'nodemailer';
import { COMPANY_NAME } from '@stap/shared';

export const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? 'sandbox.smtp.mailtrap.io',
  port: parseInt(process.env.SMTP_PORT ?? '2525', 10),
  auth: {
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
  },
});

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
    from:        `"${COMPANY_NAME}" <no-reply@stapsecurity.co.ug>`,
    to:          opts.to,
    subject:     opts.subject,
    html:        opts.html,
    text:        opts.text ?? opts.subject,
    attachments: opts.attachments,
  });
}
