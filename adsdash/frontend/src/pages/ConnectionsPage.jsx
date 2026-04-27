// ============================================================
// ConnectionsPage.jsx — Conexiones con diagnóstico y auto-fix
// ============================================================
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { googleAPI, metaAPI, clientsAPI } from '../services/api';
import api from '../services/api';

// Cuentas Google hardcodeadas (lista de clientes)
const ALL_GOOGLE_ACCOUNTS = [
  { id: '1599347358', name: 'PLAN B' },
  { id: '6836817994', name: 'Stanley Uruguay' },
  { id: '1724645144', name: 'Pelikano' },
  { id: '2162256455', name: 'El Resero' },
  { id: '1955229163', name: 'Blancoamor' },
  { id: '9514948314', name: 'Protalia (Cancelado)' },
  { id: '3430926137', name: 'Kent (Cancelado)' },
  { id: '1775409011', name: 'HomeCo ARS' },
  { id: '8604416356', name: 'PTI - Campañas (MCC)' },
  { id: '9062270595', name: 'Contacto Dental' },
  { id: '6997610629', name: 'PTI Consulting Partner' },
  { id: '1301708474', name: 'ARTPARK Bosque Urbano Vertical' },
  { id: '1893109843', name: 'Jacana' },
  { id: '9918177713', name: 'Consulting Partner' },
  { id: '4132884186', name: 'Hogares Modernos Bazar' },
  { id: '4405049047', name: 'Protalia' },
  { id: '3132093542', name: 'The Game House' },
  { id: '8284056099', name: 'Oslo Argentina' },
  { id: '2174109270', name: 'Fideos Adria' },
  { id: '1625738194', name: 'Alberta Housing' },
];

export default function ConnectionsPage() {
  const { clientId } = useParams();
  const [searchParams] = useSearchParams();

  const [client, setClient]   = useState(null);
  const [conns, setConns]     = useState([]);
  const [loading, setLoading] = useState(true);

  // Google state
  const [googleAccounts, setGoogleAccounts]     = useState([]);
  const [selectedGoogle, setSelectedGoogle]     = useState('');
  const [savingGoogle, setSavingGoogle]         = useState(false);
  const [googleSaved, setGoogleSaved]           = useState(false);

  // Meta state
  const [metaAccounts, setMetaAccounts]         = useState([]);
  const [selectedMeta, setSelectedMeta]         = useState('');
  const [savingMeta, setSavingMeta]             = useState(false);
  const [metaSaved, setMetaSaved]               = useState(false);
  const [metaDiag, setMetaDiag]                 = useState(null);
  const [diagLoading, setDiagLoading]           = useState(false);
  const [showSelector, setShowSelector]         = useState(false);

  const reload = () =>
    clientsAPI.get(clientId).then(r => {
      setClient(r.data);
      setConns(r.data.connections || []);
    });

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, [clientId]);

  // Al volver del OAuth de Google, mostrar selector
  useEffect(() => {
    if (searchParams.get('connected') === 'google') {
      setGoogleAccounts(ALL_GOOGLE_ACCOUNTS);
    }
  }, [searchParams]);

  // Al volver del OAuth de Meta → ejecutar diagnóstico automático
  useEffect(() => {
    if (searchParams.get('connected') === 'meta') {
      setTimeout(() => runMetaDiag(), 1500); // esperar que el backend guarde el token
    }
  }, [searchParams]);

  const connectGoogle = async () => {
    const r = await googleAPI.authUrl(clientId);
    window.location.href = r.data.url;
  };

  const connectMeta = async () => {
    const r = await metaAPI.authUrl(clientId);
    window.location.href = r.data.url;
  };

  const saveGoogle = async () => {
    if (!selectedGoogle) return;
    setSavingGoogle(true);
    try {
      const account = ALL_GOOGLE_ACCOUNTS.find(a => a.id === selectedGoogle);
      await api.patch(`/clients/${clientId}/connections/google_ads`, {
        account_id:   selectedGoogle,
        account_name: account?.name || selectedGoogle,
      });
      setGoogleSaved(true);
      setGoogleAccounts([]);
      reload();
    } catch (e) { alert('Error al guardar cuenta de Google'); }
    finally { setSavingGoogle(false); }
  };

  const saveMeta = async () => {
    if (!selectedMeta) return;
    setSavingMeta(true);
    try {
      const account = metaAccounts.find(a => a.id === selectedMeta);
      await api.patch(`/clients/${clientId}/connections/meta_ads`, {
        account_id:   selectedMeta,
        account_name: account?.name || selectedMeta,
      });
      setMetaSaved(true);
      setShowSelector(false);
      reload();
      // Re-diagnóstico después de guardar
      setTimeout(() => runMetaDiag(), 800);
    } catch (e) { alert('Error al guardar cuenta de Meta'); }
    finally { setSavingMeta(false); }
  };

  const disconnect = async (platform) => {
    if (!confirm('¿Desconectar esta plataforma?')) return;
    await api.delete(`/clients/${clientId}/connections/${platform}`);
    setConns(prev => prev.filter(c => c.platform !== platform));
    if (platform === 'google_ads') { setGoogleSaved(false); setGoogleAccounts([]); }
    if (platform === 'meta_ads')   { setMetaSaved(false); setMetaDiag(null); }
  };

  const runMetaDiag = async () => {
    setDiagLoading(true);
    try {
      const r = await api.get(`/meta/diagnose`, { params: { clientId } });
      setMetaDiag(r.data);
      // Si hay cuentas disponibles, poblar el selector
      if (r.data.available_accounts?.length > 0) {
        setMetaAccounts(r.data.available_accounts.map(a => ({
          id:   a.id,
          name: a.name,
        })));
      }
      // Si no tiene account_id seleccionado pero hay cuentas → mostrar selector
      if (!r.data.has_account_id && r.data.available_accounts?.length > 0) {
        setShowSelector(true);
      }
      // Recargar conexiones
      reload();
    } catch (e) {
      setMetaDiag({ error: e.message });
    } finally {
      setDiagLoading(false);
    }
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Cargando…</div>;

  const gConn = conns.find(c => c.platform === 'google_ads');
  const mConn = conns.find(c => c.platform === 'meta_ads');
  const justConnectedGoogle = searchParams.get('connected') === 'google';
  const justConnectedMeta   = searchParams.get('connected') === 'meta';

  const cardStyle = (connected, color) => ({
    background: 'var(--surface)',
    border: `1px solid ${connected ? color + '44' : 'var(--border)'}`,
    borderRadius: 14, padding: 24,
  });

  const btnStyle = (color, outline = false) => ({
    width: '100%', padding: '10px', borderRadius: 8,
    border: outline ? `1px solid ${color}44` : 'none',
    background: outline ? `${color}11` : color,
    color: outline ? color : '#fff',
    cursor: 'pointer', fontSize: 13, fontWeight: 600,
    marginBottom: 8,
  });

  const metaWorking = mConn && mConn.account_id && metaDiag?.token_valid !== false;

  return (
    <div style={{ padding: 28, maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Conexiones de plataformas</h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
          Cliente: <strong>{client?.name}</strong>
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>

        {/* ── GOOGLE ADS ── */}
        <div style={cardStyle(!!gConn, '#4285F4')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: '#4285F422', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🔵</div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 16 }}>Google Ads</div>
              <div style={{ fontSize: 12, color: gConn ? '#34C78A' : 'var(--muted)', marginTop: 3 }}>
                {gConn ? '✓ Conectado' : 'Sin conectar'}
              </div>
            </div>
          </div>

          {gConn ? (
            <>
              <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Cuenta conectada</div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{gConn.account_name || gConn.account_id || 'Sin cuenta seleccionada'}</div>
                {!gConn.account_id && (
                  <div style={{ fontSize: 11, color: '#FF4D6A', marginTop: 4 }}>⚠ Sin cuenta seleccionada — seleccioná una abajo</div>
                )}
              </div>

              {/* Selector de cuenta Google (siempre visible si no hay account_id) */}
              {(justConnectedGoogle || !gConn.account_id || googleAccounts.length > 0) && !googleSaved && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Seleccioná la cuenta de Google Ads:</div>
                  <select value={selectedGoogle} onChange={e => setSelectedGoogle(e.target.value)}
                    style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, marginBottom: 8, outline: 'none' }}>
                    <option value="">-- Elegir cuenta --</option>
                    {(googleAccounts.length > 0 ? googleAccounts : ALL_GOOGLE_ACCOUNTS).map(a => (
                      <option key={a.id} value={a.id}>{a.name} ({a.id})</option>
                    ))}
                  </select>
                  <button onClick={saveGoogle} disabled={!selectedGoogle || savingGoogle} style={btnStyle('#4285F4')}>
                    {savingGoogle ? 'Guardando…' : 'Guardar cuenta'}
                  </button>
                </div>
              )}
              {googleSaved && <div style={{ fontSize: 12, color: '#34C78A', marginBottom: 12 }}>✓ Cuenta guardada correctamente</div>}
              <button onClick={() => disconnect('google_ads')} style={btnStyle('#FF4D6A', true)}>Desconectar</button>
            </>
          ) : (
            <>
              <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16, lineHeight: 1.6 }}>
                Conectá tu cuenta de Google Ads para ver campañas, palabras clave y métricas de conversión.
              </p>
              <button onClick={connectGoogle} style={btnStyle('#4285F4')}>Conectar Google Ads</button>
            </>
          )}
        </div>

        {/* ── META ADS ── */}
        <div style={cardStyle(!!mConn, '#0866FF')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: '#0866FF22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🔷</div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 16 }}>Meta Ads</div>
              <div style={{ fontSize: 12, marginTop: 3, color: metaWorking ? '#34C78A' : mConn ? '#E8A020' : 'var(--muted)' }}>
                {metaWorking ? '✓ Conectado y funcionando' : mConn ? '⚠ Conectado — revisar configuración' : 'Sin conectar'}
              </div>
            </div>
          </div>

          {mConn ? (
            <>
              <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Cuenta conectada</div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{mConn.account_name || mConn.account_id || '—'}</div>
                {!mConn.account_id && (
                  <div style={{ fontSize: 11, color: '#FF4D6A', marginTop: 4 }}>⚠ No hay cuenta de Meta seleccionada — esto causa que los datos no se carguen</div>
                )}
              </div>

              {/* Diagnóstico */}
              {metaDiag && (
                <div style={{ background: metaDiag.token_valid === false ? 'rgba(255,77,106,0.08)' : 'rgba(52,199,138,0.08)', border: `1px solid ${metaDiag.token_valid === false ? '#FF4D6A44' : '#34C78A44'}`, borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 12 }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>Diagnóstico de conexión</div>
                  <div style={{ color: metaDiag.token_valid ? '#34C78A' : '#FF4D6A' }}>
                    {metaDiag.token_valid ? '✓ Token válido' : `✗ Token inválido: ${metaDiag.token_error || 'error desconocido'}`}
                  </div>
                  <div style={{ color: metaDiag.has_account_id ? '#34C78A' : '#FF4D6A', marginTop: 4 }}>
                    {metaDiag.has_account_id ? `✓ Cuenta: ${metaDiag.account_name || metaDiag.account_id}` : '✗ Sin cuenta de Meta seleccionada'}
                  </div>
                  {metaDiag.token_user && <div style={{ color: 'var(--muted)', marginTop: 4 }}>Usuario: {metaDiag.token_user}</div>}
                  {metaDiag.available_accounts?.length > 0 && (
                    <div style={{ marginTop: 4, color: 'var(--muted)' }}>
                      {metaDiag.available_accounts.length} cuenta(s) disponible(s)
                    </div>
                  )}
                  {metaDiag.token_valid === false && (
                    <div style={{ marginTop: 8, color: '#E8A020', fontWeight: 500 }}>→ Reconectá Meta Ads para renovar el token</div>
                  )}
                </div>
              )}

              {/* Selector de cuenta Meta */}
              {(showSelector || (!mConn.account_id && metaAccounts.length > 0)) && !metaSaved && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Seleccioná la cuenta de Meta Ads:</div>
                  <select value={selectedMeta} onChange={e => setSelectedMeta(e.target.value)}
                    style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, marginBottom: 8, outline: 'none' }}>
                    <option value="">-- Elegir cuenta --</option>
                    {metaAccounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.id})</option>)}
                  </select>
                  <button onClick={saveMeta} disabled={!selectedMeta || savingMeta} style={btnStyle('#0866FF')}>
                    {savingMeta ? 'Guardando…' : 'Guardar cuenta'}
                  </button>
                </div>
              )}
              {metaSaved && <div style={{ fontSize: 12, color: '#34C78A', marginBottom: 12 }}>✓ Cuenta guardada correctamente</div>}

              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={runMetaDiag} disabled={diagLoading}
                  style={{ flex: 1, padding: '9px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
                  {diagLoading ? 'Diagnosticando…' : '🔍 Diagnosticar'}
                </button>
                <button onClick={() => disconnect('meta_ads')} style={{ flex: 1, padding: '9px', borderRadius: 8, border: '1px solid #FF4D6A44', background: 'rgba(255,77,106,0.08)', color: '#FF4D6A', cursor: 'pointer', fontSize: 12 }}>
                  Desconectar
                </button>
              </div>

              {/* Si no hay account_id y no hay diagnóstico → botón para diagnosticar */}
              {!mConn.account_id && !metaDiag && (
                <div style={{ marginTop: 10, padding: 12, background: 'rgba(232,160,32,0.1)', border: '1px solid rgba(232,160,32,0.3)', borderRadius: 8, fontSize: 12 }}>
                  <strong style={{ color: '#E8A020' }}>¿No se cargan los datos de Meta?</strong>
                  <p style={{ color: 'var(--muted)', marginTop: 4, lineHeight: 1.5 }}>
                    El token está guardado pero no hay una cuenta de Meta Ads asociada. Hacé clic en <strong>Diagnosticar</strong> para ver las cuentas disponibles y seleccionar una.
                  </p>
                </div>
              )}
            </>
          ) : (
            <>
              <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16, lineHeight: 1.6 }}>
                Conectá tu cuenta de Meta para ver campañas de Facebook e Instagram, audiencias y ROAS.
              </p>
              <button onClick={connectMeta} style={btnStyle('#0866FF')}>Conectar Meta Ads</button>
            </>
          )}
        </div>
      </div>

      {/* ── Info ── */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>Antes de conectar</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.8 }}>
          <strong style={{ color: 'var(--text)' }}>Google Ads:</strong> el cliente debe otorgar acceso desde Google Ads → Herramientas → Accesos y seguridad, o darte acceso vía MCC (Manager Account).<br /><br />
          <strong style={{ color: 'var(--text)' }}>Meta Ads:</strong> el cliente debe agregarte como socio en Business Manager → Socios → Compartir activos, con permiso de <em>Analista</em> o superior.<br /><br />
          <strong style={{ color: '#E8A020' }}>Importante:</strong> después de conectar Meta, usá el botón <strong>Diagnosticar</strong> para verificar que el token funciona y que la cuenta está correctamente asociada.
        </div>
      </div>
    </div>
  );
}
