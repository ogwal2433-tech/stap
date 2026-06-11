import { Router, type IRouter } from 'express';
import rateLimit from 'express-rate-limit';
import { LoginSchema, ROLES } from '@stap/shared';
import { authService } from '../services/authService';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/rbac';
import { asyncHandler } from '../utils/asyncHandler';
import prisma from '../db/prisma';
import { UnauthorisedError } from '../errors/AppError';

const router: IRouter = Router();

const REFRESH_COOKIE = 'refreshToken';
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: (process.env.NODE_ENV === 'production' ? 'none' : 'lax') as 'none' | 'lax',
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

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

    if (!result) {
      res.status(401).json({ success: false, error: 'Invalid credentials' });
      return;
    }

    res.cookie(REFRESH_COOKIE, result.refreshToken, REFRESH_COOKIE_OPTIONS);

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
    res.cookie(REFRESH_COOKIE, refreshToken, REFRESH_COOKIE_OPTIONS);

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

    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_OPTIONS.path });

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

export default router;
