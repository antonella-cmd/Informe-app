// ============================================================
// src/pages/UploadPage.jsx — Carga de Excel y Google Sheets
// ============================================================
import { useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || '';
const PTI_DARK = '#0A1628';
const PTI_GOLD = '#E8A020';

export default function UploadPage() {
  const { clientId } = useParams();
  const fileInputRef = useRef();

  const [tab, setTab]               = useState('excel'); // 'excel' | 'gsheet'
  const [file, setFile]             = useState(null);
  const [sheetUrl, setSheetUrl]     = useState('');
  const [loading, setLoading]       = useState(false);
  const [result, setResult]         = useState(null);
  const [error, setError]           = useState('');
  const [dragging, setDragging]     = useState(false);

  const handleFile = (f) => {
    if (!f) return;
    const allowed = ['.xlsx', '.xls', '.csv'];
    const ext = '.' + f.name.split('.').pop().toLowerCase();
    if (!allowed.includes(ext)) {
      setError('Solo se permiten archivos .xlsx, .xls o .csv');
      return;
    }
    setFile(f);
    setError('');
    setResult(null);
  };

  const uploadExcel = async () => {
    if (!file) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const { data } = await axios.post(
        `${API}/api/upload/${clientId}/excel`,
        form,
        { withCredentials: true, headers: { 'Content-Type': 'multipart/form-data' } }
      );
      setResult(data);
    } catch (e) {
      setError(e.response?.data?.error || 'Error al procesar el archivo');
    } finally {
      setLoading(false);
    }
  };

  const uploadSheet = async () => {
    if (!sheetUrl) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const { data } = await axios.post(
        `${API}/api/upload/${clientId}/gsheet`,
        { sheet_url: sheetUrl },
        { withCredentials: true }
      );
      setResult(data);
    } catch (e) {
      setError(e.response?.data?.error || 'Error al importar el Google Sheet');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 32, maxWidth: 800, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: PTI_DARK, marginBottom: 6 }}>
          📥 Importar datos de campañas
        </h1>
        <p style={{ color: '#6B8AB8', fontSize: 14 }}>
          Cargá datos desde Excel o Google Sheets para analizarlos en el dashboard
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {[
          { id: 'excel',  label: '📊 Excel / CSV' },
          { id: 'gsheet', label: '🟢 Google Sheets' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setError(''); setResult(null); }}
            style={{
              padding: '9px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              cursor: 'pointer', border: '1px solid',
              background: tab === t.id ? PTI_DARK : 'white',
              color: tab === t.id ? 'white' : '#6B8AB8',
              borderColor: tab === t.id ? PTI_DARK : '#D0DCE8',
              transition: 'all 0.15s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Panel Excel */}
      {tab === 'excel' && (
        <div>
          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
            onClick={() => fileInputRef.current.click()}
            style={{
              border: `2px dashed ${dragging ? PTI_GOLD : file ? '#2D7D46' : '#D0DCE8'}`,
              borderRadius: 12, padding: 48, textAlign: 'center',
              background: dragging ? '#FFFBEB' : file ? '#F0FDF4' : '#FAFBFC',
              cursor: 'pointer', transition: 'all 0.2s', marginBottom: 20,
            }}
          >
            <div style={{ fontSize: 40, marginBottom: 12 }}>
              {file ? '✅' : '📂'}
            </div>
            {file ? (
              <>
                <p style={{ fontWeight: 600, color: '#2D7D46', marginBottom: 4 }}>{file.name}</p>
                <p style={{ fontSize: 12, color: '#6B8AB8' }}>
                  {(file.size / 1024).toFixed(1)} KB · Hacé click para cambiar
                </p>
              </>
            ) : (
              <>
                <p style={{ fontWeight: 600, color: PTI_DARK, marginBottom: 4 }}>
                  Arrastrá tu archivo acá
                </p>
                <p style={{ fontSize: 12, color: '#9AAFCC' }}>
                  o hacé click para seleccionar · .xlsx, .xls, .csv (máx 20MB)
                </p>
              </>
            )}
            <input
              ref={fileInputRef} type="file"
              accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
              onChange={e => handleFile(e.target.files[0])}
            />
          </div>

          {/* Columnas esperadas */}
          <div style={{
            background: '#F0F6FF', border: '1px solid #BFDBFE',
            borderRadius: 10, padding: 18, marginBottom: 20,
          }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: PTI_DARK, marginBottom: 10 }}>
              📋 Columnas reconocidas automáticamente:
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {[
                'campaign / campaña', 'platform / plataforma', 'date / fecha',
                'spend / gasto', 'impressions / impresiones', 'clicks / clics',
                'conversions / conversiones', 'revenue / ingresos',
                'ctr', 'cpc', 'cpm', 'roas', 'status / estado',
              ].map(col => (
                <span key={col} style={{
                  background: 'white', border: '1px solid #BFDBFE',
                  borderRadius: 20, padding: '3px 10px', fontSize: 11, color: '#1B3A6B',
                }}>
                  {col}
                </span>
              ))}
            </div>
            <p style={{ fontSize: 11, color: '#6B8AB8', marginTop: 10 }}>
              * Los nombres de columnas son flexibles (español e inglés). La columna <strong>campaign/campaña</strong> es obligatoria.
            </p>
          </div>

          <button
            onClick={uploadExcel} disabled={!file || loading}
            style={btnStyle(!file || loading)}
          >
            {loading ? '⟳ Importando...' : '⬆️ Importar archivo'}
          </button>
        </div>
      )}

      {/* Panel Google Sheets */}
      {tab === 'gsheet' && (
        <div>
          <div style={{
            background: '#F0FDF4', border: '1px solid #BBF7D0',
            borderRadius: 10, padding: 18, marginBottom: 20,
          }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: PTI_DARK, marginBottom: 8 }}>
              ✅ Cómo preparar tu Google Sheet:
            </p>
            <ol style={{ fontSize: 12, color: '#4A6080', lineHeight: 2, paddingLeft: 18 }}>
              <li>El sheet debe ser <strong>público</strong> (Compartir → Cualquier persona con el link)</li>
              <li>La primera fila debe tener los nombres de columnas</li>
              <li>Incluí al menos las columnas: <strong>campaña, fecha, gasto</strong></li>
            </ol>
          </div>

          <label style={{ fontSize: 12, color: '#6B8AB8', display: 'block', marginBottom: 8 }}>
            URL del Google Sheet
          </label>
          <input
            type="url"
            value={sheetUrl}
            onChange={e => setSheetUrl(e.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/..."
            style={{
              width: '100%', padding: '11px 14px', borderRadius: 8,
              border: '1px solid #D0DCE8', fontSize: 13, marginBottom: 20,
              fontFamily: 'Inter, sans-serif', outline: 'none', boxSizing: 'border-box',
            }}
          />

          <button
            onClick={uploadSheet} disabled={!sheetUrl || loading}
            style={btnStyle(!sheetUrl || loading)}
          >
            {loading ? '⟳ Importando...' : '🟢 Importar desde Google Sheets'}
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          background: '#FEF2F2', border: '1px solid #FECACA',
          borderRadius: 8, padding: 16, marginTop: 20, color: '#C0392B', fontSize: 13,
        }}>
          ⚠️ {error}
        </div>
      )}

      {/* Resultado */}
      {result && (
        <div style={{
          background: '#F0FDF4', border: '1px solid #BBF7D0',
          borderRadius: 12, padding: 24, marginTop: 20,
        }}>
          <p style={{ fontSize: 16, fontWeight: 700, color: '#2D7D46', marginBottom: 16 }}>
            ✅ {result.message}
          </p>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 12 }}>
            <Stat label="Registros importados" value={result.inserted} color="#2D7D46" />
            <Stat label="Omitidos"              value={result.skipped}  color="#D97706" />
            {result.columns_mapped && (
              <div>
                <div style={{ fontSize: 11, color: '#6B8AB8', marginBottom: 4 }}>Columnas mapeadas</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: PTI_DARK }}>
                  {result.columns_mapped.join(', ')}
                </div>
              </div>
            )}
          </div>
          {result.errors?.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <p style={{ fontSize: 12, color: '#D97706', marginBottom: 8 }}>
                ⚠️ Errores en {result.errors.length} filas:
              </p>
              {result.errors.map((e, i) => (
                <p key={i} style={{ fontSize: 11, color: '#6B8AB8' }}>
                  Fila {e.row}: {e.error}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#6B8AB8', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function btnStyle(disabled) {
  return {
    background: disabled ? '#D0DCE8' : '#0A1628',
    color: 'white', border: 'none', borderRadius: 8,
    padding: '11px 28px', fontWeight: 600, fontSize: 14,
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'background 0.2s',
  };
}
