import { Router, type IRouter } from 'express';
import rateLimit from 'express-rate-limit';
import { LoginSchema } from '@stap/shared';
import { authService } from '../services/authService';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/authenticate';
import { asyncHandler } from '../utils/asyncHandler';
import prisma from '../db/prisma';
import { UnauthorisedError } from '../errors/AppError';

const router: IRouter = Router();

const REFRESH_COOKIE = 'refreshToken';
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/api/v1/auth/refresh',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
};

const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many login attempts. Try again later.' },
});

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
