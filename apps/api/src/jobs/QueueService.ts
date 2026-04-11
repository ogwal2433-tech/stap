import { emailQueue, smsQueue, auditQueue, invoiceQueue, payslipQueue, disburseQueue } from './queues';

// ─── Job data types ────────────────────────────────────────────────────────────

export interface AuditJobData {
  userId?: string;
  action: string;
  entity: string;
  entityId: string;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export interface EmailJobData {
  to: string;
  subject: string;
  template: string;
  data: Record<string, unknown>;
}

export interface SmsJobData {
  to: string;
  message: string;
}

export interface InvoiceJobData {
  clientId: string;
  contractId: string;
  periodStart: string;
  periodEnd: string;
}

export interface PayslipJobData {
  guardId: string;
  payrollRunId: string;
  periodStart: string;
  periodEnd: string;
}

export interface DisburseJobData {
  payrollRunId: string;
  guardIds: string[];
}

// ─── QueueService ──────────────────────────────────────────────────────────────

export class QueueService {
  static async sendEmail(data: EmailJobData) {
    return emailQueue.add('send-email', data);
  }

  static async sendSms(data: SmsJobData) {
    return smsQueue.add('send-sms', data);
  }

  static async logAudit(data: AuditJobData) {
    return auditQueue.add('log-audit', data);
  }

  static async generateInvoice(data: InvoiceJobData) {
    return invoiceQueue.add('generate-invoice', data);
  }

  static async generatePayslip(data: PayslipJobData) {
    return payslipQueue.add('generate-payslip', data);
  }

  static async disburse(data: DisburseJobData) {
    return disburseQueue.add('disburse', data);
  }
}
