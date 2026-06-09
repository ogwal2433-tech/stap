import nodemailer from 'nodemailer';

export const transporter = nodemailer.createTransport({
  host: 'sandbox.smtp.mailtrap.io',
  port: 2525,
  auth: {
    user: 'f83492aca3f6ec',
    pass: 'dfd1619b08ed4a',
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
    from:        '"STAP Security Ltd" <no-reply@stapsecurity.co.ug>',
    to:          opts.to,
    subject:     opts.subject,
    html:        opts.html,
    text:        opts.text ?? opts.subject,
    attachments: opts.attachments,
  });
}
