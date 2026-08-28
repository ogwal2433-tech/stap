import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
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
const DashboardPage                = lazy(() => import('@/pages/DashboardPage'));
const GuardsListPage               = lazy(() => import('@/pages/guards/GuardsListPage'));
const GuardFormPage                = lazy(() => import('@/pages/guards/GuardFormPage'));
const GuardDetailPage              = lazy(() => import('@/pages/guards/GuardDetailPage'));
const ClientsListPage              = lazy(() => import('@/pages/clients/ClientsListPage'));
const ClientFormPage               = lazy(() => import('@/pages/clients/ClientFormPage'));
const ClientDetailPage             = lazy(() => import('@/pages/clients/ClientDetailPage'));
const AttendancePage               = lazy(() => import('@/pages/attendance/AttendancePage'));
const AttendanceDashboardPage      = lazy(() => import('@/pages/attendance/AttendanceDashboardPage'));
const CheckinPage                  = lazy(() => import('@/pages/attendance/CheckinPage'));
const DeploymentSheetPage          = lazy(() => import('@/pages/roster/DeploymentSheetPage'));
const GunManagementPage            = lazy(() => import('@/pages/trainer/GunManagementPage'));
const MarketingLayout              = lazy(() => import('@/pages/marketing/MarketingLayout'));
const ProspectsPage                = lazy(() => import('@/pages/marketing/ProspectsPage'));
const BidsPage                     = lazy(() => import('@/pages/marketing/BidsPage'));
const TargetsPage                  = lazy(() => import('@/pages/marketing/TargetsPage'));
const ClosedBusinessPage           = lazy(() => import('@/pages/marketing/ClosedBusinessPage'));
const MarketingReportsPage         = lazy(() => import('@/pages/marketing/ReportsPage'));
const BulkImportPage               = lazy(() => import('@/pages/guards/BulkImportPage'));
const GuardDashboardPage           = lazy(() => import('@/pages/guards/GuardDashboardPage'));
const FinancePage                  = lazy(() => import('@/pages/finance/FinancePage'));
const RequisitionsPage             = lazy(() => import('@/pages/requisitions/RequisitionsPage'));
const ComplaintsPage               = lazy(() => import('@/pages/complaints/ComplaintsPage'));
const ComplaintsDashboard          = lazy(() => import('@/pages/complaints/ComplaintsDashboard'));
const StaffServiceRequestsPage     = lazy(() => import('@/pages/serviceRequests/StaffServiceRequestsPage'));
const ReportsPage                  = lazy(() => import('@/pages/reports/ReportsPage'));
const NotificationsPage            = lazy(() => import('@/pages/notifications/NotificationsPage'));
const NotificationSettingsPage     = lazy(() => import('@/pages/settings/NotificationSettingsPage'));
const HRPage                       = lazy(() => import('@/pages/hr/HRPage'));
const InventoryPage                = lazy(() => import('@/pages/inventory/InventoryPage'));
const SettingsPage                 = lazy(() => import('@/pages/settings/SettingsPage'));
const RolesPermissionsPage         = lazy(() => import('@/pages/settings/RolesPermissionsPage'));
const ZonesPage                    = lazy(() => import('@/pages/zones/ZonesPage'));
const ZoneDetailPage               = lazy(() => import('@/pages/zones/ZoneDetailPage'));
const ClientPortalPage             = lazy(() => import('@/pages/portal/ClientPortalPage'));
const SystemErrorsPage             = lazy(() => import('@/pages/admin/SystemErrorsPage'));
const AuditLogPage                 = lazy(() => import('@/pages/admin/AuditLogPage'));
const StaffPage                    = lazy(() => import('@/pages/staff/StaffPage'));

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
              <Route path="/checkin"              element={<L><RoleGuard allowedRoles={[ROLES.FIELD_SUPERVISOR, ROLES.OPERATIONS_SUPERVISOR]} fallback={<UnauthorisedPage />}><CheckinPage /></RoleGuard></L>} />

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
              <Route path="/clients"          element={<L><ClientsListPage /></L>} />
              <Route path="/clients/new"      element={<L><RoleGuard allowedRoles={CLIENT_WRITE} fallback={<UnauthorisedPage />}><ClientFormPage /></RoleGuard></L>} />
              <Route path="/clients/:id"      element={<L><ClientDetailPage /></L>} />
              <Route path="/clients/:id/edit" element={<L><RoleGuard allowedRoles={CLIENT_WRITE} fallback={<UnauthorisedPage />}><ClientFormPage /></RoleGuard></L>} />

              {/* Complaints */}
              <Route path="/complaints"           element={<L><PermissionGuard permission="complaints.view" fallback={<PermissionDenied permission="complaints.view" />}><ComplaintsPage /></PermissionGuard></L>} />
              <Route path="/complaints/dashboard" element={<L><RoleGuard allowedRoles={[ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.OPERATIONS_SUPERVISOR]} fallback={<UnauthorisedPage />}><ComplaintsDashboard /></RoleGuard></L>} />

              {/* Service requests raised by clients */}
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
              <Route path="/zones"    element={<L><PermissionGuard permission="sites.view" fallback={<PermissionDenied permission="sites.view" />}><ZonesPage /></PermissionGuard></L>} />
              <Route path="/zones/:id" element={<L><PermissionGuard permission="sites.view" fallback={<PermissionDenied permission="sites.view" />}><ZoneDetailPage /></PermissionGuard></L>} />

              {/* Settings */}
              <Route path="/settings" element={<L><PermissionGuard permission="settings.view" fallback={<PermissionDenied permission="settings.view" />}><SettingsPage /></PermissionGuard></L>} />
              <Route path="/settings/notifications" element={<L><RoleGuard allowedRoles={[ROLES.DIRECTOR]} fallback={<UnauthorisedPage />}><NotificationSettingsPage /></RoleGuard></L>} />
              <Route path="/settings/roles" element={<L><PermissionGuard permission="roles.manage" fallback={<PermissionDenied permission="roles.manage" />}><RolesPermissionsPage /></PermissionGuard></L>} />

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
