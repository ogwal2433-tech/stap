import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Button, Navbar } from 'react-bootstrap';
import Sidebar from './Sidebar';
import NotificationBell from './NotificationBell';
import { APP_NAME } from '@stap/shared';

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
          ☰
        </Button>
        <Navbar.Brand className="ms-3 fw-bold">{APP_NAME}</Navbar.Brand>
        <div className="ms-auto">
          <NotificationBell />
        </div>
      </Navbar>

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
