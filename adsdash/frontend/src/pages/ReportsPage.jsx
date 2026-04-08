import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { dashboardAPI, clientsAPI } from '../services/api';
import { format, subDays, subWeeks, subMonths, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';

const fmtUSD = n => '$' + Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtNum = n => Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 1 });
const fmtPct = n => Number(n || 0).toFixed(2) + '%';
const today = () => format(new Date(), 'yyyy-MM-dd');
const nDaysAgo = n => format(subDays(new Date(), n), 'yyyy-MM-dd');

const PRESETS = [
  { label: 'Hoy', value: 'today' },
  { label: 'Ayer', value: 'yesterday' },
  { label: 'Últimos 7 días', value: '7d' },
  { label: 'Últimos 14 días', value: '14d' },
  { label: 'Últimos 30 días', value: '30d' },
  { label: 'Esta semana', value: 'this_week' },
  { label: 'Semana pasada', value: 'last_week' },
  { label: 'Este mes', value: 'this_month' },
  { label: 'Mes pasado', value: 'last_month' },
  { label: 'Personalizado', value: 'custom' },
];

function getDateRange(preset) {
  const now = new Date();
  switch (preset) {
    case 'today': return { start: today(), end: today() };
    case 'yesterday': return { start: nDaysAgo(1), end: nDaysAgo(1) };
    case '7d': return { start: nDaysAgo(6), end: today() };
    case '14d': return { start: nDaysAgo(13), end: today() };
    case '30d': return { start: nDaysAgo(29), end: today() };
    case 'this_week': return { start: format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'), end: today() };
    case 'last_week': return {
      start: format(startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }), 'yyyy-MM-dd'),
      end: format(endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }), 'yyyy-MM-dd'),
    };
    case 'this_month': return { start: format(startOfMonth(now), 'yyyy-MM-dd'), end: today() };
    case 'last_month': return {
      start: format(startOfMonth(subMonths(now, 1)), 'yyyy-MM-dd'),
      end: format(endOfMonth(subMonths(now, 1)), 'yyyy-MM-dd'),
    };
    default: return { start: nDaysAgo(29), end: today() };
  }
}

function getPreviousPeriod(start, end) {
  const s = new Date(start), e = new Date(end);
  const days = Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
  return {
    start: format(subDays(s, days), 'yyyy-MM-dd'),
    end: format(subDays(s, 1), 'yyyy-MM-dd'),
  };
}

function Delta({ current, previous, format: fmt = fmtUSD }) {
  if (!previous || previous === 0) return null;
  const pct = ((current - previous) / previous) * 100;
  const up = pct >= 0;
  return (
    <span style={{ fontSize: 11, color: up ? '#34C78A' : '#FF4D6A', marginLeft: 6, fontWeight: 500 }}>
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function KpiCard({ label, value, prevValue, color }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }}>
      <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: color || 'var(--text)' }}>{value}</div>
        <Delta current={parseFloat(value?.replace(/[^0-9.-]/g, '') || 0)} previous={prevValue} />
      </div>
      {prevValue !== undefined && (
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
          Período anterior: {typeof prevValue === 'number' && prevValue > 100 ? fmtUSD(prevValue) : fmtNum(prevValue)}
        </div>
      )}
    </div>
  );
}

export default function ReportsPage() {
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [preset, setPreset] = useState('30d');
  const [customStart, setCustomStart] = useState(nDaysAgo(29));
  const [customEnd, setCustomEnd] = useState(today());
  const [data, setData] = useState(null);
  const [prevData, setPrevData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [comparing, setComparing] = useState(true);
  const [shareUrl, setShareUrl] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    clientsAPI.list().then(r => {
      setClients(r.data || []);
      if (r.data?.length > 0) setSelectedClient(String(r.data[0].id));
    });
  }, []);

  const getRange = () => preset === 'custom'
    ? { start: customStart, end: customEnd }
    : getDateRange(preset);

  const loadData = useCallback(async () => {
    if (!selectedClient) return;
    setLoading(true);
    setData(null); setPrevData(null);
    try {
      const { start, end } = getRange();
      const res = await dashboardAPI.overview(selectedClient, start, end);
      setData(res.data);
      if (comparing) {
        const prev = getPreviousPeriod(start, end);
        const prevRes = await dashboardAPI.overview(selectedClient, prev.start, prev.end);
        setPrevData(prevRes.data);
      }
    } catch(e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [selectedClient, preset, customStart, customEnd, comparing]);

  const generateShareUrl = () => {
    const { start, end } = getRange();
    const url = `${window.location.origin}/reports/share?client=${selectedClient}&start=${start}&end=${end}`;
    setShareUrl(url);
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const downloadPDF = () => {
    const { start, end } = getRange();
    const clientName = clients.find(c => String(c.id) === selectedClient)?.name || 'Cliente';
    const kpis = data?.kpis || {};
    const prevKpis = prevData?.kpis || {};

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Informe ${clientName}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; color: #1a1a2e; background: #fff; padding: 40px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; border-bottom: 2px solid #9B6DFF; padding-bottom: 20px; }
  .logo { font-size: 24px; font-weight: 800; color: #9B6DFF; }
  .meta { text-align: right; font-size: 12px; color: #666; }
  h2 { font-size: 16px; color: #333; margin: 24px 0 12px; border-left: 4px solid #9B6DFF; padding-left: 10px; }
  .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px; }
  .kpi { background: #f8f7ff; border-radius: 10px; padding: 16px; }
  .kpi-label { font-size: 10px; text-transform: uppercase; color: #888; letter-spacing: 0.5px; margin-bottom: 6px; }
  .kpi-value { font-size: 22px; font-weight: 700; color: #1a1a2e; }
  .kpi-prev { font-size: 11px; color: #999; margin-top: 4px; }
  .delta-up { color: #34C78A; }
  .delta-down { color: #FF4D6A; }
  .plat { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
  .plat-card { background: #f8f9ff; border-radius: 10px; padding: 16px; }
  .plat-title { font-size: 13px; font-weight: 700; margin-bottom: 12px; }
  .plat-row { display: flex; justify-content: space-between; font-size: 12px; padding: 4px 0; border-bottom: 1px solid #eee; }
  .plat-row:last-child { border: none; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 12px; }
  th { background: #9B6DFF; color: white; padding: 8px 10px; text-align: left; font-size: 11px; }
  td { padding: 7px 10px; border-bottom: 1px solid #f0f0f0; }
  tr:nth-child(even) td { background: #fafafa; }
  .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #eee; font-size: 11px; color: #999; text-align: center; }
</style>
</head>
<body>
<div class="header">
  <div>
    <div class="logo">MetricsHub</div>
    <div style="font-size:13px;color:#666;margin-top:4px">Informe de rendimiento</div>
  </div>
  <div class="meta">
    <div style="font-size:16px;font-weight:700;color:#1a1a2e">${clientName}</div>
    <div>${start} → ${end}</div>
    <div>Generado el ${format(new Date(), 'dd/MM/yyyy HH:mm')}</div>
  </div>
</div>

<h2>KPIs principales</h2>
<div class="kpi-grid">
  ${[
    ['Inversión total', fmtUSD(kpis.total_spend), fmtUSD(prevKpis.total_spend)],
    ['Clicks totales', fmtNum(kpis.total_clicks), fmtNum(prevKpis.total_clicks)],
    ['Conversiones', fmtNum(kpis.total_conversions), fmtNum(prevKpis.total_conversions)],
    ['ROAS', Number(kpis.roas || 0).toFixed(2) + 'x', Number(prevKpis.roas || 0).toFixed(2) + 'x'],
    ['CPA promedio', fmtUSD(kpis.cpa), fmtUSD(prevKpis.cpa)],
    ['CTR', fmtPct(kpis.ctr), fmtPct(prevKpis.ctr)],
  ].map(([label, val, prev]) => {
    const curr = parseFloat(val?.replace(/[^0-9.-]/g, '') || 0);
    const prevN = parseFloat(prev?.replace(/[^0-9.-]/g, '') || 0);
    const pct = prevN > 0 ? ((curr - prevN) / prevN * 100).toFixed(1) : null;
    return `<div class="kpi">
      <div class="kpi-label">${label}</div>
      <div class="kpi-value">${val} ${pct !== null ? `<span class="${parseFloat(pct) >= 0 ? 'delta-up' : 'delta-down'}" style="font-size:13px">${parseFloat(pct) >= 0 ? '▲' : '▼'} ${Math.abs(pct)}%</span>` : ''}</div>
      ${prev && prevN > 0 ? `<div class="kpi-prev">Período anterior: ${prev}</div>` : ''}
    </div>`;
  }).join('')}
</div>

<h2>Desglose por plataforma</h2>
<div class="plat">
  ${[['Google Ads', '#4285F4', kpis.google], ['Meta Ads', '#0866FF', kpis.meta]].map(([name, color, d]) => d ? `
  <div class="plat-card">
    <div class="plat-title" style="color:${color}">${name}</div>
    ${[['Inversión', fmtUSD(d.spend)], ['Clicks', fmtNum(d.clicks)], ['Conversiones', fmtNum(d.conversions)], ['ROAS', Number(d.revenue && d.spend ? d.revenue/d.spend : 0).toFixed(2) + 'x'], ['CPA', fmtUSD(d.spend && d.conversions ? d.spend/d.conversions : 0)], ['CTR', fmtPct(d.ctr)]].map(([l, v]) => `<div class="plat-row"><span>${l}</span><span><b>${v}</b></span></div>`).join('')}
  </div>` : '').join('')}
</div>

<h2>Campañas</h2>
<table>
  <thead><tr><th>Campaña</th><th>Plataforma</th><th>Estado</th><th>Inversión</th><th>Clicks</th><th>Conv.</th><th>ROAS</th><th>CTR</th></tr></thead>
  <tbody>
    ${(data?.campaigns || []).slice(0, 20).map(c => `
    <tr>
      <td>${c.name}</td>
      <td>${c.platform === 'google_ads' ? 'Google' : 'Meta'}</td>
      <td>${c.status}</td>
      <td>${fmtUSD(c.spend)}</td>
      <td>${fmtNum(c.clicks)}</td>
      <td>${fmtNum(c.conversions)}</td>
      <td>${c.roas > 0 ? c.roas.toFixed(2) + 'x' : '—'}</td>
      <td>${fmtPct(c.ctr)}</td>
    </tr>`).join('')}
  </tbody>
</table>

<div class="footer">MetricsHub · PTI Consulting Partner · Generado automáticamente</div>
</body>
</html>`;

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 500);
  };

  const { start, end } = getRange();
  const kpis = data?.kpis || {};
  const prevKpis = prevData?.kpis || {};

  return (
    <div style={{ padding: 24, maxWidth: 1200 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Informes</h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>Generá y descargá informes de rendimiento</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={generateShareUrl} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: 13 }}>
            {copied ? '✓ Link copiado' : '🔗 Compartir'}
          </button>
          <button onClick={downloadPDF} disabled={!data} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#9B6DFF', color: '#fff', cursor: data ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 600, opacity: data ? 1 : 0.5 }}>
            ⬇ Descargar PDF
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 20, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>Cliente</div>
          <select value={selectedClient} onChange={e => setSelectedClient(e.target.value)}
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, outline: 'none' }}>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>Período</div>
          <select value={preset} onChange={e => setPreset(e.target.value)}
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, outline: 'none' }}>
            {PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        {preset === 'custom' && (
          <>
            <div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>Desde</div>
              <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, outline: 'none' }} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>Hasta</div>
              <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, outline: 'none' }} />
            </div>
          </>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" id="comparing" checked={comparing} onChange={e => setComparing(e.target.checked)} />
          <label htmlFor="comparing" style={{ fontSize: 13, color: 'var(--muted)', cursor: 'pointer' }}>Comparar con período anterior</label>
        </div>
        <button onClick={loadData} disabled={loading}
          style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#9B6DFF', color: '#fff', cursor: loading ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, opacity: loading ? 0.6 : 1 }}>
          {loading ? 'Cargando…' : 'Generar informe'}
        </button>
      </div>

      {!data && !loading && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 60, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Seleccioná un cliente y período</div>
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>Luego hacé clic en "Generar informe" para ver los datos.</p>
        </div>
      )}

      {loading && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 60, textAlign: 'center', color: 'var(--muted)' }}>
          Cargando datos… puede tardar hasta 2 minutos.
        </div>
      )}

      {data && !loading && (
        <>
          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
            <KpiCard label="Inversión total" value={fmtUSD(kpis.total_spend)} prevValue={prevKpis.total_spend} />
            <KpiCard label="Clicks totales" value={fmtNum(kpis.total_clicks)} prevValue={prevKpis.total_clicks} />
            <KpiCard label="Conversiones" value={fmtNum(kpis.total_conversions)} prevValue={prevKpis.total_conversions} color="#34C78A" />
            <KpiCard label="ROAS" value={Number(kpis.roas || 0).toFixed(2) + 'x'} prevValue={prevKpis.roas} color="#FFB547" />
            <KpiCard label="CPA promedio" value={fmtUSD(kpis.cpa)} prevValue={prevKpis.cpa} />
            <KpiCard label="CTR" value={fmtPct(kpis.ctr)} prevValue={prevKpis.ctr} />
          </div>

          {/* Plataformas */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
            {[['Google Ads', '#4285F4', kpis.google, prevKpis.google], ['Meta Ads', '#0866FF', kpis.meta, prevKpis.meta]].map(([name, color, d, pd]) => d && (
              <div key={name} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{name}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  {[['Inversión', fmtUSD(d.spend), pd?.spend], ['Clicks', fmtNum(d.clicks), pd?.clicks], ['Conversiones', fmtNum(d.conversions), pd?.conversions], ['ROAS', Number(d.revenue && d.spend ? d.revenue/d.spend : 0).toFixed(2) + 'x', null], ['CPA', fmtUSD(d.spend && d.conversions ? d.spend/d.conversions : 0), null], ['CTR', fmtPct(d.ctr), pd?.ctr]].map(([l, v, pv]) => (
                    <div key={l}>
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>{l}</div>
                      <div style={{ fontSize: 15, fontWeight: 600 }}>{v}</div>
                      {pv !== undefined && pv !== null && <Delta current={parseFloat(v?.replace(/[^0-9.-]/g, '') || 0)} previous={pv} />}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Tabla campañas */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 14 }}>
              Campañas — {start} → {end}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>{['Campaña', 'Plataforma', 'Estado', 'Inversión', 'Clicks', 'Conv.', 'ROAS', 'CTR'].map(h => (
                    <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {(data.campaigns || []).map(c => (
                    <tr key={`${c.platform}-${c.id}`} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 500, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, fontWeight: 700, background: c.platform === 'google_ads' ? 'rgba(66,133,244,0.15)' : 'rgba(8,102,255,0.15)', color: c.platform === 'google_ads' ? '#4285F4' : '#60A5FF' }}>
                          {c.platform === 'google_ads' ? 'Google' : 'Meta'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 11 }}>{c.status}</td>
                      <td style={{ padding: '10px 14px' }}>{fmtUSD(c.spend)}</td>
                      <td style={{ padding: '10px 14px' }}>{fmtNum(c.clicks)}</td>
                      <td style={{ padding: '10px 14px' }}>{fmtNum(c.conversions)}</td>
                      <td style={{ padding: '10px 14px', color: c.roas >= 3 ? '#34C78A' : c.roas > 0 ? '#FFB547' : 'var(--muted)' }}>{c.roas > 0 ? c.roas.toFixed(2) + 'x' : '—'}</td>
                      <td style={{ padding: '10px 14px' }}>{fmtPct(c.ctr)}</td>
                    </tr>
                  ))}
                  {(!data.campaigns || data.campaigns.length === 0) && (
                    <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>No hay campañas para este período</td></tr>
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
