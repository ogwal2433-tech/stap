/**
 * Every job the system runs on a schedule.
 *
 * The single source of truth, and deliberately a short list: it holds the jobs
 * that actually exist in worker.ts, with the cron expressions they are actually
 * registered with. Listing a job here that nothing runs would put a Run Now
 * button on a page in front of a Director and tell them, falsely, that the work
 * happens on its own.
 *
 * `run` is what the Run Now button and the scheduler both call, so the two can
 * never drift into invoking different things. Adding a job means adding it in
 * worker.ts and here, in the same change.
 *
 * The services are imported inside `run` rather than at the top of the file.
 * Importing them here pulled four service modules — and everything they import —
 * into anything that merely wanted to look a key up, which was enough to load
 * guardService before @security360/shared had finished initialising and leave its
 * ROLES constant undefined. Deferring the import also keeps the routes cheap:
 * they only need the metadata.
 *
 * Not listed, because they are not scheduled:
 *   - the BullMQ queues (email, sms, audit, invoice-gen, payslip, disburse),
 *     which are event-driven — work arrives when something enqueues it;
 *   - report schedules, which users create at runtime and which live in
 *     ScheduledReport rather than in code.
 */
export interface JobDefinition {
  key:         string;
  name:        string;
  description: string;
  cronExpr:    string;
  cronHuman:   string;
  category:    'invoices' | 'payroll' | 'reports' | 'maintenance' | 'payments';
  isActive:    boolean;
  /** Resolves to whatever the job wants recorded against the run. */
  run:         () => Promise<unknown>;
}

export const JOB_REGISTRY: JobDefinition[] = [
  // ── Invoices ────────────────────────────────────────────────────────────────
  {
    key:         'invoice.generate.auto',
    name:        'Automatic Invoice Generation',
    description:
      'Switched off: month-end invoices are now raised manually from Finance '
      + 'by the assistant manager and issued by the MD. Kept for reference and '
      + 'an explicit Run Now.',
    cronExpr:    '0 6 * * *',
    cronHuman:   'Every day at 6:00 AM',
    category:    'invoices',
    isActive:    false,
    run:         async () => (await import('../services/invoiceService')).invoiceService.generateAutoInvoices(),
  },
  {
    key:         'invoice.email.due',
    name:        'Due Invoice Emails',
    description:
      'Emails invoices that are due or overdue and have not yet been sent to the '
      + 'client. Also runs once when the worker starts, to catch anything missed '
      + 'while it was down.',
    cronExpr:    '0 7 * * *',
    cronHuman:   'Every day at 7:00 AM',
    category:    'invoices',
    isActive:    true,
    run:         async () => (await import('../jobs/invoiceCron')).runInvoiceEmailJob(),
  },

  // ── Payroll ─────────────────────────────────────────────────────────────────
  {
    key:         'guard.salary.increment',
    name:        'Guard Salary Increments',
    description:
      'Applies each guard\'s contract-anniversary increment. Checked daily rather '
      + 'than annually because anniversaries fall on every date of the year, not '
      + 'on one common date.',
    cronExpr:    '0 7 * * *',
    cronHuman:   'Every day at 7:00 AM',
    category:    'payroll',
    isActive:    true,
    run:         async () => (await import('../services/guardService')).guardService.runSalaryIncrements(),
  },
  {
    key:         'guard.probation.check',
    name:        'Probation Status Check',
    description:
      'Moves guards off probation once their probation period has elapsed, and '
      + 'flags those approaching the end of it.',
    cronExpr:    '0 6 * * *',
    cronHuman:   'Every day at 6:00 AM',
    category:    'payroll',
    isActive:    true,
    run:         async () => (await import('../services/guardService')).guardService.runProbationCheck(),
  },

  // ── Maintenance ─────────────────────────────────────────────────────────────
  {
    key:         'contract.status.refresh',
    name:        'Contract Status Refresh',
    description:
      'Re-evaluates every contract against today\'s date, moving them to EXPIRED '
      + 'once their end date passes and surfacing those close to expiry.',
    cronExpr:    '0 6 * * *',
    cronHuman:   'Every day at 6:00 AM',
    category:    'maintenance',
    isActive:    true,
    run:         async () => (await import('../services/contractService')).contractService.runStatusRefresh(),
  },
  {
    key:         'inventory.lowstock.check',
    name:        'Low Stock Check',
    description:
      'Compares inventory levels against each item\'s reorder point and notifies '
      + 'stores when something has fallen below it.',
    cronExpr:    '0 7 * * *',
    cronHuman:   'Every day at 7:00 AM',
    category:    'maintenance',
    isActive:    true,
    run:         async () => (await import('../services/inventoryService')).inventoryService.runLowStockCheck(),
  },
];

/** The timezone every cron above is registered with in worker.ts. */
export const JOB_TIMEZONE = 'Africa/Kampala';

export const jobDefinition = (key: string): JobDefinition | undefined =>
  JOB_REGISTRY.find((j) => j.key === key);
