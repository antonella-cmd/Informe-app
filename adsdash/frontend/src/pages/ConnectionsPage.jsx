import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { googleAPI, metaAPI, clientsAPI } from '../services/api';

const ALL_ACCOUNTS = [
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

const ALL_META_ACCOUNTS = [
  { id: 'act_897427701361363',  name: 'Adria Fideos' },
  { id: 'act_1719820121896080', name: 'Pelikano Hogar' },
  { id: 'act_569768295590325',  name: 'Home Co' },
  { id: 'act_796458579550761',  name: 'Lua Femme' },
  { id: 'act_1338463620723035', name: 'The Game House / Stanley' },
  { id: 'act_370565048018995',  name: 'Plan B' },
];

export default function ConnectionsPage() {
  const { clientId } = useParams();
  const [searchParams] = useSearchParams();
  const [client, setClient] = useState(null);
  const [conns, setConns] = useState([]);
  const [loading, setLoading] = useState(true);

  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [savingAccount, setSavingAccount] = useState(false);
  const [accountSaved, setAccountSaved] = useState(false);

  const [metaAccounts, setMetaAccounts] = useState([]);
  const [selectedMetaAccount, setSelectedMetaAccount] = useState('');
  const [savingMetaAccount, setSavingMetaAccount] = useState(false);
  const [metaAccountSaved, setMetaAccountSaved] = useState(false);

  useEffect(() => {
    clientsAPI.get(clientId).then(r => {
      setClient(r.data);
      setConns(r.data.connections || []);
    }).finally(() => setLoading(false));
  }, [clientId]);

  useEffect(() => {
    if (searchParams.get('connected') === 'google') setAccounts(ALL_ACCOUNTS);
    if (searchParams.get('connected') === 'meta')   setMetaAccounts(ALL_META_ACCOUNTS);
  }, [searchParams, clientId]);

  // ── CORREGIDO: no agregar &state manualmente, el backend ya lo incluye ──
  const connectGoogle = async () => {
    const r = await googleAPI.authUrl(clientId);
    window.location.href = r.data.url; // ← sin + `&state=...`
  };

  const connectMeta = async () => {
    const r = await metaAPI.authUrl(clientId);
    window.location.href = r.data.url;
  };

  const saveAccount = async () => {
    if (!selectedAccount) return;
    setSavingAccount(true);
    try {
      const account = ALL_ACCOUNTS.find(a => a.id === selectedAccount);
      await import('../services/api').then(m =>
        m.default.patch(`/clients/${clientId}/connections/google_ads`, {
          account_id:   selectedAccount,
          account_name: account?.name || selectedAccount,
        })
      );
      setAccountSaved(true);
      clientsAPI.get(clientId).then(r => { setClient(r.data); setConns(r.data.connections || []); });
    } catch (e) { alert('Error al guardar la cuenta'); }
    finally { setSavingAccount(false); }
  };

  const saveMetaAccount = async () => {
    if (!selectedMetaAccount) return;
    setSavingMetaAccount(true);
    try {
      const account = ALL_META_ACCOUNTS.find(a => a.id === selectedMetaAccount);
      await import('../services/api').then(m =>
        m.default.patch(`/clients/${clientId}/connections/meta_ads`, {
          account_id:   selectedMetaAccount,
          account_name: account?.name || selectedMetaAccount,
        })
      );
      setMetaAccountSaved(true);
      clientsAPI.get(clientId).then(r => { setClient(r.data); setConns(r.data.connections || []); });
    } catch (e) { alert('Error al guardar la cuenta'); }
    finally { setSavingMetaAccount(false); }
  };

  const disconnectPlatform = async (platform) => {
    if (!confirm('¿Desconectar esta plataforma?')) return;
    await import('../services/api').then(m =>
      m.default.delete(`/clients/${clientId}/connections/${platform}`)
    );
    setConns(prev => prev.filter(c => c.platform !== platform));
    if (platform === 'google_ads') { setAccountSaved(false); setAccounts([]); }
    if (platform === 'meta_ads')   { setMetaAccountSaved(false); setMetaAccounts([]); }
  };

  const gConn = conns.find(c => c.platform === 'google_ads');
  const mConn = conns.find(c => c.platform === 'meta_ads');
  const justConnectedGoogle = searchParams.get('connected') === 'google';
  const justConnectedMeta   = searchParams.get('connected') === 'meta';

  if (loading) return <div style={{ padding: 40, color: 'var(--muted)' }}>Cargando…</div>;

  return (
    <div style={{ padding: 24, maxWidth: 760 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>Conexiones de plataformas</h1>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 28 }}>
        Cliente: <strong style={{ color: 'var(--text)' }}>{client?.name}</strong>
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* GOOGLE ADS */}
        <div style={{ background: 'var(--surface)', border: `1px solid ${gConn ? '#4285F444' : 'var(--border)'}`, borderRadius: 14, padding: 24 }}>
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
              </div>
              {justConnectedGoogle && !accountSaved && accounts.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>Seleccioná la cuenta de Google Ads:</div>
                  <select value={selectedAccount} onChange={e => setSelectedAccount(e.target.value)}
                    style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, marginBottom: 8, outline: 'none' }}>
                    <option value="">-- Elegir cuenta --</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.id})</option>)}
                  </select>
                  <button onClick={saveAccount} disabled={!selectedAccount || savingAccount}
                    style={{ width: '100%', padding: '8px', borderRadius: 8, border: 'none', background: '#4285F4', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, opacity: savingAccount ? 0.6 : 1 }}>
                    {savingAccount ? 'Guardando…' : 'Guardar cuenta'}
                  </button>
                </div>
              )}
              {accountSaved && <div style={{ fontSize: 12, color: '#34C78A', marginBottom: 12 }}>✓ Cuenta guardada</div>}
              <button onClick={() => disconnectPlatform('google_ads')}
                style={{ width: '100%', padding: '9px', borderRadius: 8, border: '1px solid rgba(255,77,106,0.4)', background: 'rgba(255,77,106,0.08)', color: '#FF4D6A', cursor: 'pointer', fontSize: 13 }}>
                Desconectar
              </button>
            </>
          ) : (
            <>
              <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16, lineHeight: 1.6 }}>
                Conecta tu cuenta de Google Ads para ver campañas, palabras clave y métricas de conversión.
              </p>
              <button onClick={connectGoogle}
                style={{ width: '100%', padding: '10px', borderRadius: 8, border: 'none', background: '#4285F4', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                Conectar Google Ads
              </button>
            </>
          )}
        </div>

        {/* META ADS */}
        <div style={{ background: 'var(--surface)', border: `1px solid ${mConn ? '#0866FF44' : 'var(--border)'}`, borderRadius: 14, padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: '#0866FF22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🔷</div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 16 }}>Meta Ads</div>
              <div style={{ fontSize: 12, color: mConn ? '#34C78A' : 'var(--muted)', marginTop: 3 }}>
                {mConn ? '✓ Conectado' : 'Sin conectar'}
              </div>
            </div>
          </div>

          {mConn ? (
            <>
              <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Cuenta conectada</div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{mConn.account_name || mConn.account_id || 'Sin cuenta seleccionada'}</div>
              </div>
              {justConnectedMeta && !metaAccountSaved && metaAccounts.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>Seleccioná la cuenta de Meta Ads:</div>
                  <select value={selectedMetaAccount} onChange={e => setSelectedMetaAccount(e.target.value)}
                    style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, marginBottom: 8, outline: 'none' }}>
                    <option value="">-- Elegir cuenta --</option>
                    {metaAccounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.id})</option>)}
                  </select>
                  <button onClick={saveMetaAccount} disabled={!selectedMetaAccount || savingMetaAccount}
                    style={{ width: '100%', padding: '8px', borderRadius: 8, border: 'none', background: '#0866FF', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, opacity: savingMetaAccount ? 0.6 : 1 }}>
                    {savingMetaAccount ? 'Guardando…' : 'Guardar cuenta'}
                  </button>
                </div>
              )}
              {metaAccountSaved && <div style={{ fontSize: 12, color: '#34C78A', marginBottom: 12 }}>✓ Cuenta guardada</div>}
              <button onClick={() => disconnectPlatform('meta_ads')}
                style={{ width: '100%', padding: '9px', borderRadius: 8, border: '1px solid rgba(255,77,106,0.4)', background: 'rgba(255,77,106,0.08)', color: '#FF4D6A', cursor: 'pointer', fontSize: 13 }}>
                Desconectar
              </button>
            </>
          ) : (
            <>
              <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16, lineHeight: 1.6 }}>
                Conecta tu cuenta de Meta para ver campañas de Facebook e Instagram, audiencias y ROAS.
              </p>
              <button onClick={connectMeta}
                style={{ width: '100%', padding: '10px', borderRadius: 8, border: 'none', background: '#0866FF', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                Conectar Meta Ads
              </button>
            </>
          )}
        </div>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginTop: 24 }}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>Antes de conectar</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.8 }}>
          <strong style={{ color: 'var(--text)' }}>Google Ads:</strong> el cliente debe otorgar acceso a la cuenta desde Google Ads → Herramientas → Accesos y seguridad, o bien darte acceso a través de tu cuenta MCC (Manager Account).<br /><br />
          <strong style={{ color: 'var(--text)' }}>Meta Ads:</strong> el cliente debe agregarte como socio en Business Manager → Socios → Compartir activos, con permiso de <em>Analista</em> o superior.
        </div>
      </div>
    </div>
  );
}
