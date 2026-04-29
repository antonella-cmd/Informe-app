// ============================================================
// src/components/Layout.jsx — PTI Analytics (sidebar completo)
// ============================================================
import { Outlet, NavLink, useNavigate, useParams, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useEffect, useState } from 'react';
import { clientsAPI } from '../services/api';

const PTI_DARK = '#0A1628';
const PTI_GOLD = '#E8A020';
const PTI_MID  = '#1B3A6B';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();
  const { clientId } = useParams();
  const [clients, setClients] = useState([]);

  // Detectar qué cliente está activo desde la URL
  const activeClientId = location.pathname.match(/\/clients\/(\d+)/)?.[1];

  useEffect(() => {
    clientsAPI.list().then(r => setClients(r.data || [])).catch(() => {});
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: "'Inter', sans-serif" }}>

      {/* ── Sidebar ── */}
      <aside style={{
        width: 240, background: PTI_DARK,
        borderRight: `1px solid ${PTI_MID}`,
        display: 'flex', flexDirection: 'column', flexShrink: 0,
        overflowY: 'auto',
      }}>

        {/* Logo */}
        <div style={{
          padding: '20px 18px', borderBottom: `1px solid ${PTI_MID}`,
          display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        }}>
          <div style={{
            width: 10, height: 10, borderRadius: '50%',
            background: PTI_GOLD, boxShadow: `0 0 8px ${PTI_GOLD}88`, flexShrink: 0,
          }} />
          <span style={{ fontWeight: 700, fontSize: 16, color: '#FFFFFF', letterSpacing: '-0.3px' }}>
            PTI <span style={{ color: PTI_GOLD }}>Analytics</span>
          </span>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 10px' }}>

          <NavItem to="/" end>🏠 Inicio</NavItem>

          <Label>Clientes</Label>
          {clients.map(c => {
            const isActive = String(activeClientId) === String(c.id);
            return (
              <div key={c.id}>
                {/* Nombre del cliente */}
                <NavLink
                  to={`/clients/${c.id}`}
                  style={({ isActive }) => ({
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 10px', borderRadius: 8, marginBottom: 2,
                    textDecoration: 'none', fontSize: 13,
                    background: isActive ? `${PTI_GOLD}22` : 'transparent',
                    color: isActive ? PTI_GOLD : '#8AAFD4',
                    fontWeight: isActive ? 600 : 400,
                    borderLeft: isActive ? `3px solid ${PTI_GOLD}` : '3px solid transparent',
                    transition: 'all 0.15s',
                  })}
                >
                  <span style={{
                    width: 20, height: 20, borderRadius: 5, background: PTI_MID,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 700, color: PTI_GOLD, flexShrink: 0,
                  }}>
                    {c.name[0].toUpperCase()}
                  </span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.name}
                  </span>
                </NavLink>

                {/* Submenú — visible cuando el cliente está activo */}
                {isActive && (
                  <div style={{ paddingLeft: 14, marginBottom: 4 }}>
                    <SubItem to={`/clients/${c.id}`}>📊 Dashboard</SubItem>
                    <SubItem to={`/clients/${c.id}/connections`}>🔗 Conexiones</SubItem>
                    <SubItem to={`/clients/${c.id}/upload`}>📥 Importar datos</SubItem>
                    <SubItem to={`/clients/${c.id}/ai-insights`}>🤖 Análisis IA</SubItem>
                  </div>
                )}
              </div>
            );
          })}

          <Label>Herramientas</Label>
          <NavItem to="/reports">📄 Informes</NavItem>
          <NavItem to="/reports/builder">🔧 Constructor</NavItem>
          {user?.role === 'admin' && (
            <NavItem to="/admin">⚙️ Administración</NavItem>
          )}
        </nav>

        {/* Footer usuario */}
        <div style={{
          padding: '14px 16px', borderTop: `1px solid ${PTI_MID}`,
          display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%', background: PTI_MID,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 600, color: PTI_GOLD, flexShrink: 0,
          }}>
            {user?.name?.[0]?.toUpperCase()}
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#FFFFFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.name}
            </div>
            <div style={{ fontSize: 10, color: '#6B8AB8', textTransform: 'capitalize' }}>{user?.role}</div>
          </div>
          <button
            onClick={handleLogout} title="Cerrar sesión"
            style={{ background: 'none', border: 'none', color: '#6B8AB8', cursor: 'pointer', fontSize: 16, padding: 4, borderRadius: 6 }}
            onMouseEnter={e => e.target.style.color = '#FFFFFF'}
            onMouseLeave={e => e.target.style.color = '#6B8AB8'}
          >⎋</button>
        </div>

        <div style={{ padding: '8px 16px 12px', fontSize: 9, color: '#3A5A8A', textAlign: 'center', letterSpacing: 0.5 }}>
          pticonsultingpartner.com
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflowY: 'auto', background: 'var(--bg, #0F1623)' }}>
        <Outlet />
      </main>
    </div>
  );
}

function Label({ children }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
      letterSpacing: 1, color: '#6B8AB8', padding: '14px 10px 6px',
    }}>{children}</div>
  );
}

function NavItem({ to, end, children }) {
  return (
    <NavLink to={to} end={end} style={({ isActive }) => ({
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 10px', borderRadius: 8, marginBottom: 2,
      textDecoration: 'none', fontSize: 13,
      background: isActive ? `${PTI_GOLD}22` : 'transparent',
      color: isActive ? PTI_GOLD : '#8AAFD4',
      fontWeight: isActive ? 600 : 400,
      borderLeft: isActive ? `3px solid ${PTI_GOLD}` : '3px solid transparent',
      transition: 'all 0.15s',
    })}>
      {children}
    </NavLink>
  );
}

function SubItem({ to, children }) {
  return (
    <NavLink to={to} end style={({ isActive }) => ({
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '6px 10px', borderRadius: 6, marginBottom: 1,
      textDecoration: 'none', fontSize: 12,
      background: isActive ? `${PTI_GOLD}18` : 'transparent',
      color: isActive ? PTI_GOLD : '#6B8AB8',
      fontWeight: isActive ? 600 : 400,
      transition: 'all 0.15s',
    })}>
      {children}
    </NavLink>
  );
}
