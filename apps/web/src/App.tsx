import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { ToastProvider } from '@/context/ToastContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppLayout from '@/components/layout/AppLayout';
import RoleGuard from '@/components/RoleGuard';
import PageSpinner from '@/components/ui/PageSpinner';
import LoginPage from '@/pages/LoginPage';
import UnauthorisedPage from '@/pages/UnauthorisedPage';
import { ROLES, type UserRole } from '@stap/shared';

// Code-split all page-level components
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const GuardsListPage = lazy(() => import('@/pages/guards/GuardsListPage'));
const GuardFormPage = lazy(() => import('@/pages/guards/GuardFormPage'));
const GuardDetailPage = lazy(() => import('@/pages/guards/GuardDetailPage'));

const GUARD_WRITE: UserRole[] = [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER];

// Example of role-gated routes (uncomment in Sprint 2 as modules ship):
// <Route element={<ProtectedRoute allowedRoles={[ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER]} />}>
//   <Route path="/payroll" element={<PayrollPage />} />
// </Route>

function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/unauthorised" element={<UnauthorisedPage />} />

          {/* Protected — wrapped in AppLayout (sidebar + main) */}
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route
                path="/dashboard"
                element={
                  <Suspense fallback={<PageSpinner />}>
                    <DashboardPage />
                  </Suspense>
                }
              />

              {/* Guards */}
              <Route
                path="/guards"
                element={
                  <Suspense fallback={<PageSpinner />}>
                    <GuardsListPage />
                  </Suspense>
                }
              />
              <Route
                path="/guards/new"
                element={
                  <Suspense fallback={<PageSpinner />}>
                    <RoleGuard allowedRoles={GUARD_WRITE} fallback={<UnauthorisedPage />}>
                      <GuardFormPage />
                    </RoleGuard>
                  </Suspense>
                }
              />
              <Route
                path="/guards/:id"
                element={
                  <Suspense fallback={<PageSpinner />}>
                    <GuardDetailPage />
                  </Suspense>
                }
              />
              <Route
                path="/guards/:id/edit"
                element={
                  <Suspense fallback={<PageSpinner />}>
                    <RoleGuard allowedRoles={GUARD_WRITE} fallback={<UnauthorisedPage />}>
                      <GuardFormPage />
                    </RoleGuard>
                  </Suspense>
                }
              />
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
