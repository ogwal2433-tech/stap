import { Worker } from 'bullmq';
import { redisConnection } from '../../lib/redis';
import { sendEmail, mailerConfigured, verifyMailer } from '../../lib/mailer';
import { renderEmail } from '../templates/emailTemplates';
import { errorLogger } from '../../services/errorLogger';
import type { EmailJobData } from '../QueueService';

/**
 * Sends the queued mail.
 *
 * This used to log the job and return, which BullMQ counts as success — so
 * every welcome email, password reset, requisition approval and incident alert
 * was discarded with no failed job and nothing in the logs to show for it. The
 * two senders that call lib/mailer directly (letters, invoice delivery) worked
 * throughout, which made the gap look like an intermittent mail problem rather
 * than a whole path that was never wired up.
 */
export const emailWorker = new Worker<EmailJobData>(
  'email',
  async (job) => {
    const { to, subject, template, data } = job.data;

    // Throw rather than return: an unconfigured mailer must leave the job in
    // the queue to retry after credentials are set, not silently succeed.
    // Awaited: the check resolves settings from the database now, and a bare
    // Promise is always truthy — the guard would never fire.
    if (!(await mailerConfigured())) {
      throw new Error('SMTP is not configured — set it in Settings → Integrations');
    }

    const html = renderEmail(template, subject, data ?? {});
    const info = await sendEmail({ to, subject, html });

    console.log(`📧 Sent "${subject}" to ${to} (${(info as { messageId?: string }).messageId ?? 'no id'})`);
  },
  { connection: redisConnection },
);

emailWorker.on('failed', (job, err) => {
  console.error(`Email job ${job?.id} failed after ${job?.attemptsMade} attempts:`, err.message);
  // Surfaced on the System Errors page once retries are exhausted, so a wrong
  // password or a blocked port is visible to someone who can fix it.
  if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
    void errorLogger.log({
      message:   `Email to ${job.data.to} failed: ${err.message}`,
      errorCode: 'EMAIL_SEND_FAILED',
      severity:  'ERROR',
      category:  'EXTERNAL_API',
      context:   { to: job.data.to, subject: job.data.subject, template: job.data.template },
    });
  }
});

// Checked once at start-up so bad credentials appear in the deploy logs rather
// than as a queue that quietly fills with retries. Skipped under test, where it
// would open a real connection to the mail host on import.
if (process.env.NODE_ENV !== 'test') {
  void verifyMailer().then(({ ok, error }) => {
    if (ok) console.log('📧 SMTP ready');
    else    console.warn(`⚠️  SMTP not ready — queued email will fail: ${error}`);
  });
}
