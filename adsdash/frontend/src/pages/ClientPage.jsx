// ============================================================
// src/pages/ClientPage.jsx
// Per-client dashboard: KPIs + Charts + Campaign table
// ============================================================
import { useEffect, useState, useCallback } from 'react';
import { useParams, Link }     from 'react-router-dom';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { format, subDays }     from 'date-fns';
import { dashboardAPI }        from '../services/api';

// ── helpers ──────────────────────────────────────────────
const fmt = n => n == null ? '—' : Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 });
const fmtUSD = n => n == null ? '—' : '$' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = n => n == null ? '—' : Number(n).toFixed(2) + '%';
const today  = () => format(new Date(), 'yyyy-MM-dd');
const nDaysAgo = n => format(subDays(new Date(), n), 'yyyy-MM-dd');

const PLATFORM_COLOR = { google_ads: '#4285F4', meta_ads: '#0866FF' };

// ── KPI Card ─────────────────────────────────────────────
function KpiCard({ label, value, sub, color }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '16px 20px',
    }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase',
                    letterSpacing: '0.5px', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.5px',
                    color: color || 'var(--text)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ── Platform badge ────────────────────────────────────────
function PlatBadge({ platform }) {
  const isGoogle = platform === 'google_ads';
  return (
    <span style={{
      fontSize: 10, padding: '2px 8px', borderRadius: 4, fontWeight: 600,
      background: isGoogle ? 'rgba(66,133,244,0.15)' : 'rgba(8,102,255,0.15)',
      color:      isGoogle ? '#4285F4'               : '#60A5FF',
    }}>
      {isGoogle ? 'Google' : 'Meta'}
    </span>
  );
}

// ── Status badge ──────────────────────────────────────────
function StatusBadge({ status }) {
  const active = ['ENABLED', 'ACTIVE'].includes(status?.toUpperCase());
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: active ? '#34C78A' : '#FFB547',
      }} />
      {active ? 'Activa' : 'Pausada'}
    </span>
  );
}

// ── Main Page ─────────────────────────────────────────────
export default function ClientPage() {
  const { clientId } = useParams();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [tab,     setTab]     = useState('all');    // 'all' | 'google' | 'meta'
  const [start,   setStart]   = useState(nDaysAgo(29));
  const [end,     setEnd]     = useState(today());
  const [sortCol, setSortCol] = useState('spend');
  const [sortDir, setSortDir] = useState('desc');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await dashboardAPI.overview(clientId, start, end);
      setData(res.data);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }, [clientId, start, end]);

  useEffect(() => { load(); }, [load]);

  // Filter campaigns by tab
  const campaigns = (data?.campaigns || []).filter(c => {
    if (tab === 'google') return c.platform === 'google_ads';
    if (tab === 'meta')   return c.platform === 'meta_ads';
    return true;
  }).sort((a, b) => {
    const v = sortDir === 'desc' ? b[sortCol] - a[sortCol] : a[sortCol] - b[sortCol];
    return isNaN(v) ? 0 : v;
  });

  const handleSort = col => {
    if (sortCol === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortCol(col); setSortDir('desc'); }
  };

  const { kpis, timeSeries } = data || {};

  return (
    <div style={{ padding: '24px', maxWidth: 1400 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Dashboard del cliente</h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, margin: '4px 0 0' }}>
            Google Ads + Meta Ads unificados
          </p>
        </div>
        {/* Date pickers */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="date" value={start} onChange={e => setStart(e.target.value)}
            style={inputStyle} />
          <span style={{ color: 'var(--muted)' }}>→</span>
          <input type="date" value={end}   onChange={e => setEnd(e.target.value)}
            style={inputStyle} />
          <button onClick={load} style={btnStyle}>Aplicar</button>
        </div>
        <Link to={`/clients/${clientId}/connections`} style={{ ...btnStyle, textDecoration: 'none' }}>
          ⚙ Conexiones
        </Link>
      </div>

      {error && (
        <div style={{ background: 'rgba(255,77,106,0.1)', border: '1px solid rgba(255,77,106,0.3)',
                      borderRadius: 8, padding: '12px 16px', color: '#FF4D6A', marginBottom: 20 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 80, color: 'var(--muted)' }}>
          Cargando datos…
        </div>
      ) : !data ? null : (
        <>
          {/* KPI Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: 24 }}>
            <KpiCard label="Inversión total"   value={fmtUSD(kpis.total_spend)}       />
            <KpiCard label="Clicks totales"    value={fmt(kpis.total_clicks)}          />
            <KpiCard label="Conversiones"      value={fmt(kpis.total_conversions)} color="#34C78A" />
            <KpiCard label="ROAS"              value={`${Number(kpis.roas).toFixed(2)}x`} color="#FFB547" />
            <KpiCard label="CPA promedio"      value={fmtUSD(kpis.cpa)}               />
          </div>

          {/* Platform breakdown */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 24 }}>
            {[
              { key: 'google', label: 'Google Ads', color: '#4285F4', d: kpis.google },
              { key: 'meta',   label: 'Meta Ads',   color: '#0866FF', d: kpis.meta   },
            ].map(({ key, label, color, d }) => d && (
              <div key={key} style={{ background: 'var(--surface)', border: '1px solid var(--border)',
                                      borderRadius: 12, padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{label}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  {[
                    ['Inversión',    fmtUSD(d.spend)],
                    ['Clicks',       fmt(d.clicks)],
                    ['Conversiones', fmt(d.conversions)],
                    ['ROAS',         `${(d.revenue && d.spend ? d.revenue/d.spend : 0).toFixed(2)}x`],
                    ['CPA',          fmtUSD(d.spend && d.conversions ? d.spend/d.conversions : 0)],
                    ['CTR',          fmtPct(d.ctr)],
                  ].map(([l, v]) => (
                    <div key={l}>
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>{l}</div>
                      <div style={{ fontSize: 15, fontWeight: 600 }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Time Series Chart */}
          {timeSeries?.length > 0 && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)',
                          borderRadius: 12, padding: 20, marginBottom: 24 }}>
              <div style={{ fontWeight: 600, marginBottom: 16 }}>Inversión y Conversiones diarias</div>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={timeSeries}>
                  <defs>
                    <linearGradient id="gSpend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#4285F4" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#4285F4" stopOpacity={0}   />
                    </linearGradient>
                    <linearGradient id="gConv" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#34C78A" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#34C78A" stopOpacity={0}   />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" tick={{ fill: '#7A8099', fontSize: 10 }}
                         tickFormatter={d => d.slice(5)} />
                  <YAxis yAxisId="l" tick={{ fill: '#7A8099', fontSize: 10 }}
                         tickFormatter={v => '$' + (v/1000).toFixed(0) + 'k'} />
                  <YAxis yAxisId="r" orientation="right" tick={{ fill: '#34C78A', fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ background: '#161920', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                    labelStyle={{ color: '#fff' }}
                    formatter={(v, name) => name === 'spend' ? ['$' + v.toFixed(2), 'Inversión'] : [v, 'Conversiones']}
                  />
                  <Area yAxisId="l" type="monotone" dataKey="spend"
                        stroke="#4285F4" fill="url(#gSpend)" strokeWidth={2} dot={false} />
                  <Area yAxisId="r" type="monotone" dataKey="conversions"
                        stroke="#34C78A" fill="url(#gConv)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Platform tabs + Campaign table */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)',
                          display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>Campañas</span>
              <div style={{ display: 'flex', gap: 4, background: 'var(--bg)', borderRadius: 8, padding: 3 }}>
                {[['all','Todas'],['google','Google'],['meta','Meta']].map(([v, l]) => (
                  <button key={v} onClick={() => setTab(v)} style={{
                    padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                    fontSize: 12, fontWeight: 500,
                    background: tab === v ? 'var(--surface)' : 'transparent',
                    color: tab === v ? 'var(--text)' : 'var(--muted)',
                  }}>{l}</button>
                ))}
              </div>
              <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' }}>
                {campaigns.length} campañas
              </span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {[
                      ['Campaña', 'name', false],
                      ['Plataforma', 'platform', false],
                      ['Estado', 'status', false],
                      ['Inversión', 'spend', true],
                      ['Clicks', 'clicks', true],
                      ['Conv.', 'conversions', true],
                      ['CPA', 'cpa', true],
                      ['ROAS', 'roas', true],
                      ['CTR', 'ctr', true],
                    ].map(([label, col, sortable]) => (
                      <th key={col} onClick={sortable ? () => handleSort(col) : undefined}
                        style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10,
                                 fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px',
                                 color: sortCol === col ? 'var(--text)' : 'var(--muted)',
                                 borderBottom: '1px solid var(--border)',
                                 cursor: sortable ? 'pointer' : 'default',
                                 userSelect: 'none', whiteSpace: 'nowrap' }}>
                        {label} {sortable && sortCol === col ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map(c => (
                    <tr key={`${c.platform}-${c.id}`}
                      style={{ borderBottom: '1px solid var(--border)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '11px 16px', fontWeight: 500, maxWidth: 220,
                                   overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.name}
                      </td>
                      <td style={{ padding: '11px 16px' }}><PlatBadge platform={c.platform} /></td>
                      <td style={{ padding: '11px 16px' }}><StatusBadge status={c.status} /></td>
                      <td style={{ padding: '11px 16px' }}>{fmtUSD(c.spend)}</td>
                      <td style={{ padding: '11px 16px' }}>{fmt(c.clicks)}</td>
                      <td style={{ padding: '11px 16px' }}>{fmt(c.conversions)}</td>
                      <td style={{ padding: '11px 16px' }}>{c.cpa > 0 ? fmtUSD(c.cpa) : '—'}</td>
                      <td style={{ padding: '11px 16px', color: c.roas >= 3 ? '#34C78A' : c.roas > 0 ? '#FFB547' : 'var(--muted)' }}>
                        {c.roas > 0 ? `${c.roas.toFixed(2)}x` : '—'}
                      </td>
                      <td style={{ padding: '11px 16px' }}>{fmtPct(c.ctr)}</td>
                    </tr>
                  ))}
                  {campaigns.length === 0 && (
                    <tr>
                      <td colSpan={9} style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
                        No hay campañas para este período
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const inputStyle = {
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
  padding: '7px 10px', color: 'var(--text)', fontSize: 12, outline: 'none',
  colorScheme: 'dark',
};
const btnStyle = {
  background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8,
  padding: '7px 14px', color: 'var(--text)', fontSize: 12, cursor: 'pointer',
};
