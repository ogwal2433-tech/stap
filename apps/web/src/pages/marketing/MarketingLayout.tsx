import { Nav } from 'react-bootstrap';
import { NavLink, Outlet } from 'react-router-dom';

const NAVY  = '#1B3A6B';
const AMBER = '#F2AA20';

const SUB_NAV = [
  { to: '/marketing/prospects', label: '👥 Prospects' },
  { to: '/marketing/bids',      label: '📋 Bids & Tenders' },
  { to: '/marketing/targets',   label: '🎯 Targets' },
  { to: '/marketing/closed',    label: '🏆 Closed Business' },
  { to: '/marketing/reports',   label: '📊 Reports' },
];

export default function MarketingLayout() {
  return (
    <div>
      <div style={{ background: NAVY, padding: '0 20px' }}>
        <Nav variant="tabs" style={{ borderBottom: 'none', flexWrap: 'nowrap', overflowX: 'auto' }}>
          {SUB_NAV.map((item) => (
            <Nav.Item key={item.to}>
              <NavLink
                to={item.to}
                style={({ isActive }) => ({
                  color:          isActive ? AMBER : 'rgba(255,255,255,0.8)',
                  borderBottom:   isActive ? `3px solid ${AMBER}` : '3px solid transparent',
                  padding:        '10px 16px',
                  display:        'block',
                  fontSize:       '0.85rem',
                  fontWeight:     isActive ? 600 : 400,
                  textDecoration: 'none',
                  whiteSpace:     'nowrap',
                })}
              >
                {item.label}
              </NavLink>
            </Nav.Item>
          ))}
        </Nav>
      </div>

      <div className="p-4">
        <Outlet />
      </div>
    </div>
  );
}
