import { Router, type IRouter } from 'express';
import rateLimit from 'express-rate-limit';
import { LoginSchema, ROLES } from '@stap/shared';
import { authService, loginFailureMessage } from '../services/authService';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/rbac';
import { asyncHandler } from '../utils/asyncHandler';
import prisma from '../db/prisma';
import { UnauthorisedError } from '../errors/AppError';

const router: IRouter = Router();

const REFRESH_COOKIE = 'refreshToken';
const REFRESH_COOKIE_PATH = '/';

/**
 * Whether the refresh cookie may carry the Secure attribute.
 *
 * A Secure cookie is discarded by the browser over plain HTTP — silently, with
 * no error anywhere. Keying this off NODE_ENV assumed production always means
 * HTTPS, which it does not: nginx serves this app over plain HTTP on the bare
 * IP alongside the TLS host. On that address the refresh cookie was never
 * stored, and since the access token lives only in memory and every page load
 * bootstraps through /auth/refresh, the first reload after signing in landed
 * back on the login screen.
 *
 * Derived from the scheme the app is actually served on, with COOKIE_SECURE as
 * an explicit override for setups that terminate TLS somewhere this cannot see.
 */
function useSecureCookie(): boolean {
  if (process.env.COOKIE_SECURE) return process.env.COOKIE_SECURE === 'true';
  return (process.env.FRONTEND_URL ?? '').startsWith('https://');
}

/**
 * SameSite=Lax, not None.
 *
 * None was pinned to production and is the stricter requirement of the two: it
 * is only honoured alongside Secure, so it made HTTPS mandatory for a cookie
 * that did not need cross-site delivery in the first place. The frontend calls
 * the API on a relative /api/v1 path through the same nginx, so every request
 * carrying this cookie is same-origin. Lax delivers on those and withholds it
 * from cross-site POSTs, which is the CSRF protection None was giving up.
 */
function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure:   useSecureCookie(),
    sameSite: 'lax' as const,
    path:     REFRESH_COOKIE_PATH,
    maxAge:   7 * 24 * 60 * 60 * 1000,
  };
}

const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many login attempts. Please try again in 15 minutes.' },
});

/**
 * @openapi
 * /api/v1/auth/login:
 *   post:
 *     tags: [Authentication]
 *     summary: Login with email and password
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: director@stapsecurity.co.ug
 *               password:
 *                 type: string
 *                 example: "12345678"
 *     responses:
 *       200:
 *         description: Login successful — returns accessToken and user profile
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       400:
 *         description: Validation error (missing/invalid fields)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error400'
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error401'
 *       423:
 *         description: Account locked after too many failed attempts
 */
// POST /login
router.post(
  '/login',
  loginRateLimiter,
  validate(LoginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as { email: string; password: string };
    const ip = req.ip;
    const ua = req.headers['user-agent'];

    const result = await authService.login(email, password, ip, ua);

    // A string result is a refusal reason rather than a session. How much of it
    // the caller is told is decided in loginFailureMessage() — detailed in
    // development, a single generic answer in production, because telling an
    // unknown email apart from a wrong password enumerates accounts.
    if (typeof result === 'string') {
      res.status(401).json({ success: false, error: loginFailureMessage(result) });
      return;
    }

    res.cookie(REFRESH_COOKIE, result.refreshToken, refreshCookieOptions());

    res.status(200).json({
      success: true,
      data: {
        accessToken: result.accessToken,
        user: result.user,
      },
    });
  }),
);

// POST /refresh
router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const token: string | undefined = req.cookies?.[REFRESH_COOKIE];

    if (!token) {
      throw new UnauthorisedError('No refresh token provided');
    }

    const ip = req.ip;
    const ua = req.headers['user-agent'];

    const { accessToken, refreshToken } = await authService.refresh(token, ip, ua);

    // Rotate cookie
    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());

    res.status(200).json({
      success: true,
      data: { accessToken },
    });
  }),
);

// POST /logout
router.post(
  '/logout',
  authenticate,
  asyncHandler(async (req, res) => {
    await authService.logout(req.user!.userId, req.ip, req.headers['user-agent']);

    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });

    res.status(200).json({ success: true });
  }),
);

// GET /me
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new UnauthorisedError();
    }

    res.status(200).json({ success: true, data: user });
  }),
);

/** Exposed for tests only — see auth/loginErrors.test.ts. */
export const __testRefreshCookieOptions = refreshCookieOptions;

export default router;
