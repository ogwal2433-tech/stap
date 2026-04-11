import { Routes, Route, Navigate } from 'react-router-dom';
import { Container, Button } from 'react-bootstrap';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import LoginPage from '@/pages/LoginPage';

function Dashboard() {
  const { user, logout } = useAuth();
  return (
    <Container className="py-5">
      <h2 style={{ color: '#1B3A6B' }}>Welcome, {user?.name}</h2>
      <p className="text-muted mb-4">
        Role: <span className="badge bg-secondary">{user?.role}</span>
      </p>
      <Button
        variant="outline-secondary"
        onClick={logout}
      >
        Sign out
      </Button>
    </Container>
  );
}

function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<LoginPage />} />

        {/* Protected */}
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </AuthProvider>
  );
}

export default App;
