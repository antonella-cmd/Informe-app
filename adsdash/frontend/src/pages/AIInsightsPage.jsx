// ============================================================
// src/pages/AIInsightsPage.jsx — Análisis IA con Claude
// ============================================================
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || '';
const PTI_DARK = '#0A1628';
const PTI_GOLD = '#E8A020';
const PTI_MID  = '#1B3A6B';

const impactColors = {
  high:   { bg: '#FEF2F2', text: '#C0392B', border: '#FECACA', label: 'Alto' },
  medium: { bg: '#FFFBEB', text: '#D97706', border: '#FDE68A', label: 'Medio' },
  low:    { bg: '#F0FDF4', text: '#2D7D46', border: '#BBF7D0', label: 'Bajo'  },
};

const priorityColors = {
  high:   { bg: '#FEF2F2', text: '#C0392B', label: '🔴 Alta'  },
  medium: { bg: '#FFFBEB', text: '#D97706', label: '🟡 Media' },
  low:    { bg: '#F0FDF4', text: '#2D7D46', label: '🟢 Baja'  },
};

export default function AIInsightsPage() {
  const { clientId } = useParams();
  const [loading, setLoading]   = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [error, setError]       = useState('');

  const today    = new Date().toISOString().split('T')[0];
  const thirtyAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  const [startDate, setStartDate] = useState(thirtyAgo);
  const [endDate,   setEndDate]   = useState(today);

  const generate = async () => {
    setLoading(true);
    setError('');
    setAnalysis(null);
    try {
      const { data } = await axios.post(
        `${API}/api/ai/${clientId}/insights`,
        { start_date: startDate, end_date: endDate },
        { withCredentials: true }
      );
      setAnalysis(data);
    } catch (e) {
      setError(e.response?.data?.error || 'Error al generar el análisis');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 32, maxWidth: 1000, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: PTI_DARK, marginBottom: 6 }}>
          🤖 Análisis con IA
        </h1>
        <p style={{ color: '#6B8AB8', fontSize: 14 }}>
          Análisis automático de performance por Claude · PTI Consulting Partner
        </p>
      </div>

      {/* Controles */}
      <div style={{
        background: 'white', border: '1px solid #E0E8F0', borderRadius: 12,
        padding: 24, marginBottom: 28,
        display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap',
      }}>
        <div>
          <label style={{ fontSize: 12, color: '#6B8AB8', display: 'block', marginBottom: 6 }}>
            Fecha inicio
          </label>
          <input
            type="date" value={startDate}
            onChange={e => setStartDate(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={{ fontSize: 12, color: '#6B8AB8', display: 'block', marginBottom: 6 }}>
            Fecha fin
          </label>
          <input
            type="date" value={endDate}
            onChange={e => setEndDate(e.target.value)}
            style={inputStyle}
          />
        </div>
        <button
          onClick={generate}
          disabled={loading}
          style={{
            background: loading ? '#9AAFCC' : PTI_GOLD,
            color: 'white', border: 'none', borderRadius: 8,
            padding: '10px 24px', fontWeight: 600, fontSize: 14,
            cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 8,
            transition: 'background 0.2s',
          }}
        >
          {loading ? (
            <>
              <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>
              Analizando...
            </>
          ) : '✨ Generar análisis'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          background: '#FEF2F2', border: '1px solid #FECACA',
          borderRadius: 8, padding: 16, marginBottom: 24, color: '#C0392B',
        }}>
          ⚠️ {error}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 60, color: '#6B8AB8' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🧠</div>
          <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Analizando tus campañas...</p>
          <p style={{ fontSize: 13 }}>Claude está procesando los datos de performance</p>
        </div>
      )}

      {/* Resultados */}
      {analysis && (
        <div>

          {/* Resumen ejecutivo */}
          <div style={{
            background: PTI_DARK, color: 'white',
            borderRadius: 12, padding: 28, marginBottom: 24,
            borderLeft: `4px solid ${PTI_GOLD}`,
          }}>
            <div style={{ fontSize: 11, color: PTI_GOLD, fontWeight: 600, letterSpacing: 1, marginBottom: 10, textTransform: 'uppercase' }}>
              Resumen Ejecutivo
            </div>
            <p style={{ fontSize: 15, lineHeight: 1.7, color: '#E8EFF8' }}>
              {analysis.summary}
            </p>
            <div style={{ marginTop: 16, fontSize: 11, color: '#6B8AB8' }}>
              Período: {analysis.period?.start} al {analysis.period?.end} · Generado: {new Date(analysis.generated_at).toLocaleString('es-AR')}
            </div>
          </div>

          {/* Insights */}
          {analysis.top_insights?.length > 0 && (
            <section style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: PTI_DARK, marginBottom: 16 }}>
                💡 Insights principales
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                {analysis.top_insights.map((ins, i) => {
                  const col = impactColors[ins.impact] || impactColors.medium;
                  return (
                    <div key={i} style={{
                      background: 'white', border: `1px solid ${col.border}`,
                      borderRadius: 10, padding: 20,
                      borderTop: `3px solid ${col.text}`,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                        <h3 style={{ fontSize: 13, fontWeight: 700, color: PTI_DARK, flex: 1 }}>
                          {ins.title}
                        </h3>
                        <span style={{
                          background: col.bg, color: col.text, border: `1px solid ${col.border}`,
                          borderRadius: 20, padding: '2px 10px', fontSize: 10, fontWeight: 600,
                          marginLeft: 8, flexShrink: 0,
                        }}>
                          {col.label}
                        </span>
                      </div>
                      <p style={{ fontSize: 12, color: '#4A6080', lineHeight: 1.6 }}>
                        {ins.description}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Recomendaciones */}
          {analysis.recommendations?.length > 0 && (
            <section style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: PTI_DARK, marginBottom: 16 }}>
                🎯 Recomendaciones
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {analysis.recommendations.map((rec, i) => {
                  const col = priorityColors[rec.priority] || priorityColors.medium;
                  return (
                    <div key={i} style={{
                      background: 'white', border: '1px solid #E0E8F0',
                      borderRadius: 10, padding: 20,
                      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
                    }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                          <span style={{
                            background: col.bg, color: col.text,
                            borderRadius: 20, padding: '2px 12px', fontSize: 10, fontWeight: 600,
                          }}>
                            {col.label}
                          </span>
                        </div>
                        <p style={{ fontSize: 13, fontWeight: 600, color: PTI_DARK, marginBottom: 6 }}>
                          {rec.action}
                        </p>
                        <p style={{ fontSize: 12, color: '#6B8AB8' }}>{rec.reason}</p>
                      </div>
                      <div style={{
                        background: '#F8F9FC', borderRadius: 8, padding: 14,
                        display: 'flex', alignItems: 'center',
                      }}>
                        <div>
                          <div style={{ fontSize: 10, color: '#9AAFCC', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                            Impacto esperado
                          </div>
                          <p style={{ fontSize: 12, color: '#2D7D46', fontWeight: 600 }}>
                            {rec.expected_impact}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Alertas */}
          {analysis.alerts?.length > 0 && (
            <section>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: PTI_DARK, marginBottom: 16 }}>
                🚨 Alertas
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {analysis.alerts.map((alert, i) => {
                  const alertStyle = {
                    warning: { bg: '#FFFBEB', border: '#FDE68A', text: '#D97706', icon: '⚠️' },
                    danger:  { bg: '#FEF2F2', border: '#FECACA', text: '#C0392B', icon: '🚨' },
                    info:    { bg: '#EFF6FF', border: '#BFDBFE', text: '#1B3A6B', icon: 'ℹ️' },
                  }[alert.type] || { bg: '#EFF6FF', border: '#BFDBFE', text: '#1B3A6B', icon: 'ℹ️' };

                  return (
                    <div key={i} style={{
                      background: alertStyle.bg, border: `1px solid ${alertStyle.border}`,
                      borderRadius: 8, padding: '12px 16px',
                      display: 'flex', alignItems: 'flex-start', gap: 10,
                    }}>
                      <span>{alertStyle.icon}</span>
                      <div>
                        <p style={{ fontSize: 13, color: alertStyle.text, fontWeight: 500 }}>
                          {alert.message}
                        </p>
                        {alert.campaign && (
                          <p style={{ fontSize: 11, color: '#9AAFCC', marginTop: 4 }}>
                            Campaña: {alert.campaign}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const inputStyle = {
  padding: '9px 14px', borderRadius: 8,
  border: '1px solid #D0DCE8', fontSize: 13,
  fontFamily: 'Inter, sans-serif', color: '#0A1628',
  outline: 'none',
};
