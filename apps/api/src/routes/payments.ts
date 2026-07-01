import { Router, type IRouter, type Request, type Response } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/rbac';
import { asyncHandler } from '../utils/asyncHandler';
import {
  initiateInvoicePayment,
  pollPaymentStatus,
  handleWebhook,
  getInvoicePayments,
} from '../services/paymentService';
import { ROLES } from '@stap/shared';

const router: IRouter = Router();

const PAYMENT_ROLES = [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ACCOUNTS_OFFICER];

// POST /payments/invoice/:invoiceId — initiate mobile money payment
router.post(
  '/invoice/:invoiceId',
  authenticate,
  requireRole(...PAYMENT_ROLES),
  asyncHandler(async (req: Request, res: Response) => {
    const { phone } = req.body as { phone?: string };
    if (!phone) {
      res.status(400).json({ success: false, error: 'phone is required' });
      return;
    }
    const result = await initiateInvoicePayment({
      invoiceId:   req.params.invoiceId,
      phone,
      initiatedBy: req.user!.userId,
    });
    res.json({ success: true, data: result });
  }),
);

// GET /payments/status/:extReference — poll payment status
router.get(
  '/status/:extReference',
  authenticate,
  requireRole(...PAYMENT_ROLES),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await pollPaymentStatus(req.params.extReference);
    res.json({ success: true, data: result });
  }),
);

// GET /payments/invoice/:invoiceId — list payments for an invoice
router.get(
  '/invoice/:invoiceId',
  authenticate,
  requireRole(...PAYMENT_ROLES),
  asyncHandler(async (req: Request, res: Response) => {
    const payments = await getInvoicePayments(req.params.invoiceId);
    res.json({ success: true, data: payments });
  }),
);

// POST /payments/webhook/xcel — XCEL webhook (no auth — always return 200)
router.post(
  '/webhook/xcel',
  asyncHandler(async (req: Request, res: Response) => {
    try {
      await handleWebhook(req.body as Record<string, unknown>);
    } catch {
      // webhook errors must not block XCEL retry — log only
    }
    res.status(200).json({ received: true });
  }),
);

export { router as paymentsRouter };
