import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { ToastProvider } from '@/context/ToastContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppLayout from '@/components/layout/AppLayout';
import PortalLayout from '@/components/layout/PortalLayout';
import RoleGuard from '@/components/RoleGuard';
import PageSpinner from '@/components/ui/PageSpinner';
import LoginPage from '@/pages/LoginPage';
import UnauthorisedPage from '@/pages/UnauthorisedPage';
import { ROLES, INTERNAL_ROLES, REPORT_ROLES, FINANCE_ROLES, type UserRole } from '@stap/shared';

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
const BulkImportPage               = lazy(() => import('@/pages/guards/BulkImportPage'));
const GuardDashboardPage           = lazy(() => import('@/pages/guards/GuardDashboardPage'));
const FinancePage                  = lazy(() => import('@/pages/finance/FinancePage'));
const RequisitionsPage             = lazy(() => import('@/pages/requisitions/RequisitionsPage'));
const ComplaintsPage               = lazy(() => import('@/pages/complaints/ComplaintsPage'));
const ComplaintsDashboard          = lazy(() => import('@/pages/complaints/ComplaintsDashboard'));
const ReportsPage                  = lazy(() => import('@/pages/reports/ReportsPage'));
const NotificationsPage            = lazy(() => import('@/pages/notifications/NotificationsPage'));
const NotificationSettingsPage     = lazy(() => import('@/pages/settings/NotificationSettingsPage'));
const HRPage                       = lazy(() => import('@/pages/hr/HRPage'));
const InventoryPage                = lazy(() => import('@/pages/inventory/InventoryPage'));
const SettingsPage                 = lazy(() => import('@/pages/settings/SettingsPage'));
const ZonesPage                    = lazy(() => import('@/pages/zones/ZonesPage'));
const ZoneDetailPage               = lazy(() => import('@/pages/zones/ZoneDetailPage'));
const ClientPortalPage             = lazy(() => import('@/pages/portal/ClientPortalPage'));

const GUARD_WRITE: UserRole[]    = [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER];
const HR_VIEW_ROLES: UserRole[]  = [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.TRAINER, ROLES.OPERATIONS_SUPERVISOR];
const INV_ROLES: UserRole[]      = [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ADMINISTRATOR];
const FINANCE_ROLES_ARR: UserRole[] = [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ACCOUNTS_OFFICER];
const REQUISITION_ROLES: UserRole[] = [
  ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ADMINISTRATOR,
  ROLES.OPERATIONS_SUPERVISOR, ROLES.FIELD_SUPERVISOR, ROLES.TRAINER,
  ROLES.ACCOUNTS_OFFICER, ROLES.MARKETING,
];
const CLIENT_WRITE: UserRole[] = [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.MARKETING];
const ZONE_VIEW_ROLES: UserRole[] = [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ADMINISTRATOR, ROLES.OPERATIONS_SUPERVISOR];
const DEPLOYMENT_ROLES: UserRole[] = [
  ROLES.DIRECTOR, ROLES.OPERATIONS_SUPERVISOR, ROLES.FIELD_SUPERVISOR, ROLES.ADMINISTRATOR,
];
const COMPLAINT_VIEW_ROLES: UserRole[] = INTERNAL_ROLES.filter(r => r !== ROLES.GUARD && r !== ROLES.CLIENT);
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
              <Route path="/attendance"           element={<L><RoleGuard allowedRoles={[...DEPLOYMENT_ROLES, ROLES.ASSISTANT_MANAGER, ROLES.ADMINISTRATOR]} fallback={<UnauthorisedPage />}><AttendancePage /></RoleGuard></L>} />
              <Route path="/attendance/dashboard" element={<L><RoleGuard allowedRoles={[ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.OPERATIONS_SUPERVISOR, ROLES.FIELD_SUPERVISOR, ROLES.ADMINISTRATOR]} fallback={<UnauthorisedPage />}><AttendanceDashboardPage /></RoleGuard></L>} />
              <Route path="/checkin"              element={<L><RoleGuard allowedRoles={[ROLES.FIELD_SUPERVISOR, ROLES.OPERATIONS_SUPERVISOR]} fallback={<UnauthorisedPage />}><CheckinPage /></RoleGuard></L>} />

              {/* Finance */}
              <Route path="/finance" element={<L><RoleGuard allowedRoles={FINANCE_ROLES_ARR} fallback={<UnauthorisedPage />}><FinancePage /></RoleGuard></L>} />

              {/* Requisitions */}
              <Route path="/requisitions" element={<L><RoleGuard allowedRoles={REQUISITION_ROLES} fallback={<UnauthorisedPage />}><RequisitionsPage /></RoleGuard></L>} />

              {/* Clients */}
              <Route path="/clients"          element={<L><ClientsListPage /></L>} />
              <Route path="/clients/new"      element={<L><RoleGuard allowedRoles={CLIENT_WRITE} fallback={<UnauthorisedPage />}><ClientFormPage /></RoleGuard></L>} />
              <Route path="/clients/:id"      element={<L><ClientDetailPage /></L>} />
              <Route path="/clients/:id/edit" element={<L><RoleGuard allowedRoles={CLIENT_WRITE} fallback={<UnauthorisedPage />}><ClientFormPage /></RoleGuard></L>} />

              {/* Complaints */}
              <Route path="/complaints"           element={<L><RoleGuard allowedRoles={COMPLAINT_VIEW_ROLES} fallback={<UnauthorisedPage />}><ComplaintsPage /></RoleGuard></L>} />
              <Route path="/complaints/dashboard" element={<L><RoleGuard allowedRoles={[ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.OPERATIONS_SUPERVISOR]} fallback={<UnauthorisedPage />}><ComplaintsDashboard /></RoleGuard></L>} />

              {/* Reports */}
              <Route path="/reports" element={<L><RoleGuard allowedRoles={REPORT_ACCESS} fallback={<UnauthorisedPage />}><ReportsPage /></RoleGuard></L>} />

              {/* Notifications */}
              <Route path="/notifications" element={<L><NotificationsPage /></L>} />

              {/* HR */}
              <Route path="/hr" element={<L><RoleGuard allowedRoles={HR_VIEW_ROLES} fallback={<UnauthorisedPage />}><HRPage /></RoleGuard></L>} />

              {/* Inventory */}
              <Route path="/inventory" element={<L><RoleGuard allowedRoles={INV_ROLES} fallback={<UnauthorisedPage />}><InventoryPage /></RoleGuard></L>} />

              {/* Zones */}
              <Route path="/zones"    element={<L><RoleGuard allowedRoles={ZONE_VIEW_ROLES} fallback={<UnauthorisedPage />}><ZonesPage /></RoleGuard></L>} />
              <Route path="/zones/:id" element={<L><RoleGuard allowedRoles={ZONE_VIEW_ROLES} fallback={<UnauthorisedPage />}><ZoneDetailPage /></RoleGuard></L>} />

              {/* Settings */}
              <Route path="/settings" element={<L><RoleGuard allowedRoles={[ROLES.DIRECTOR]} fallback={<UnauthorisedPage />}><SettingsPage /></RoleGuard></L>} />
              <Route path="/settings/notifications" element={<L><RoleGuard allowedRoles={[ROLES.DIRECTOR]} fallback={<UnauthorisedPage />}><NotificationSettingsPage /></RoleGuard></L>} />
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
