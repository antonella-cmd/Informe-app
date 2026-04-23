// ============================================================
// src/pages/AdminPage.jsx — Gestión de usuarios y roles
// ============================================================
import { useState, useEffect } from 'react';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || '';
const PTI_DARK = '#0A1628';
const PTI_GOLD = '#E8A020';

const roleColors = {
  admin:  { bg: '#FEF2F2', text: '#C0392B', label: 'Admin'  },
  editor: { bg: '#EFF6FF', text: '#1B3A6B', label: 'Editor' },
  viewer: { bg: '#F0FDF4', text: '#2D7D46', label: 'Viewer' },
};

export default function AdminPage() {
  const [users, setUsers]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [health, setHealth]         = useState(null);
  const [form, setForm]             = useState({ name: '', email: '', password: '', role: 'editor' });
  const [formError, setFormError]   = useState('');
  const [saving, setSaving]         = useState(false);
  const [search, setSearch]         = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [usersRes, healthRes] = await Promise.all([
        axios.get(`${API}/api/admin/users`, { withCredentials: true }),
        axios.get(`${API}/api/admin/health`, { withCredentials: true }),
      ]);
      setUsers(usersRes.data.items || []);
      setHealth(healthRes.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const createUser = async () => {
    if (!form.name || !form.email || !form.password) {
      setFormError('Todos los campos son requeridos');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      await axios.post(`${API}/api/admin/users`, form, { withCredentials: true });
      setShowCreate(false);
      setForm({ name: '', email: '', password: '', role: 'editor' });
      load();
    } catch (e) {
      setFormError(e.response?.data?.error || 'Error al crear usuario');
    } finally {
      setSaving(false);
    }
  };

  const changeRole = async (userId, newRole) => {
    try {
      await axios.put(`${API}/api/admin/users/${userId}/role`, { role: newRole }, { withCredentials: true });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
    } catch (e) {
      alert(e.response?.data?.error || 'Error al cambiar rol');
    }
  };

  const deleteUser = async (userId, name) => {
    if (!confirm(`¿Eliminar a ${name}?`)) return;
    try {
      await axios.delete(`${API}/api/admin/users/${userId}`, { withCredentials: true });
      setUsers(prev => prev.filter(u => u.id !== userId));
    } catch (e) {
      alert(e.response?.data?.error || 'Error al eliminar usuario');
    }
  };

  const filtered = users.filter(u =>
    u.name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ padding: 32, maxWidth: 1100, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: PTI_DARK, marginBottom: 6 }}>
            ⚙️ Administración
          </h1>
          <p style={{ color: '#6B8AB8', fontSize: 14 }}>Gestión de usuarios, roles y salud del sistema</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={{
            background: PTI_GOLD, color: 'white', border: 'none',
            borderRadius: 8, padding: '10px 20px', fontWeight: 600,
            fontSize: 14, cursor: 'pointer',
          }}
        >
          + Nuevo consultor
        </button>
      </div>

      {/* Health cards */}
      {health && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
          {[
            { label: 'Estado',     value: health.status === 'ok' ? '✅ Online' : '❌ Error', color: '#2D7D46' },
            { label: 'Usuarios',   value: health.users,     color: PTI_DARK },
            { label: 'Clientes',   value: health.clients,   color: PTI_DARK },
            { label: 'Campañas',   value: health.campaigns, color: PTI_DARK },
          ].map(s => (
            <div key={s.label} style={{
              background: 'white', border: '1px solid #E0E8F0',
              borderRadius: 10, padding: 18, borderTop: `3px solid ${PTI_GOLD}`,
            }}>
              <div style={{ fontSize: 11, color: '#6B8AB8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                {s.label}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Buscador */}
      <div style={{ marginBottom: 16 }}>
        <input
          type="text" value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Buscar por nombre o email..."
          style={{
            width: '100%', maxWidth: 400, padding: '9px 14px',
            borderRadius: 8, border: '1px solid #D0DCE8',
            fontSize: 13, fontFamily: 'Inter, sans-serif',
            outline: 'none', boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Tabla de usuarios */}
      <div style={{ background: 'white', border: '1px solid #E0E8F0', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: PTI_DARK }}>
              {['Nombre', 'Email', 'Rol', 'Creado', 'Acciones'].map(h => (
                <th key={h} style={{
                  padding: '12px 16px', textAlign: 'left',
                  color: 'white', fontSize: 12, fontWeight: 600,
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: 40, color: '#6B8AB8' }}>Cargando...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: 40, color: '#9AAFCC' }}>No hay usuarios</td></tr>
            ) : filtered.map((user, i) => {
              const rc = roleColors[user.role] || roleColors.viewer;
              return (
                <tr key={user.id} style={{ borderBottom: '1px solid #F0F4F8', background: i % 2 === 0 ? 'white' : '#FAFBFC' }}>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%',
                        background: PTI_DARK, color: PTI_GOLD,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 700, flexShrink: 0,
                      }}>
                        {user.name?.[0]?.toUpperCase()}
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: PTI_DARK }}>{user.name}</span>
                    </div>
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: 13, color: '#4A6080' }}>{user.email}</td>
                  <td style={{ padding: '14px 16px' }}>
                    <select
                      value={user.role}
                      onChange={e => changeRole(user.id, e.target.value)}
                      style={{
                        background: rc.bg, color: rc.text,
                        border: 'none', borderRadius: 20,
                        padding: '4px 12px', fontSize: 11, fontWeight: 600,
                        cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                      }}
                    >
                      <option value="admin">Admin</option>
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: 12, color: '#9AAFCC' }}>
                    {new Date(user.created_at).toLocaleDateString('es-AR')}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <button
                      onClick={() => deleteUser(user.id, user.name)}
                      style={{
                        background: '#FEF2F2', color: '#C0392B', border: '1px solid #FECACA',
                        borderRadius: 6, padding: '5px 12px', fontSize: 12,
                        cursor: 'pointer', fontWeight: 500,
                      }}
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal crear usuario */}
      {showCreate && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(10,22,40,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
        }}>
          <div style={{
            background: 'white', borderRadius: 16, padding: 32, width: 420,
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: PTI_DARK, marginBottom: 20 }}>
              Crear consultor
            </h2>
            {[
              { label: 'Nombre completo', key: 'name',     type: 'text',     placeholder: 'Ej: María González' },
              { label: 'Email',           key: 'email',    type: 'email',    placeholder: 'maria@pticonsulting.com' },
              { label: 'Contraseña',      key: 'password', type: 'password', placeholder: 'Mínimo 8 caracteres' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, color: '#6B8AB8', display: 'block', marginBottom: 6 }}>{f.label}</label>
                <input
                  type={f.type} value={form[f.key]} placeholder={f.placeholder}
                  onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                  style={{
                    width: '100%', padding: '10px 14px', borderRadius: 8,
                    border: '1px solid #D0DCE8', fontSize: 13,
                    fontFamily: 'Inter, sans-serif', outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>
            ))}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, color: '#6B8AB8', display: 'block', marginBottom: 6 }}>Rol</label>
              <select
                value={form.role}
                onChange={e => setForm(prev => ({ ...prev, role: e.target.value }))}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 8,
                  border: '1px solid #D0DCE8', fontSize: 13,
                  fontFamily: 'Inter, sans-serif', outline: 'none', background: 'white',
                }}
              >
                <option value="editor">Editor (consultor PTI)</option>
                <option value="admin">Admin (acceso total)</option>
              </select>
            </div>
            {formError && (
              <p style={{ color: '#C0392B', fontSize: 12, marginBottom: 16 }}>⚠️ {formError}</p>
            )}
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => { setShowCreate(false); setFormError(''); }}
                style={{
                  flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #D0DCE8',
                  background: 'white', color: '#6B8AB8', cursor: 'pointer', fontWeight: 600,
                }}
              >
                Cancelar
              </button>
              <button
                onClick={createUser} disabled={saving}
                style={{
                  flex: 1, padding: '10px', borderRadius: 8, border: 'none',
                  background: saving ? '#9AAFCC' : PTI_DARK, color: 'white',
                  cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 600,
                }}
              >
                {saving ? 'Creando...' : 'Crear consultor'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
