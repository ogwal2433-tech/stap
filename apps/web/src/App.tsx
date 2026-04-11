import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import UnauthorisedPage from '@/pages/UnauthorisedPage';

// Example of role-gated routes (uncomment in Sprint 2 as modules ship):
// import { ROLES } from '@stap/shared';
// <Route element={<ProtectedRoute allowedRoles={[ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER]} />}>
//   <Route path="/payroll" element={<PayrollPage />} />
// </Route>

function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/unauthorised" element={<UnauthorisedPage />} />

        {/* Protected (all authenticated users) */}
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </AuthProvider>
  );
}

export default App;
