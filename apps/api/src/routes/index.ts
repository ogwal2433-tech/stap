import { Router, type IRouter } from 'express';
import authRouter from './auth';
import { guardsRouter } from './guards';
import { clientsRouter } from './clients';
import { attendanceRouter } from './attendance';
import { contractsRouter } from './contracts';
import { usersRouter } from './users';
import { financeRouter } from './finance';
import { requisitionsRouter } from './requisitions';

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

// Sprint 4 routes:
// router.use('/reports', reportsRouter)        // Sprint 4

export default router;
