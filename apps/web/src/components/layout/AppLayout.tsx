import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Button, Navbar } from 'react-bootstrap';
import Sidebar from './Sidebar';
import NotificationBell from './NotificationBell';
import { useAuth } from '../../context/AuthContext';
import { APP_NAME } from '../../lib/branding';

/** Round navy icon button matching the notification bell, used for sign out. */
function LogoutButton() {
  const { logout } = useAuth();
  return (
    <button
      onClick={logout}
      title="Sign out"
      aria-label="Sign out"
      style={{
        background: '#1B3A6B', border: 'none', cursor: 'pointer', color: 'white',
        width: 34, height: 34, borderRadius: '50%', marginLeft: 10,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
      }}
    >
      <i className="bi bi-box-arrow-right" style={{ fontSize: '1.15rem' }} />
    </button>
  );
}

export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div style={{ minHeight: '100vh', background: '#F2F4F7' }}>
      <Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />

      {/* Mobile-only top navbar */}
      <Navbar bg="dark" variant="dark" className="d-md-none px-3 py-2">
        <Button
          variant="outline-light"
          size="sm"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
        >
          <i className="bi bi-list" style={{ fontSize: '1.4rem' }} />
        </Button>
        <Navbar.Brand className="ms-3 fw-bold">{APP_NAME}</Navbar.Brand>
        <div className="ms-auto d-flex align-items-center">
          <NotificationBell />
          <LogoutButton />
        </div>
      </Navbar>

      {/* Desktop top bar — notification bell then sign out, hard right */}
      <div
        className="d-none d-md-flex sidebar-offset align-items-center justify-content-end"
        style={{
          background: 'white', borderBottom: '1px solid #e3e7ee',
          padding: '6px 18px', position: 'sticky', top: 0, zIndex: 1040,
        }}
      >
        <NotificationBell />
        <LogoutButton />
      </div>

      {/* Content area — offset by sidebar width on desktop */}
      <main
        style={{
          marginLeft: 0,
          padding: '1.5rem',
          minHeight: '100vh',
        }}
        className="sidebar-offset"
      >
        <Outlet />
      </main>

      <style>{`
        @media (min-width: 768px) {
          .sidebar-offset { margin-left: 220px !important; }
        }
      `}</style>
    </div>
  );
}
