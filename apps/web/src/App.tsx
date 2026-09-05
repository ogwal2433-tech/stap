import { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { lazyWithReload } from '@/lib/lazyWithReload';
import { AuthProvider } from '@/context/AuthContext';
import { ToastProvider } from '@/context/ToastContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppLayout from '@/components/layout/AppLayout';
import PortalLayout from '@/components/layout/PortalLayout';
import RoleGuard from '@/components/RoleGuard';
import PermissionGuard, { PermissionDenied } from '@/components/PermissionGuard';
import PageSpinner from '@/components/ui/PageSpinner';
import LoginPage from '@/pages/LoginPage';
import UnauthorisedPage from '@/pages/UnauthorisedPage';
import { ROLES, INTERNAL_ROLES, REPORT_ROLES, FINANCE_ROLES, DEPLOYMENT_VIEW_ROLES, type UserRole } from '@stap/shared';

// Code-split all page-level components
const DashboardPage                = lazyWithReload(() => import('@/pages/DashboardPage'), 'DashboardPage');
const GuardsListPage               = lazyWithReload(() => import('@/pages/guards/GuardsListPage'), 'GuardsListPage');
const GuardFormPage                = lazyWithReload(() => import('@/pages/guards/GuardFormPage'), 'GuardFormPage');
const GuardDetailPage              = lazyWithReload(() => import('@/pages/guards/GuardDetailPage'), 'GuardDetailPage');
const ClientsListPage              = lazyWithReload(() => import('@/pages/clients/ClientsListPage'), 'ClientsListPage');
const ClientFormPage               = lazyWithReload(() => import('@/pages/clients/ClientFormPage'), 'ClientFormPage');
const ClientDetailPage             = lazyWithReload(() => import('@/pages/clients/ClientDetailPage'), 'ClientDetailPage');
const AttendancePage               = lazyWithReload(() => import('@/pages/attendance/AttendancePage'), 'AttendancePage');
const AttendanceDashboardPage      = lazyWithReload(() => import('@/pages/attendance/AttendanceDashboardPage'), 'AttendanceDashboardPage');
const CheckinPage                  = lazyWithReload(() => import('@/pages/attendance/CheckinPage'), 'CheckinPage');
const DeploymentSheetPage          = lazyWithReload(() => import('@/pages/roster/DeploymentSheetPage'), 'DeploymentSheetPage');
const GunManagementPage            = lazyWithReload(() => import('@/pages/trainer/GunManagementPage'), 'GunManagementPage');
const MarketingLayout              = lazyWithReload(() => import('@/pages/marketing/MarketingLayout'), 'MarketingLayout');
const ProspectsPage                = lazyWithReload(() => import('@/pages/marketing/ProspectsPage'), 'ProspectsPage');
const BidsPage                     = lazyWithReload(() => import('@/pages/marketing/BidsPage'), 'BidsPage');
const TargetsPage                  = lazyWithReload(() => import('@/pages/marketing/TargetsPage'), 'TargetsPage');
const ClosedBusinessPage           = lazyWithReload(() => import('@/pages/marketing/ClosedBusinessPage'), 'ClosedBusinessPage');
const MarketingReportsPage         = lazyWithReload(() => import('@/pages/marketing/ReportsPage'), 'ReportsPage');
const BulkImportPage               = lazyWithReload(() => import('@/pages/guards/BulkImportPage'), 'BulkImportPage');
const GuardDashboardPage           = lazyWithReload(() => import('@/pages/guards/GuardDashboardPage'), 'GuardDashboardPage');
const FinancePage                  = lazyWithReload(() => import('@/pages/finance/FinancePage'), 'FinancePage');
const RequisitionsPage             = lazyWithReload(() => import('@/pages/requisitions/RequisitionsPage'), 'RequisitionsPage');
const ComplaintsPage               = lazyWithReload(() => import('@/pages/complaints/ComplaintsPage'), 'ComplaintsPage');
const ComplaintsDashboard          = lazyWithReload(() => import('@/pages/complaints/ComplaintsDashboard'), 'ComplaintsDashboard');
const StaffServiceRequestsPage     = lazyWithReload(() => import('@/pages/serviceRequests/StaffServiceRequestsPage'), 'StaffServiceRequestsPage');
const ReportsPage                  = lazyWithReload(() => import('@/pages/reports/ReportsPage'), 'ReportsPage');
const NotificationsPage            = lazyWithReload(() => import('@/pages/notifications/NotificationsPage'), 'NotificationsPage');
const NotificationSettingsPage     = lazyWithReload(() => import('@/pages/settings/NotificationSettingsPage'), 'NotificationSettingsPage');
const HRPage                       = lazyWithReload(() => import('@/pages/hr/HRPage'), 'HRPage');
const InventoryPage                = lazyWithReload(() => import('@/pages/inventory/InventoryPage'), 'InventoryPage');
const SettingsPage                 = lazyWithReload(() => import('@/pages/settings/SettingsPage'), 'SettingsPage');
const RolesPermissionsPage         = lazyWithReload(() => import('@/pages/settings/RolesPermissionsPage'), 'RolesPermissionsPage');
const IntegrationsPage             = lazyWithReload(() => import('@/pages/settings/IntegrationsPage'), 'IntegrationsPage');
const ZonesPage                    = lazyWithReload(() => import('@/pages/zones/ZonesPage'), 'ZonesPage');
const ZoneDetailPage               = lazyWithReload(() => import('@/pages/zones/ZoneDetailPage'), 'ZoneDetailPage');
const ClientPortalPage             = lazyWithReload(() => import('@/pages/portal/ClientPortalPage'), 'ClientPortalPage');
const ShiftReportsListPage         = lazyWithReload(() => import('@/pages/controlRoom/ShiftReportsListPage'), 'ShiftReportsListPage');
const ScheduledJobsPage            = lazyWithReload(() => import('@/pages/settings/ScheduledJobsPage'), 'ScheduledJobsPage');
const ShiftHandoverPage            = lazyWithReload(() => import('@/pages/controlRoom/ShiftHandoverPage'), 'ShiftHandoverPage');
const SystemErrorsPage             = lazyWithReload(() => import('@/pages/admin/SystemErrorsPage'), 'SystemErrorsPage');
const AuditLogPage                 = lazyWithReload(() => import('@/pages/admin/AuditLogPage'), 'AuditLogPage');
const StaffPage                    = lazyWithReload(() => import('@/pages/staff/StaffPage'), 'StaffPage');

const GUARD_WRITE: UserRole[]    = [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER];
const HR_VIEW_ROLES: UserRole[]  = [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.TRAINER, ROLES.OPERATIONS_SUPERVISOR];
const INV_ROLES: UserRole[]      = [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ADMINISTRATOR];
const FINANCE_ROLES_ARR: UserRole[] = [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ACCOUNTS_OFFICER];
/**
 * Mirrors the API, which lets any internal role submit a requisition, and the
 * sidebar, which shows the link to all of them. Control Room was missing here
 * while appearing in both of the others, so the link was visible and answered
 * with Access Denied — from this guard, before the request was ever made.
 */
const REQUISITION_ROLES: UserRole[] = INTERNAL_ROLES.filter(
  (r) => r !== ROLES.CLIENT && r !== ROLES.GUARD,
);
const CLIENT_WRITE: UserRole[] = [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.MARKETING_HEAD, ROLES.SALES];
const ZONE_VIEW_ROLES: UserRole[] = [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ADMINISTRATOR, ROLES.OPERATIONS_SUPERVISOR];
const ERROR_ADMIN_ROLES: UserRole[] = [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ADMINISTRATOR];
// Who runs the staff directory. Mirrors STAFF_MANAGER_ROLES on the API.
const STAFF_MANAGER_ROLES: UserRole[] = [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ADMINISTRATOR];
const DEPLOYMENT_ROLES: UserRole[] = [
  ROLES.DIRECTOR, ROLES.OPERATIONS_SUPERVISOR, ROLES.FIELD_SUPERVISOR, ROLES.ADMINISTRATOR,
];
const COMPLAINT_VIEW_ROLES: UserRole[] = INTERNAL_ROLES.filter(r => r !== ROLES.GUARD && r !== ROLES.CLIENT);
// Read access to the deployment sheet. Write controls within the page carry
// their own RoleGuard, so this stays a viewing list.
// Firearms are the Trainer's to issue; Operations can see what is on its sites.
const MARKETING_ROLES: UserRole[] = [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.MARKETING_HEAD, ROLES.SALES];
const GUN_VIEW_ROLES: UserRole[] = [
  ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.TRAINER, ROLES.OPERATIONS_SUPERVISOR,
];
/**
 * The shared list the sidebar already uses, plus Administrator. Keeping a
 * separate copy here is what let Accounts Officer onto the nav item and off the
 * page behind it.
 */
const DEPLOYMENT_VIEW: UserRole[] = [
  ...new Set<UserRole>([...DEPLOYMENT_VIEW_ROLES, ROLES.ADMINISTRATOR]),
];
const REPORT_ACCESS: UserRole[]        = [...new Set([...REPORT_ROLES, ROLES.OPERATIONS_SUPERVISOR])];

function L({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageSpinner />}>{children}</Suspense>;
}

import React from 'react';

function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <Routes>
          {/* Public */}
          <Route path="/login"        element={<LoginPage />} />
          <Route path="/unauthorised" element={<UnauthorisedPage />} />

          {/* Client portal — separate layout, no sidebar */}
          <Route element={<ProtectedRoute allowedRoles={[ROLES.CLIENT]} />}>
            <Route element={<PortalLayout />}>
              <Route path="/portal" element={<L><ClientPortalPage /></L>} />
            </Route>
          </Route>

          {/* Protected — AppLayout (sidebar + main) */}
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<L><DashboardPage /></L>} />

              {/* Guards */}
              <Route path="/guards"              element={<L><GuardsListPage /></L>} />
              <Route path="/guards/new"          element={<L><RoleGuard allowedRoles={GUARD_WRITE} fallback={<UnauthorisedPage />}><GuardFormPage /></RoleGuard></L>} />
              <Route path="/guards/dashboard"    element={<L><RoleGuard allowedRoles={[ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.OPERATIONS_SUPERVISOR]} fallback={<UnauthorisedPage />}><GuardDashboardPage /></RoleGuard></L>} />
              <Route path="/guards/import"       element={<L><RoleGuard allowedRoles={GUARD_WRITE} fallback={<UnauthorisedPage />}><BulkImportPage /></RoleGuard></L>} />
              <Route path="/guards/:id"          element={<L><GuardDetailPage /></L>} />
              <Route path="/guards/:id/edit"     element={<L><RoleGuard allowedRoles={GUARD_WRITE} fallback={<UnauthorisedPage />}><GuardFormPage /></RoleGuard></L>} />

              {/* Attendance */}
              <Route path="/attendance"           element={<L><PermissionGuard permission="attendance.view" fallback={<PermissionDenied permission="attendance.view" />}><AttendancePage /></PermissionGuard></L>} />
              <Route path="/attendance/deployment-sheet" element={<L><RoleGuard allowedRoles={[...DEPLOYMENT_ROLES, ROLES.ASSISTANT_MANAGER, ROLES.ADMINISTRATOR]} fallback={<UnauthorisedPage />}><DeploymentSheetPage /></RoleGuard></L>} />
              <Route path="/attendance/dashboard" element={<L><RoleGuard allowedRoles={[ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.OPERATIONS_SUPERVISOR, ROLES.FIELD_SUPERVISOR, ROLES.ADMINISTRATOR]} fallback={<UnauthorisedPage />}><AttendanceDashboardPage /></RoleGuard></L>} />
              <Route path="/checkin"              element={<L><PermissionGuard permission="checkin.perform" fallback={<PermissionDenied permission="checkin.perform" />}><CheckinPage /></PermissionGuard></L>} />

              {/* Finance */}
              <Route path="/finance" element={<L><PermissionGuard permission="finance.view" fallback={<PermissionDenied permission="finance.view" />}><FinancePage /></PermissionGuard></L>} />

              {/* Requisitions */}
              <Route
                path="/marketing"
                element={<L><RoleGuard allowedRoles={MARKETING_ROLES} fallback={<UnauthorisedPage />}><MarketingLayout /></RoleGuard></L>}
              >
                <Route index            element={<Navigate to="prospects" replace />} />
                <Route path="prospects" element={<L><ProspectsPage /></L>} />
                <Route path="bids"      element={<L><BidsPage /></L>} />
                <Route path="targets"   element={<L><TargetsPage /></L>} />
                <Route path="closed"    element={<L><ClosedBusinessPage /></L>} />
                <Route path="reports"   element={<L><MarketingReportsPage /></L>} />
              </Route>

              <Route path="/guns" element={<L><PermissionGuard permission="guns.view" fallback={<PermissionDenied permission="guns.view" />}><GunManagementPage /></PermissionGuard></L>} />

              <Route path="/requisitions" element={<L><PermissionGuard permission="requisitions.view" fallback={<PermissionDenied permission="requisitions.view" />}><RequisitionsPage /></PermissionGuard></L>} />

              {/* Clients */}
              <Route path="/clients"          element={<L><PermissionGuard permission="clients.view" fallback={<PermissionDenied permission="clients.view" />}><ClientsListPage /></PermissionGuard></L>} />
              <Route path="/clients/new"      element={<L><RoleGuard allowedRoles={CLIENT_WRITE} fallback={<UnauthorisedPage />}><ClientFormPage /></RoleGuard></L>} />
              <Route path="/clients/:id"      element={<L><PermissionGuard permission="clients.view" fallback={<PermissionDenied permission="clients.view" />}><ClientDetailPage /></PermissionGuard></L>} />
              <Route path="/clients/:id/edit" element={<L><RoleGuard allowedRoles={CLIENT_WRITE} fallback={<UnauthorisedPage />}><ClientFormPage /></RoleGuard></L>} />

              {/* Complaints */}
              <Route path="/complaints"           element={<L><PermissionGuard permission="complaints.view" fallback={<PermissionDenied permission="complaints.view" />}><ComplaintsPage /></PermissionGuard></L>} />
              <Route path="/complaints/dashboard" element={<L><RoleGuard allowedRoles={[ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.OPERATIONS_SUPERVISOR]} fallback={<UnauthorisedPage />}><ComplaintsDashboard /></RoleGuard></L>} />

              {/* Service requests raised by clients */}
              <Route path="/settings/scheduled-jobs" element={<L><PermissionGuard permission="settings.view" fallback={<PermissionDenied permission="settings.view" />}><ScheduledJobsPage /></PermissionGuard></L>} />
              <Route path="/control-room/shift-reports" element={<L><PermissionGuard permission="shift_report.view" fallback={<PermissionDenied permission="shift_report.view" />}><ShiftReportsListPage /></PermissionGuard></L>} />
              <Route path="/control-room/shift-report/new" element={<L><PermissionGuard permission="shift_report.create" fallback={<PermissionDenied permission="shift_report.create" />}><ShiftHandoverPage /></PermissionGuard></L>} />
              <Route path="/control-room/shift-report/:id" element={<L><PermissionGuard permission="shift_report.view" fallback={<PermissionDenied permission="shift_report.view" />}><ShiftHandoverPage /></PermissionGuard></L>} />
              <Route path="/service-requests" element={<L><PermissionGuard permission="service_requests.view" fallback={<PermissionDenied permission="service_requests.view" />}><StaffServiceRequestsPage /></PermissionGuard></L>} />

              {/* Reports */}
              <Route path="/reports" element={<L><PermissionGuard permission="reports.view" fallback={<PermissionDenied permission="reports.view" />}><ReportsPage /></PermissionGuard></L>} />

              {/* Notifications */}
              <Route path="/notifications" element={<L><NotificationsPage /></L>} />

              {/* HR */}
              <Route path="/hr" element={<L><PermissionGuard permission="hr.view" fallback={<PermissionDenied permission="hr.view" />}><HRPage /></PermissionGuard></L>} />

              {/* Inventory */}
              <Route path="/inventory" element={<L><PermissionGuard permission="inventory.view" fallback={<PermissionDenied permission="inventory.view" />}><InventoryPage /></PermissionGuard></L>} />

              {/* Zones */}
              <Route path="/zones"    element={<L><PermissionGuard permission="roster.view" fallback={<PermissionDenied permission="roster.view" />}><ZonesPage /></PermissionGuard></L>} />
              <Route path="/zones/:id" element={<L><PermissionGuard permission="roster.view" fallback={<PermissionDenied permission="roster.view" />}><ZoneDetailPage /></PermissionGuard></L>} />

              {/* Settings */}
              <Route path="/settings" element={<L><PermissionGuard permission="settings.view" fallback={<PermissionDenied permission="settings.view" />}><SettingsPage /></PermissionGuard></L>} />
              <Route path="/settings/notifications" element={<L><RoleGuard allowedRoles={[ROLES.DIRECTOR]} fallback={<UnauthorisedPage />}><NotificationSettingsPage /></RoleGuard></L>} />
              <Route path="/settings/roles" element={<L><PermissionGuard permission="roles.manage" fallback={<PermissionDenied permission="roles.manage" />}><RolesPermissionsPage /></PermissionGuard></L>} />
              <Route path="/settings/integrations" element={<L><PermissionGuard permission="settings.edit" fallback={<PermissionDenied permission="settings.edit" />}><IntegrationsPage /></PermissionGuard></L>} />

              {/* Staff directory */}
              <Route path="/staff" element={<L><PermissionGuard permission="staff.view" fallback={<PermissionDenied permission="staff.view" />}><StaffPage /></PermissionGuard></L>} />

              {/* Admin */}
              <Route path="/admin/errors" element={<L><PermissionGuard permission="system.errors" fallback={<PermissionDenied permission="system.errors" />}><SystemErrorsPage /></PermissionGuard></L>} />
              <Route path="/admin/audit-log" element={<L><PermissionGuard permission="audit.log" fallback={<PermissionDenied permission="audit.log" />}><AuditLogPage /></PermissionGuard></L>} />
            </Route>
          </Route>

          {/* Default */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </ToastProvider>
  );
}

export default App;
