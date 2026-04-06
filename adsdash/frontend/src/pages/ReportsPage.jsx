// ============================================================
// src/pages/ReportsPage.jsx
// Lista de informes guardados por cliente
// ============================================================
import { useEffect, useState } from 'react';
import { Link }                from 'react-router-dom';
import { reportsAPI }          from '../services/api';
import { format }              from 'date-fns';

export default function ReportsPage() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    reportsAPI.list()
      .then(r => setReports(r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const deleteReport = async (id) => {
    await reportsAPI.delete(id);
    setReports(prev => prev.filter(r => r.id !== id));
  };

  const shareReport = async (id) => {
    const r = await reportsAPI.share(id);
    navigator.clipboard.writeText(r.data.url);
    alert('Link copiado al portapapeles:\n' + r.data.url);
  };

  if (loading) return <div style={{ padding: 40, color: 'var(--muted)' }}>Cargando informes…</div>;

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Informes guardados</h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>
            {reports.length} informes creados
          </p>
        </div>
        <Link to="/reports/new/edit" style={{
          background: 'var(--accent-purple)', color: '#fff', textDecoration: 'none',
          borderRadius: 9, padding: '9px 18px', fontWeight: 600, fontSize: 13,
        }}>
          + Nuevo informe
        </Link>
      </div>

      {reports.length === 0 ? (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 14, padding: 60, textAlign: 'center',
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📄</div>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>No hay informes todavía</div>
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>
            Creá tu primer informe personalizado para compartir con tus clientes.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {reports.map(r => (
            <div key={r.id} style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 12, padding: '16px 20px',
              display: 'flex', alignItems: 'center', gap: 16,
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{r.title}</div>
                {r.description && (
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>{r.description}</div>
                )}
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
                  Actualizado {format(new Date(r.updated_at), 'dd/MM/yyyy HH:mm')}
                  {r.is_public && (
                    <span style={{
                      marginLeft: 10, fontSize: 10, padding: '2px 7px', borderRadius: 4,
                      background: 'rgba(52,199,138,0.15)', color: '#34C78A', fontWeight: 600,
                    }}>Compartido</span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Link to={`/reports/${r.id}/edit`} style={{
                  padding: '6px 12px', borderRadius: 7, border: '1px solid var(--border)',
                  background: 'transparent', color: 'var(--muted)', fontSize: 12,
                  textDecoration: 'none', cursor: 'pointer',
                }}>Editar</Link>
                <button onClick={() => shareReport(r.id)} style={{
                  padding: '6px 12px', borderRadius: 7, border: '1px solid var(--border)',
                  background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontSize: 12,
                }}>Compartir</button>
                <button onClick={() => deleteReport(r.id)} style={{
                  padding: '6px 12px', borderRadius: 7,
                  border: '1px solid rgba(255,77,106,0.3)',
                  background: 'rgba(255,77,106,0.08)', color: '#FF4D6A',
                  cursor: 'pointer', fontSize: 12,
                }}>Eliminar</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// ============================================================
// src/pages/ReportEditor.jsx
// Drag-and-drop report builder (estructura base para extender)
// ============================================================
// Este componente es la base para el editor de informes estilo
// Looker Studio. Para una implementación completa necesitás:
//   - react-grid-layout para el drag & drop
//   - Un sistema de widgets (KpiWidget, ChartWidget, TableWidget)
//   - Selector de métricas y dimensiones
//   - Preview en tiempo real
//
// Por ahora exportamos un placeholder funcional:

export function ReportEditor() {
  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Editor de informes</h1>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 24 }}>
        Próximamente: editor drag & drop al estilo Looker Studio con widgets de KPIs,
        gráficos y tablas configurables.
      </p>
      <div style={{
        background: 'var(--surface)', border: '2px dashed var(--border)',
        borderRadius: 14, padding: 60, textAlign: 'center', color: 'var(--muted)',
      }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🧩</div>
        <div style={{ fontWeight: 500 }}>Editor de widgets — En desarrollo</div>
        <p style={{ fontSize: 13, marginTop: 8, maxWidth: 400, margin: '8px auto 0' }}>
          Instalá <code>react-grid-layout</code> y extendé este componente para crear
          informes personalizables con drag & drop.
        </p>
      </div>
    </div>
  );
}
