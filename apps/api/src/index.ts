import dotenv from 'dotenv';
dotenv.config();

import './bootstrap';
import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import cron from 'node-cron';

// ── Ensure upload directories exist ───────────────────────────────────────────
[
  './public/uploads/temp',
  './public/uploads/guards',
  './public/uploads/invoices',
  './public/uploads/payslips',
  './public/uploads/letters',
].forEach(dir => fs.mkdirSync(dir, { recursive: true }));

// ── Queue workers (initialise on startup) ──────────────────────────────────────
import { auditWorker } from './jobs/workers/auditWorker';
import { emailWorker } from './jobs/workers/emailWorker';
import { smsWorker } from './jobs/workers/smsWorker';
import { invoiceWorker } from './jobs/workers/invoiceWorker';
import { payslipWorker } from './jobs/workers/payslipWorker';
import { disburseWorker } from './jobs/workers/disburseWorker';
import { queues } from './jobs/queues';

// ── Routes ─────────────────────────────────────────────────────────────────────
import apiRouter from './routes/index';

// ── Swagger ────────────────────────────────────────────────────────────────────
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './lib/swagger';

// ── Services ───────────────────────────────────────────────────────────────────
import { contractService } from './services/contractService';
import { invoiceService } from './services/invoiceService';
import { reportService } from './services/reportService';
import { inventoryService } from './services/inventoryService';
import { guardService } from './services/guardService';
import { runInvoiceEmailJob } from './jobs/invoiceCron';

// ── Middleware ─────────────────────────────────────────────────────────────────
import { errorHandler } from './middleware/errorHandler';
import { authenticate } from './middleware/authenticate';
import { errorLogger } from './services/errorLogger';

const app: Express = express();
// Trust the first proxy (Nginx) — required when running behind a reverse proxy
// This allows express-rate-limit to correctly identify client IPs
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3001;

// ── Core middleware ────────────────────────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  }),
);
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ── Static files — uploaded files require authentication ──────────────────────
app.use('/uploads', authenticate, express.static(path.join(__dirname, '../public/uploads')));

// ── Routes ─────────────────────────────────────────────────────────────────────
app.get('/api/v1/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/v1', apiRouter);

// ── Swagger UI (dev + staging) ─────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_SWAGGER === 'true') {
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'STAP Security API Docs',
  }));
  app.get('/api/docs.json', (_req, res) => res.json(swaggerSpec));
  console.log('📖 API docs: http://localhost:3001/api/docs');
}

// ── Dev letter preview (non-production only) ──────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { buildPreviewHtml } = require('./lib/pdfBase') as typeof import('./lib/pdfBase');
  app.get('/dev/letter-preview', (_req, res) => {
    const sampleContent = `
      <div style="display:flex;justify-content:space-between;margin-bottom:24px;font-size:10pt;color:#444;">
        <span>Ref: STAP/2026/VW/001</span>
        <span>10 June 2026</span>
      </div>
      <p><strong>To:</strong> John Doe &nbsp;|&nbsp; NIN: CM12345 &nbsp;|&nbsp; Position: Security Guard</p>
      <p style="font-weight:bold;text-decoration:underline;margin:16px 0;">VERBAL WARNING — MISCONDUCT</p>
      <p>This letter serves as formal documentation of a verbal warning issued to you on <strong>10 June 2026</strong>.</p>
      <p>You were verbally informed of this matter and reminded of the conduct standards required of all STAP Security Ltd employees. You are expected to improve your conduct with immediate effect.</p>
      <p><strong>Outcome:</strong> Verbal warning issued. No further action at this time.</p>
      <p>Should a similar incident recur, a written warning will be issued. Repeated misconduct may result in suspension or termination of employment.</p>
      <div style="margin-top:40px;">
        <p>Yours sincerely,</p>
        <div style="border-top:1px solid #333;width:200px;margin:30px 0 4px;"></div>
        <p><strong>Director</strong></p>
        <p>For: STAP Security Ltd</p>
      </div>
    `;
    res.setHeader('Content-Type', 'text/html');
    res.send(buildPreviewHtml(sampleContent));
  });
  console.log('🔍 Letter preview: http://localhost:3001/dev/letter-preview');
}

// ── Global error handler (must be last) ───────────────────────────────────────
app.use(errorHandler);

// ── Start server ───────────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
  console.log('⚙️  Queue workers initialised');
});

// ── Scheduled jobs ─────────────────────────────────────────────────────────────
// Refresh contract statuses daily at 06:00 EAT (Africa/Kampala)
cron.schedule('0 6 * * *', () => contractService.runStatusRefresh(), {
  timezone: 'Africa/Kampala',
});

// Auto-generate invoices for active contracts on their billing day
cron.schedule('0 6 * * *', () => invoiceService.generateAutoInvoices(), {
  timezone: 'Africa/Kampala',
});

// Email due/overdue invoices that haven't been sent yet — daily at 07:00 EAT
cron.schedule('0 7 * * *', () => runInvoiceEmailJob(), {
  timezone: 'Africa/Kampala',
});
// Also run on startup to catch any missed sends
runInvoiceEmailJob().catch(console.error);

// Initialise any persisted scheduled reports on startup
reportService.initScheduledReports();

// Daily low stock check at 07:00 EAT
cron.schedule('0 7 * * *', () => inventoryService.runLowStockCheck(), {
  timezone: 'Africa/Kampala',
});

// Daily probation status check at 06:00 EAT
cron.schedule('0 6 * * *', async () => {
  console.log('⏰ Running probation check...');
  await guardService.runProbationCheck();
}, { timezone: 'Africa/Kampala' });

// Annual salary increment check — runs every day at 07:00 EAT
// Applies UGX 20,000 (year 1) or UGX 10,000 (subsequent years) on each guard's contract anniversary
cron.schedule('0 7 * * *', async () => {
  console.log('⏰ Running annual salary increments...');
  try {
    await guardService.runSalaryIncrements();
  } catch (err) {
    console.error('❌ Salary increment cron failed:', err);
  }
}, { timezone: 'Africa/Kampala' });

// ── Graceful shutdown ──────────────────────────────────────────────────────────
const workers = [auditWorker, emailWorker, smsWorker, invoiceWorker, payslipWorker, disburseWorker];

async function gracefulShutdown(signal: string) {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);

  server.close();

  await Promise.all([
    ...Object.values(queues).map((q) => q.close()),
    ...workers.map((w) => w.close()),
  ]);

  console.log('All queues and workers closed.');
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

process.on('unhandledRejection', (reason: any) => {
  void errorLogger.log({
    message:   reason?.message ?? String(reason),
    stack:     reason?.stack,
    severity:  'CRITICAL',
    category:  'SYSTEM',
    errorCode: 'UNHANDLED_REJECTION',
  });
});

process.on('uncaughtException', (err: Error) => {
  void errorLogger.log({
    message:   err.message,
    stack:     err.stack,
    severity:  'CRITICAL',
    category:  'SYSTEM',
    errorCode: 'UNCAUGHT_EXCEPTION',
  });
  // Give the logger a moment to persist before crashing — an uncaught
  // exception leaves the process in an undefined state, so we must exit.
  setTimeout(() => process.exit(1), 1000);
});

export default app;
