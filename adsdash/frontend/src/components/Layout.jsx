// ============================================================
// src/components/Layout.jsx — PTI Analytics
// ============================================================
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useEffect, useState } from 'react';
import { clientsAPI } from '../services/api';

const PTI_DARK   = '#0A1628';
const PTI_GOLD   = '#E8A020';
const PTI_MID    = '#1B3A6B';
const PTI_GREEN  = '#2D7D46';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);

  useEffect(() => {
    clientsAPI.list().then(r => setClients(r.data || [])).catch(() => {});
  }, []);

  const handleLogout = async () => { await logout(); navigate('/login'); };

  return (
    <div style={{
      display: 'flex', height: '100vh',
      background: 'var(--bg)', color: 'var(--text)',
      fontFamily: "'Inter', sans-serif",
    }}>

      {/* Sidebar */}
      <aside style={{
        width: 240, background: PTI_DARK,
        borderRight: `1px solid ${PTI_MID}`,
        display: 'flex', flexDirection: 'column', flexShrink: 0,
      }}>

        {/* Logo PTI Analytics */}
        <div style={{
          padding: '20px 18px',
          borderBottom: `1px solid ${PTI_MID}`,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          {/* Punto dorado */}
          <div style={{
            width: 10, height: 10, borderRadius: '50%',
            background: PTI_GOLD, flexShrink: 0,
            boxShadow: `0 0 8px ${PTI_GOLD}88`,
          }} />
          <span style={{
            fontWeight: 700, fontSize: 16,
            letterSpacing: '-0.3px', color: '#FFFFFF',
            fontFamily: "'Inter', sans-serif",
          }}>
            PTI <span style={{ color: PTI_GOLD }}>Analytics</span>
          </span>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 10px', overflowY: 'auto' }}>
          <NavItem to="/" end gold={PTI_GOLD}>📊 Dashboard</NavItem>

          <div style={{
            fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: 1, color: '#6B8AB8', padding: '14px 10px 6px',
          }}>
            Clientes
          </div>

          {clients.map(c => (
            <NavItem key={c.id} to={`/clients/${c.id}`} gold={PTI_GOLD}>
              <span style={{
                width: 20, height: 20, borderRadius: 5,
                background: PTI_MID,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700, color: PTI_GOLD,
                flexShrink: 0,
              }}>
                {c.name[0].toUpperCase()}
              </span>
              {c.name}
            </NavItem>
          ))}

          <div style={{
            fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: 1, color: '#6B8AB8', padding: '14px 10px 6px',
          }}>
            Herramientas
          </div>
          <NavItem to="/reports" gold={PTI_GOLD}>📄 Informes</NavItem>
        </nav>

        {/* Footer usuario */}
        <div style={{
          padding: '14px 16px',
          borderTop: `1px solid ${PTI_MID}`,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: PTI_MID,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 600, color: PTI_GOLD, flexShrink: 0,
          }}>
            {user?.name?.[0]?.toUpperCase()}
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div style={{
              fontSize: 12, fontWeight: 500, color: '#FFFFFF',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {user?.name}
            </div>
            <div style={{ fontSize: 10, color: '#6B8AB8', textTransform: 'capitalize' }}>
              {user?.role}
            </div>
          </div>
          <button
            onClick={handleLogout}
            title="Cerrar sesión"
            style={{
              background: 'none', border: 'none',
              color: '#6B8AB8', cursor: 'pointer', fontSize: 16,
              padding: 4, borderRadius: 6,
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => e.target.style.color = '#FFFFFF'}
            onMouseLeave={e => e.target.style.color = '#6B8AB8'}
          >
            ⎋
          </button>
        </div>

        {/* Branding PTI */}
        <div style={{
          padding: '8px 16px 12px',
          fontSize: 9, color: '#3A5A8A', textAlign: 'center',
          letterSpacing: 0.5,
        }}>
          pticonsultingpartner.com
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)' }}>
        <Outlet />
      </main>
    </div>
  );
}

function NavItem({ to, end, children, gold }) {
  return (
    <NavLink
      to={to}
      end={end}
      style={({ isActive }) => ({
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 10px', borderRadius: 8, marginBottom: 2,
        textDecoration: 'none', fontSize: 13,
        background: isActive ? `${gold}22` : 'transparent',
        color: isActive ? gold : '#8AAFD4',
        fontWeight: isActive ? 600 : 400,
        transition: 'all 0.15s',
        borderLeft: isActive ? `3px solid ${gold}` : '3px solid transparent',
      })}
    >
      {children}
    </NavLink>
  );
}
