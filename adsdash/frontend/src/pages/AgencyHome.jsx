// ============================================================
// src/pages/AgencyHome.jsx
// Multi-client overview for the agency
// ============================================================
import { useEffect, useState } from 'react';
import { Link }                from 'react-router-dom';
import { format, subDays }     from 'date-fns';
import { dashboardAPI, clientsAPI } from '../services/api';

const fmtUSD = n => '$' + Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 });
const fmtNum = n => Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 1 });

export default function AgencyHome() {
  const [clients,  setClients]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [showNew,  setShowNew]  = useState(false);
  const [newName,  setNewName]  = useState('');
  const [creating, setCreating] = useState(false);

  const start = format(subDays(new Date(), 29), 'yyyy-MM-dd');
  const end   = format(new Date(), 'yyyy-MM-dd');

  useEffect(() => {
    dashboardAPI.clientsSummary(start, end)
      .then(r => setClients(r.data.clients || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const createClient = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const r = await clientsAPI.create({ name: newName.trim() });
      setClients(prev => [...prev, r.data]);
      setNewName('');
      setShowNew(false);
    } finally { setCreating(false); }
  };

  // Aggregate totals
  const totals = clients.reduce((acc, c) => ({
    spend:       acc.spend       + (c.spend || 0),
    conversions: acc.conversions + (c.conversions || 0),
    revenue:     acc.revenue     + (c.revenue     || 0),
  }), { spend: 0, conversions: 0, revenue: 0 });
  totals.roas = totals.spend > 0 ? totals.revenue / totals.spend : 0;

  return (
    <div style={{ padding: '24px', maxWidth: 1400 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Vista de Agencia</h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>
            Últimos 30 días · {clients.length} clientes activos
          </p>
        </div>
        <button onClick={() => setShowNew(true)} style={{
          background: 'var(--accent-purple)', border: 'none', borderRadius: 9, padding: '9px 18px',
          color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer',
        }}>
          + Nuevo cliente
        </button>
      </div>

      {/* Agency KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
        {[
          { label: 'Inversión total',   value: fmtUSD(totals.spend) },
          { label: 'Conversiones',      value: fmtNum(totals.conversions), color: '#34C78A' },
          { label: 'Revenue generado',  value: fmtUSD(totals.revenue) },
          { label: 'ROAS promedio',     value: `${totals.roas.toFixed(2)}x`, color: '#FFB547' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: 'var(--surface)', border: '1px solid var(--border)',
                                    borderRadius: 12, padding: '16px 20px' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase',
                          letterSpacing: '0.5px', marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: color || 'var(--text)' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Clients Grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>Cargando clientes…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {clients.map(client => (
            <Link key={client.id} to={`/clients/${client.id}`}
              style={{ textDecoration: 'none', color: 'inherit' }}>
              <div style={{
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
                padding: 20, cursor: 'pointer', transition: 'border-color 0.15s, transform 0.15s',
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'translateY(0)'; }}
              >
                {/* Client header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 10, background: 'var(--surface2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16, fontWeight: 700, color: 'var(--accent-purple)',
                  }}>
                    {client.name[0].toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{client.name}</div>
                    <div style={{ display: 'flex', gap: 5, marginTop: 3 }}>
                      {(client.platforms || []).map(p => (
                        <span key={p} style={{
                          fontSize: 9, padding: '1px 6px', borderRadius: 4, fontWeight: 700,
                          background: p === 'google_ads' ? 'rgba(66,133,244,0.2)' : 'rgba(8,102,255,0.2)',
                          color:      p === 'google_ads' ? '#4285F4'              : '#60A5FF',
                        }}>
                          {p === 'google_ads' ? 'G' : 'M'}
                        </span>
                      ))}
                      {(!client.platforms || client.platforms.length === 0) && (
                        <span style={{ fontSize: 10, color: 'var(--muted)' }}>Sin conexiones</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Metrics */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {[
                    ['Inversión',    fmtUSD(client.spend)],
                    ['ROAS',         `${Number(client.roas || 0).toFixed(2)}x`],
                    ['Conversiones', fmtNum(client.conversions)],
                    ['Revenue',      fmtUSD(client.revenue)],
                  ].map(([l, v]) => (
                    <div key={l} style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 12px' }}>
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3 }}>{l}</div>
                      <div style={{ fontSize: 15, fontWeight: 600 }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* New client modal */}
      {showNew && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
        }} onClick={() => setShowNew(false)}>
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 16, padding: 28, width: 380,
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 20px', fontSize: 16 }}>Nuevo cliente</h3>
            <input
              value={newName} onChange={e => setNewName(e.target.value)}
              placeholder="Nombre del cliente"
              onKeyDown={e => e.key === 'Enter' && createClient()}
              autoFocus
              style={{
                width: '100%', background: 'var(--bg)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '10px 14px', color: 'var(--text)', fontSize: 14,
                outline: 'none', marginBottom: 16, boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowNew(false)} style={{
                flex: 1, padding: '9px', borderRadius: 8, border: '1px solid var(--border)',
                background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontSize: 13,
              }}>Cancelar</button>
              <button onClick={createClient} disabled={creating || !newName.trim()} style={{
                flex: 1, padding: '9px', borderRadius: 8, border: 'none',
                background: 'var(--accent-purple)', color: '#fff', cursor: 'pointer',
                fontSize: 13, fontWeight: 600, opacity: creating ? 0.6 : 1,
              }}>
                {creating ? 'Creando…' : 'Crear cliente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
