import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/rbac';
import { validate, validateQuery } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { notificationService } from '../services/notificationService';
import { NotificationPreferenceInput } from '@stap/shared';
import { ROLES } from '@stap/shared';
import { z } from 'zod';

const router = Router();

const ListQuery = z.object({
  isRead: z.enum(['true', 'false']).optional().transform(v => v === undefined ? undefined : v === 'true'),
  page:   z.coerce.number().int().min(1).default(1),
  limit:  z.coerce.number().int().min(1).max(100).default(20),
});

router.use(authenticate);

// GET /notifications
router.get(
  '/',
  validateQuery(ListQuery),
  asyncHandler(async (req, res) => {
    const result = await notificationService.getForUser(req.user!.userId, req.query as any);
    res.json({ success: true, ...result });
  }),
);

// GET /notifications/unread-count
router.get(
  '/unread-count',
  asyncHandler(async (req, res) => {
    const count = await notificationService.getUnreadCount(req.user!.userId);
    res.json({ success: true, data: { count } });
  }),
);

// PATCH /notifications/mark-all-read
router.patch(
  '/mark-all-read',
  asyncHandler(async (req, res) => {
    await notificationService.markAllAsRead(req.user!.userId);
    res.json({ success: true });
  }),
);

// PATCH /notifications/:id/read
router.patch(
  '/:id/read',
  asyncHandler(async (req, res) => {
    await notificationService.markAsRead(req.params.id, req.user!.userId);
    res.json({ success: true });
  }),
);

// GET /notifications/preferences/:role
router.get(
  '/preferences/:role',
  requireRole(ROLES.DIRECTOR),
  asyncHandler(async (req, res) => {
    const data = await notificationService.getPreferences(req.params.role);
    res.json({ success: true, data });
  }),
);

// PUT /notifications/preferences/:role
router.put(
  '/preferences/:role',
  requireRole(ROLES.DIRECTOR),
  validate(NotificationPreferenceInput.omit({ role: true }).extend({ preferences: z.record(z.object({ inApp: z.boolean(), email: z.boolean(), sms: z.boolean() })) })),
  asyncHandler(async (req, res) => {
    await notificationService.savePreferences(req.params.role, req.body.preferences);
    res.json({ success: true });
  }),
);

export { router as notificationsRouter };
