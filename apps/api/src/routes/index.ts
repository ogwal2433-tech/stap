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
import { dashboardRouter } from './dashboard';
import { hrRouter } from './hr';
import { inventoryRouter } from './inventory';
import { settingsRouter } from './settings';
import zonesRouter from './zones';
import { lettersRouter } from './letters';
import { paymentsRouter } from './payments';
import { systemErrorsRouter } from './systemErrors';
import { serviceRequestsRouter } from './serviceRequests';
import { auditLogsRouter } from './auditLogs';
import { gunsRouter } from './guns';
import { marketingRouter } from './marketing';

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
router.use('/dashboard', dashboardRouter);
router.use('/hr', hrRouter);
router.use('/inventory', inventoryRouter);
router.use('/guns', gunsRouter);
router.use('/marketing', marketingRouter);
router.use('/settings', settingsRouter);
router.use('/zones', zonesRouter);
router.use('/letters', lettersRouter);
router.use('/payments', paymentsRouter);
router.use('/system-errors', systemErrorsRouter);
router.use('/service-requests', serviceRequestsRouter);
router.use('/audit-logs', auditLogsRouter);

export default router;
