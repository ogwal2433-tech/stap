import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../db/prisma', () => ({
  default: {
    systemError: {
      findFirst: vi.fn(),
      create:    vi.fn(),
      update:    vi.fn(),
    },
  },
}));

import prisma from '../../db/prisma';
import { errorLogger } from '../../services/errorLogger';

const mp = prisma as any;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  mp.systemError.findFirst.mockResolvedValue(null);
  mp.systemError.create.mockResolvedValue({ id: 'err-1' });
  mp.systemError.update.mockResolvedValue({ id: 'err-1' });
});

describe('errorLogger.log()', () => {
  it('creates a new SystemError row when nothing matches', async () => {
    await errorLogger.log({ message: 'Something broke', severity: 'ERROR', category: 'SYSTEM' });
    expect(mp.systemError.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ message: 'Something broke', severity: 'ERROR', category: 'SYSTEM', status: 'OPEN' }),
      }),
    );
  });

  it('increments occurrenceCount instead of creating a duplicate when the same open error recurs', async () => {
    mp.systemError.findFirst.mockResolvedValue({ id: 'existing-1', stack: 'old stack', context: null });
    await errorLogger.log({ message: 'Same error', route: 'GET /api/v1/guards' });
    expect(mp.systemError.create).not.toHaveBeenCalled();
    expect(mp.systemError.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'existing-1' },
        data: expect.objectContaining({ occurrenceCount: { increment: 1 } }),
      }),
    );
  });

  it('derives DATABASE_ERROR from a Prisma-flavoured message when no errorCode given', async () => {
    await errorLogger.log({ message: 'Prisma query failed: P2025 record not found' });
    expect(mp.systemError.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ errorCode: 'DATABASE_ERROR' }) }),
    );
  });

  it('derives AUTH_ERROR from a jwt/token message', async () => {
    await errorLogger.log({ message: 'jwt expired, unauthorized' });
    expect(mp.systemError.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ errorCode: 'AUTH_ERROR' }) }),
    );
  });

  it('derives PAYMENT_API_ERROR from an xcel/momo message', async () => {
    await errorLogger.log({ message: 'XCEL momo collection failed' });
    expect(mp.systemError.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ errorCode: 'PAYMENT_API_ERROR' }) }),
    );
  });

  it('falls back to UNHANDLED_ERROR for an unrecognised message', async () => {
    await errorLogger.log({ message: 'something totally unexpected happened' });
    expect(mp.systemError.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ errorCode: 'UNHANDLED_ERROR' }) }),
    );
  });

  it('respects an explicitly provided errorCode over derivation', async () => {
    await errorLogger.log({ message: 'jwt expired', errorCode: 'CUSTOM_CODE' });
    expect(mp.systemError.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ errorCode: 'CUSTOM_CODE' }) }),
    );
  });

  it('never throws even when the database write fails', async () => {
    mp.systemError.findFirst.mockRejectedValue(new Error('DB is down'));
    await expect(errorLogger.log({ message: 'anything' })).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith('[ErrorLogger] Failed to save error:', expect.any(Error));
  });
});

describe('errorLogger.logFromRequest()', () => {
  it('extracts route, user, and IP from an Express-like request', async () => {
    const req = {
      method: 'POST',
      path:   '/api/v1/guards',
      user:   { userId: 'u1', role: 'DIRECTOR' },
      ip:     '10.0.0.5',
      headers: { 'user-agent': 'test-agent' },
      params: { id: '1' },
      query:  { q: 'x' },
      body:   { name: 'Test' },
    };
    const err = new Error('Boom');

    await errorLogger.logFromRequest(err, req, 'CRITICAL');

    expect(mp.systemError.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          message:  'Boom',
          severity: 'CRITICAL',
          route:    'POST /api/v1/guards',
          method:   'POST',
          userId:   'u1',
          userRole: 'DIRECTOR',
          ipAddress: '10.0.0.5',
          userAgent: 'test-agent',
        }),
      }),
    );
  });

  it('strips password/token/secret fields from the logged request body', async () => {
    const req = {
      method: 'POST', path: '/api/v1/auth/login',
      body: { email: 'a@b.com', password: 'hunter2', token: 'abc', secret: 'xyz', apiKey: 'k', pin: '1234' },
    };
    await errorLogger.logFromRequest(new Error('Login failed'), req);

    const call = mp.systemError.create.mock.calls[0][0];
    const loggedBody = call.data.context.body;
    expect(loggedBody).toEqual({ email: 'a@b.com' });
  });

  it('derives category PAYMENT for routes under /payment or /disbursement', async () => {
    const req = { method: 'POST', path: '/api/v1/payments/webhook/xcel' };
    await errorLogger.logFromRequest(new Error('XCEL webhook error'), req);
    expect(mp.systemError.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ category: 'PAYMENT' }) }),
    );
  });

  it('defaults statusCode to 500 when the error carries none', async () => {
    const req = { method: 'GET', path: '/api/v1/whatever' };
    await errorLogger.logFromRequest(new Error('Unexpected'), req);
    expect(mp.systemError.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ statusCode: 500 }) }),
    );
  });
});
