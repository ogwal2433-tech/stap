import prisma from '../db/prisma';

type Severity = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';
type Category = 'SYSTEM' | 'API' | 'DATABASE' | 'PAYMENT' | 'AUTH' | 'EXTERNAL_API' | 'UNKNOWN';

interface ErrorLogInput {
  message:     string;
  stack?:      string;
  errorCode?:  string;
  severity?:   Severity;
  category?:   Category;
  context?:    Record<string, any>;
  route?:      string;
  method?:     string;
  statusCode?: number;
  userId?:     string;
  userRole?:   string;
  ipAddress?:  string;
  userAgent?:  string;
}

function deriveErrorCode(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('prisma') || m.includes('database') || /\bp[12]\d{3}\b/.test(m)) return 'DATABASE_ERROR';
  if (m.includes('jwt') || m.includes('token') || m.includes('unauthorized') || m.includes('unauthorised')) return 'AUTH_ERROR';
  if (m.includes('xcel') || m.includes('payment') || m.includes('momo')) return 'PAYMENT_API_ERROR';
  if (m.includes('timeout')) return 'TIMEOUT';
  if (m.includes('not found')) return 'NOT_FOUND';
  if (m.includes('validation') || m.includes('invalid')) return 'VALIDATION_ERROR';
  return 'UNHANDLED_ERROR';
}

function deriveCategory(err: any, req: any): Category {
  const m = (err?.message ?? '').toLowerCase();
  const r = (req?.path ?? '').toLowerCase();
  if (m.includes('prisma') || /\bp[12]\d{3}\b/.test(m)) return 'DATABASE';
  if (r.includes('/auth') || m.includes('jwt') || m.includes('unauthorized') || m.includes('unauthorised')) return 'AUTH';
  if (r.includes('/payment') || r.includes('/disbursement') || m.includes('xcel')) return 'PAYMENT';
  if (m.includes('axios') || m.includes('econnrefused') || m.includes('enotfound')) return 'EXTERNAL_API';
  if (req?.path) return 'API';
  return 'SYSTEM';
}

const SENSITIVE_FIELDS = ['password', 'token', 'secret', 'apiKey', 'pin', 'accessToken', 'refreshToken'];

function sanitiseBody(body: any): any {
  if (!body || typeof body !== 'object') return null;
  const safe: Record<string, any> = { ...body };
  for (const field of SENSITIVE_FIELDS) delete safe[field];
  return safe;
}

export const errorLogger = {
  /**
   * Central error capture. Must never throw — a failure here falls back to
   * console only, so logging can't itself cause an error loop.
   */
  async log(input: ErrorLogInput): Promise<void> {
    try {
      const errorCode = input.errorCode ?? deriveErrorCode(input.message);
      const route     = input.route ?? null;

      // Same message + route seen recently and still open — bump the counter
      // instead of creating a duplicate row.
      const existing = await prisma.systemError.findFirst({
        where: {
          message: input.message,
          route,
          status:  { in: ['OPEN', 'INVESTIGATING'] },
        },
        orderBy: { lastSeenAt: 'desc' },
      });

      if (existing) {
        await prisma.systemError.update({
          where: { id: existing.id },
          data: {
            occurrenceCount: { increment: 1 },
            lastSeenAt:      new Date(),
            stack:           input.stack ?? existing.stack,
            context:         input.context ?? existing.context ?? undefined,
          },
        });
      } else {
        await prisma.systemError.create({
          data: {
            errorCode,
            severity:    input.severity ?? 'ERROR',
            category:    input.category ?? 'SYSTEM',
            message:     input.message,
            stack:       input.stack ?? null,
            context:     input.context ?? undefined,
            route,
            method:      input.method ?? null,
            statusCode:  input.statusCode ?? null,
            userId:      input.userId ?? null,
            userRole:    input.userRole ?? null,
            ipAddress:   input.ipAddress ?? null,
            userAgent:   input.userAgent ?? null,
            environment: process.env.NODE_ENV ?? 'production',
            appVersion:  process.env.APP_VERSION ?? null,
            status:      'OPEN',
          },
        });
      }

      // Also surface to console so Docker/process logs still capture it
      const level = input.severity ?? 'ERROR';
      const msg   = `[${level}] ${input.route ?? 'SYSTEM'} — ${input.message}`;
      if (level === 'CRITICAL' || level === 'ERROR') {
        console.error(msg, input.stack ?? '');
      } else if (level === 'WARN') {
        console.warn(msg);
      } else {
        console.log(msg);
      }
    } catch (logErr) {
      // Never let logging crash the app — fall back to console only
      console.error('[ErrorLogger] Failed to save error:', logErr);
      console.error('[ErrorLogger] Original error:', input.message);
    }
  },

  async logFromRequest(err: any, req: any, severity: 'WARN' | 'ERROR' | 'CRITICAL' = 'ERROR'): Promise<void> {
    await this.log({
      message:    err?.message ?? 'Unknown error',
      stack:      err?.stack,
      errorCode:  err?.errorCode,
      severity,
      category:   deriveCategory(err, req),
      statusCode: err?.statusCode ?? err?.status ?? 500,
      route:      `${req?.method ?? ''} ${req?.path ?? req?.url ?? ''}`.trim() || undefined,
      method:     req?.method,
      userId:     req?.user?.userId ?? null,
      userRole:   req?.user?.role ?? null,
      ipAddress:  req?.ip ?? req?.connection?.remoteAddress,
      userAgent:  req?.headers?.['user-agent'],
      context: {
        params: req?.params,
        query:  req?.query,
        body:   sanitiseBody(req?.body), // never log passwords or tokens
      },
    });
  },
};
