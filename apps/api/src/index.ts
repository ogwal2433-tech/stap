import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';

dotenv.config();

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

// ── Middleware ─────────────────────────────────────────────────────────────────
import { errorHandler } from './middleware/errorHandler';

const app: Express = express();
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

// ── Routes ─────────────────────────────────────────────────────────────────────
app.get('/api/v1/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/v1', apiRouter);

// ── Global error handler (must be last) ───────────────────────────────────────
app.use(errorHandler);

// ── Start server ───────────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
  console.log('⚙️  Queue workers initialised');
});

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

export default app;
