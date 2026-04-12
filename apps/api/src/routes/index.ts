import { Router, type IRouter } from 'express';
import authRouter from './auth';
import { guardsRouter } from './guards';

const router: IRouter = Router();

// ── Mounted route modules ──────────────────────────────────────────────────────

router.use('/auth', authRouter);
router.use('/guards', guardsRouter);

// Sprint 2 routes (uncomment as modules are built):
// router.use('/attendance', attendanceRouter)  // Sprint 2
// router.use('/clients', clientsRouter)        // Sprint 2
// router.use('/sites', sitesRouter)            // Sprint 2
// router.use('/deployments', deploymentsRouter) // Sprint 2

// Sprint 3 routes:
// router.use('/finance', financeRouter)        // Sprint 3
// router.use('/requisitions', reqRouter)       // Sprint 3
// router.use('/inventory', inventoryRouter)    // Sprint 3
// router.use('/payroll', payrollRouter)        // Sprint 3

// Sprint 4 routes:
// router.use('/reports', reportsRouter)        // Sprint 4

export default router;
