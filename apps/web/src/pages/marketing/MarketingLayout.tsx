import { Nav } from 'react-bootstrap';
import { NavLink, Outlet } from 'react-router-dom';
import { MARKETING_MANAGER_ROLES } from '@stap/shared';
import { useAuth } from '../../context/AuthContext';

const NAVY  = '#1B3A6B';
const AMBER = '#F2AA20';

/**
 * `headOnly` marks the tabs the API refuses to a sales officer. Showing them
 * anyway would put three links on the page whose only outcome is Unauthorised.
 */
const SUB_NAV = [
  { to: '/marketing/prospects', label: '👥 Prospects',       headOnly: false },
  { to: '/marketing/bids',      label: '📋 Bids & Tenders',  headOnly: true  },
  { to: '/marketing/targets',   label: '🎯 Targets',         headOnly: true  },
  { to: '/marketing/closed',    label: '🏆 Closed Business', headOnly: false },
  { to: '/marketing/reports',   label: '📊 Reports',         headOnly: true  },
];

export default function MarketingLayout() {
  const { user } = useAuth();
  const isHead = (MARKETING_MANAGER_ROLES as string[]).includes(user?.role ?? '');
  const tabs = SUB_NAV.filter((item) => isHead || !item.headOnly);

  return (
    <div>
      <div style={{ background: NAVY, padding: '0 20px' }}>
        <Nav variant="tabs" style={{ borderBottom: 'none', flexWrap: 'nowrap', overflowX: 'auto' }}>
          {tabs.map((item) => (
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
