// ============================================================
// src/pages/SharedReportPage.jsx — Reporte público por token
// ============================================================
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

const API = import.meta.env.VITE_API_URL || '';

export default function SharedReportPage() {
  const { token } = useParams();
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [expired, setExpired] = useState(false);
  const [error, setError]     = useState('');

  useEffect(() => {
    axios.get(`${API}/api/reports/share/${token}`)
      .then(r => setData(r.data))
      .catch(e => {
        if (e.response?.status === 410) setExpired(true);
        else setError(e.response?.data?.error || 'Reporte no encontrado');
      })
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 40 }}>📊</div>
      <p style={{ color: '#6B8AB8', fontSize: 16 }}>Cargando reporte...</p>
    </div>
  );

  if (expired) return (
    <CenteredMessage icon="⏰" title="Link expirado" subtitle="Este reporte ya no está disponible. Pedí un nuevo link al consultor de PTI." />
  );

  if (error || !data) return (
    <CenteredMessage icon="❌" title="Reporte no encontrado" subtitle={error || 'El link no es válido.'} />
  );

  const { report, metrics } = data;
  const config = report.config_json || {};

  // Agrupar métricas por fecha para el gráfico
  const byDate = {};
  for (const m of metrics) {
    if (!byDate[m.date]) byDate[m.date] = { date: m.date, spend: 0, clicks: 0, conversions: 0, revenue: 0 };
    byDate[m.date].spend       += Number(m.spend || 0);
    byDate[m.date].clicks      += Number(m.clicks || 0);
    byDate[m.date].conversions += Number(m.conversions || 0);
    byDate[m.date].revenue     += Number(m.revenue || 0);
  }
  const timeSeriesData = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));

  const totals = metrics.reduce((acc, m) => ({
    spend:       (acc.spend || 0)       + Number(m.spend || 0),
    impressions: (acc.impressions || 0) + Number(m.impressions || 0),
    clicks:      (acc.clicks || 0)      + Number(m.clicks || 0),
    conversions: (acc.conversions || 0) + Number(m.conversions || 0),
    revenue:     (acc.revenue || 0)     + Number(m.revenue || 0),
  }), {});
  totals.roas = totals.spend > 0 ? totals.revenue / totals.spend : 0;

  const fmt = (n, d = 2) => Number(n || 0).toFixed(d);
  const fmtMoney = n => `$${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;

  return (
    <div style={{ minHeight: '100vh', background: '#F4F7FB', fontFamily: "'Inter', sans-serif" }}>

      {/* Header */}
      <header style={{ background: '#0A1628', padding: '20px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#E8A020' }} />
          <span style={{ fontWeight: 700, fontSize: 18, color: 'white' }}>
            PTI <span style={{ color: '#E8A020' }}>Analytics</span>
          </span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: 'white', fontWeight: 600, fontSize: 15 }}>{report.client_name}</div>
          <div style={{ color: '#6B8AB8', fontSize: 12 }}>
            {config.start_date} al {config.end_date}
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '36px 24px' }}>

        {/* Título */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0A1628', marginBottom: 6 }}>
            {report.name}
          </h1>
          <p style={{ color: '#6B8AB8', fontSize: 13 }}>
            Reporte de performance publicitario · {report.country}
          </p>
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
          {[
            { label: 'Gasto Total',   value: fmtMoney(totals.spend) },
            { label: 'ROAS',          value: `${fmt(totals.roas)}x` },
            { label: 'Conversiones',  value: fmt(totals.conversions, 0) },
            { label: 'Impresiones',   value: Number(totals.impressions || 0).toLocaleString('es-AR') },
          ].map(k => (
            <div key={k.label} style={{
              background: 'white', border: '1px solid #E0E8F0',
              borderRadius: 10, padding: 20, borderTop: '3px solid #E8A020',
            }}>
              <div style={{ fontSize: 11, color: '#6B8AB8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>{k.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#0A1628' }}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* Gráfico */}
        {timeSeriesData.length > 0 && (
          <div style={{ background: 'white', border: '1px solid #E0E8F0', borderRadius: 12, padding: 24, marginBottom: 28 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0A1628', marginBottom: 20 }}>Evolución de Gasto</h2>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={timeSeriesData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F0F4F8" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9AAFCC' }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#9AAFCC' }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: '#0A1628', border: 'none', borderRadius: 8, color: 'white', fontSize: 12 }}
                  formatter={v => fmtMoney(v)}
                />
                <Line type="monotone" dataKey="spend" stroke="#E8A020" strokeWidth={2} dot={false} name="Gasto" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Tabla de campañas */}
        <div style={{ background: 'white', border: '1px solid #E0E8F0', borderRadius: 12, overflow: 'hidden', marginBottom: 28 }}>
          <div style={{ padding: '18px 24px', borderBottom: '1px solid #F0F4F8' }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0A1628' }}>Detalle de campañas</h2>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#F8F9FC' }}>
                  {['Campaña', 'Plataforma', 'Fecha', 'Gasto', 'Clics', 'CTR', 'ROAS', 'Conversiones'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', color: '#6B8AB8', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {metrics.slice(0, 50).map((m, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #F0F4F8' }}>
                    <td style={{ padding: '10px 16px', color: '#0A1628', fontWeight: 500 }}>{m.campaign_name}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{
                        background: m.platform === 'google_ads' ? '#EBF3FD' : '#F0EFFE',
                        color: m.platform === 'google_ads' ? '#378ADD' : '#7F77DD',
                        padding: '2px 10px', borderRadius: 20, fontSize: 10, fontWeight: 600,
                      }}>
                        {m.platform === 'google_ads' ? 'Google' : 'Meta'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', color: '#6B8AB8' }}>{m.date}</td>
                    <td style={{ padding: '10px 16px', color: '#0A1628' }}>{fmtMoney(m.spend)}</td>
                    <td style={{ padding: '10px 16px', color: '#6B8AB8' }}>{Number(m.clicks || 0).toLocaleString()}</td>
                    <td style={{ padding: '10px 16px', color: '#6B8AB8' }}>{fmt(m.ctr)}%</td>
                    <td style={{ padding: '10px 16px', fontWeight: 600, color: Number(m.roas) >= 2 ? '#2D7D46' : '#C0392B' }}>{fmt(m.roas)}x</td>
                    <td style={{ padding: '10px 16px', color: '#6B8AB8' }}>{fmt(m.conversions, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Footer */}
      <footer style={{
        background: '#0A1628', color: '#6B8AB8', textAlign: 'center',
        padding: '20px 40px', fontSize: 12,
      }}>
        Generado por PTI Analytics — pticonsultingpartner.com — contacto@pticonsultingpartner.com
      </footer>
    </div>
  );
}

function CenteredMessage({ icon, title, subtitle }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 48 }}>{icon}</div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0A1628' }}>{title}</h2>
      <p style={{ color: '#6B8AB8', maxWidth: 400, textAlign: 'center' }}>{subtitle}</p>
    </div>
  );
}
