import { Router, type IRouter } from 'express';
import authRouter from './auth';
import { guardsRouter } from './guards';
import { clientsRouter } from './clients';
import { attendanceRouter } from './attendance';
import { contractsRouter } from './contracts';
import { usersRouter } from './users';
import { financeRouter } from './finance';
import { requisitionsRouter } from './requisitions';
import { notificationsRouter } from './notifications';
import { complaintsRouter } from './complaints';
import { reportsRouter } from './reports';
import { portalRouter } from './portal';

const router: IRouter = Router();

// ── Mounted route modules ──────────────────────────────────────────────────────

router.use('/auth', authRouter);
router.use('/guards', guardsRouter);
router.use('/clients', clientsRouter);
router.use('/attendance', attendanceRouter);
router.use('/contracts', contractsRouter);
router.use('/users', usersRouter);
router.use('/finance', financeRouter);
router.use('/requisitions', requisitionsRouter);
router.use('/notifications', notificationsRouter);
router.use('/complaints', complaintsRouter);
router.use('/reports', reportsRouter);
router.use('/portal', portalRouter);

export default router;
