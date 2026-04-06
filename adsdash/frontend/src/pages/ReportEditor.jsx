// ============================================================
// src/pages/ReportEditor.jsx
// Base para editor drag & drop estilo Looker Studio
// Extender con react-grid-layout para implementación completa
// ============================================================
export default function ReportEditor() {
  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Editor de informes</h1>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 24 }}>
        Extendé este componente con <code>react-grid-layout</code> para crear
        un editor drag &amp; drop completo.
      </p>
      <div style={{
        background: 'var(--surface)', border: '2px dashed var(--border)',
        borderRadius: 14, padding: 60, textAlign: 'center', color: 'var(--muted)',
      }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🧩</div>
        <div style={{ fontWeight: 500 }}>Editor de widgets — En desarrollo</div>
      </div>
    </div>
  );
}
