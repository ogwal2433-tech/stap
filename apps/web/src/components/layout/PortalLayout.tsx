import { Outlet } from 'react-router-dom';
import { Button, Navbar } from 'react-bootstrap';
import { useAuth } from '../../context/AuthContext';

export default function PortalLayout() {
  const { user, logout } = useAuth();
  return (
    <div style={{ minHeight: '100vh', background: '#F2F4F7' }}>
      <Navbar bg="dark" variant="dark" className="px-4 py-2 shadow-sm">
        <Navbar.Brand className="fw-bold">STAP Security</Navbar.Brand>
        <div className="ms-auto d-flex align-items-center gap-3">
          {user && <span className="text-white small">{user.name}</span>}
          <Button size="sm" variant="outline-light" onClick={logout}>Logout</Button>
        </div>
      </Navbar>
      <Outlet />
    </div>
  );
}
