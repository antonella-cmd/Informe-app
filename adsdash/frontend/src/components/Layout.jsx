// ============================================================
// src/components/Layout.jsx
// ============================================================
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth }  from '../context/AuthContext';
import { useEffect, useState } from 'react';
import { clientsAPI } from '../services/api';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);

  useEffect(() => {
    clientsAPI.list().then(r => setClients(r.data || [])).catch(() => {});
  }, []);

  const handleLogout = async () => { await logout(); navigate('/login'); };

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
      {/* Sidebar */}
      <aside style={{
        width: 220, background: 'var(--surface)', borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', flexShrink: 0,
      }}>
        {/* Logo */}
        <div style={{ padding: '18px 16px', borderBottom: '1px solid var(--border)',
                      display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 7,
            background: 'linear-gradient(135deg, #4285F4, #9B6DFF)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 14, color: '#fff',
          }}>M</div>
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.3px' }}>
            Metrics<span style={{ color: '#9B6DFF' }}>Hub</span>
          </span>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '10px 8px', overflowY: 'auto' }}>
          <NavItem to="/" end>📊 Dashboard</NavItem>

          <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
                        letterSpacing: 1, color: 'var(--muted)', padding: '12px 10px 4px' }}>
            Clientes
          </div>
          {clients.map(c => (
            <NavItem key={c.id} to={`/clients/${c.id}`}>
              <span style={{
                width: 18, height: 18, borderRadius: 5, background: 'var(--surface2)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700, color: '#9B6DFF',
              }}>{c.name[0].toUpperCase()}</span>
              {c.name}
            </NavItem>
          ))}

          <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
                        letterSpacing: 1, color: 'var(--muted)', padding: '12px 10px 4px' }}>
            Herramientas
          </div>
          <NavItem to="/reports">📄 Informes</NavItem>
        </nav>

        {/* User */}
        <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)',
                      display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 30, height: 30, borderRadius: '50%', background: 'var(--surface2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 600, color: '#9B6DFF',
          }}>{user?.name?.[0]?.toUpperCase()}</div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.name}
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>{user?.role}</div>
          </div>
          <button onClick={handleLogout} title="Cerrar sesión" style={{
            background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 14,
          }}>⎋</button>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflowY: 'auto' }}>
        <Outlet />
      </main>
    </div>
  );
}

function NavItem({ to, end, children }) {
  return (
    <NavLink to={to} end={end} style={({ isActive }) => ({
      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
      borderRadius: 8, marginBottom: 1, textDecoration: 'none', fontSize: 13,
      background: isActive ? 'rgba(155,109,255,0.15)' : 'transparent',
      color: isActive ? '#9B6DFF' : 'var(--muted)',
      transition: 'all 0.15s',
    })}>
      {children}
    </NavLink>
  );
}
