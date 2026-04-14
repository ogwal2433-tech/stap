import { Router, type IRouter } from 'express';
import authRouter from './auth';
import { guardsRouter } from './guards';
import { clientsRouter } from './clients';
import { attendanceRouter } from './attendance';
import { contractsRouter } from './contracts';
import { usersRouter } from './users';

const router: IRouter = Router();

// ── Mounted route modules ──────────────────────────────────────────────────────

router.use('/auth', authRouter);
router.use('/guards', guardsRouter);
router.use('/clients', clientsRouter);
router.use('/attendance', attendanceRouter);
router.use('/contracts', contractsRouter);
router.use('/users', usersRouter);

// Sprint 3 routes:
// router.use('/finance', financeRouter)        // Sprint 3
// router.use('/requisitions', reqRouter)       // Sprint 3
// router.use('/inventory', inventoryRouter)    // Sprint 3
// router.use('/payroll', payrollRouter)        // Sprint 3

// Sprint 4 routes:
// router.use('/reports', reportsRouter)        // Sprint 4

export default router;
