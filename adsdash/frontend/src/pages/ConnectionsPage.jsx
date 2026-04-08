import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { googleAPI, metaAPI, clientsAPI } from '../services/api';

export default function ConnectionsPage() {
  const { clientId } = useParams();
  const [searchParams] = useSearchParams();
  const [client, setClient] = useState(null);
  const [conns, setConns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [savingAccount, setSavingAccount] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [accountSaved, setAccountSaved] = useState(false);

  useEffect(() => {
    clientsAPI.get(clientId).then(r => {
      setClient(r.data);
      setConns(r.data.connections || []);
    }).finally(() => setLoading(false));
  }, [clientId]);

  useEffect(() => {
    if (searchParams.get('connected') === 'google') {
      setLoadingAccounts(true);
      googleAPI.accounts(clientId)
        .then(r => setAccounts(r.data || []))
        .catch(() => setAccounts([]))
        .finally(() => setLoadingAccounts(false));
    }
  }, [searchParams, clientId]);

  const connectGoogle = async () => {
    const r = await googleAPI.authUrl(clientId);
    window.location.href = r.data.url + `&state=clientId:${clientId}`;
  };

  const connectMeta = async () => {
    const r = await metaAPI.authUrl(clientId);
    window.location.href = r.data.url;
  };

  const saveAccount = async () => {
    if (!selectedAccount) return;
    setSavingAccount(true);
    try {
      const account = accounts.find(a => a.id === selectedAccount);
      await import('../services/api').then(m =>
        m.default.patch(`/clients/${clientId}/connections/google_ads`, {
          account_id: selectedAccount,
          account_name: account?.name || selectedAccount,
        })
      );
      setAccountSaved(true);
      clientsAPI.get(clientId).then(r => {
        setClient(r.data);
        setConns(r.data.connections || []);
      });
    } catch(e) {
      alert('Error al guardar la cuenta');
    } finally {
      setSavingAccount(false);
    }
  };

  const disconnectPlatform = async (platform) => {
    if (!confirm('¿Desconectar esta plataforma?')) return;
    await import('../services/api').then(m =>
      m.default.delete(`/clients/${clientId}/connections/${platform}`)
    );
    setConns(prev => prev.filter(c => c.platform !== platform));
    setAccountSaved(false);
    setAccounts([]);
  };

  const gConn = conns.find(c => c.platform === 'google_ads');
  const mConn = conns.find(c => c.platform === 'meta_ads');
  const justConnectedGoogle = searchParams.get('connected') === 'google';

  if (loading) return <div style={{ padding: 40, color: 'var(--muted)' }}>Cargando…</div>;

  return (
    <div style={{ padding: 24, maxWidth: 760 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>Conexiones de plataformas</h1>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 28 }}>
        Cliente: <strong style={{ color: 'var(--text)' }}>{client?.name}</strong>
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* GOOGLE ADS */}
        <div style={{
          background: 'var(--surface)',
          border: `1px solid ${gConn ? '#4285F444' : 'var(--border)'}`,
          borderRadius: 14, padding: 24,
        }}>
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
                <div style={{ fontSize: 13, fontWeight: 500 }}>
                  {gConn.account_name || gConn.account_id || 'Sin cuenta seleccionada'}
                </div>
              </div>

              {/* Selector de cuentas */}
              {justConnectedGoogle && !accountSaved && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
                    Seleccioná la cuenta de Google Ads de este cliente:
                  </div>
                  {loadingAccounts ? (
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>Cargando cuentas…</div>
                  ) : accounts.length > 0 ? (
                    <>
                      <select
                        value={selectedAccount}
                        onChange={e => setSelectedAccount(e.target.value)}
                        style={{
                          width: '100%', background: 'var(--bg)', border: '1px solid var(--border)',
                          borderRadius: 8, padding: '8px 12px', color: 'var(--text)',
                          fontSize: 13, marginBottom: 8, outline: 'none',
                        }}
                      >
                        <option value="">-- Elegir cuenta --</option>
                        {accounts.map(a => (
                          <option key={a.id} value={a.id}>
                            {a.name} ({a.id})
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={saveAccount}
                        disabled={!selectedAccount || savingAccount}
                        style={{
                          width: '100%', padding: '8px', borderRadius: 8, border: 'none',
                          background: '#4285F4', color: '#fff', cursor: 'pointer',
                          fontSize: 13, fontWeight: 600, opacity: savingAccount ? 0.6 : 1,
                        }}
                      >
                        {savingAccount ? 'Guardando…' : 'Guardar cuenta'}
                      </button>
                    </>
                  ) : (
                    <div style={{ fontSize: 12, color: '#FFB547' }}>
                      No se encontraron cuentas accesibles. Verificá que tu MCC tenga acceso.
                    </div>
                  )}
                </div>
              )}

              {accountSaved && (
                <div style={{ fontSize: 12, color: '#34C78A', marginBottom: 12 }}>
                  ✓ Cuenta guardada correctamente
                </div>
              )}

              <button onClick={() => disconnectPlatform('google_ads')} style={{
                width: '100%', padding: '9px', borderRadius: 8,
                border: '1px solid rgba(255,77,106,0.4)', background: 'rgba(255,77,106,0.08)',
                color: '#FF4D6A', cursor: 'pointer', fontSize: 13,
              }}>
                Desconectar
              </button>
            </>
          ) : (
            <>
              <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16, lineHeight: 1.6 }}>
                Conecta tu cuenta de Google Ads para ver campañas, palabras clave y métricas de conversión.
              </p>
              <button onClick={connectGoogle} style={{
                width: '100%', padding: '10px', borderRadius: 8, border: 'none',
                background: '#4285F4', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              }}>
                Conectar Google Ads
              </button>
            </>
          )}
        </div>

        {/* META ADS */}
        <div style={{
          background: 'var(--surface)',
          border: `1px solid ${mConn ? '#0866FF44' : 'var(--border)'}`,
          borderRadius: 14, padding: 24,
        }}>
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
              <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 12, marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Cuenta conectada</div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>
                  {mConn.account_name || mConn.account_id || 'Sin cuenta seleccionada'}
                </div>
              </div>
              <button onClick={() => disconnectPlatform('meta_ads')} style={{
                width: '100%', padding: '9px', borderRadius: 8,
                border: '1px solid rgba(255,77,106,0.4)', background: 'rgba(255,77,106,0.08)',
                color: '#FF4D6A', cursor: 'pointer', fontSize: 13,
              }}>
                Desconectar
              </button>
            </>
          ) : (
            <>
              <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16, lineHeight: 1.6 }}>
                Conecta tu cuenta de Meta para ver campañas de Facebook e Instagram, audiencias y ROAS.
              </p>
              <button onClick={connectMeta} style={{
                width: '100%', padding: '10px', borderRadius: 8, border: 'none',
                background: '#0866FF', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              }}>
                Conectar Meta Ads
              </button>
            </>
          )}
        </div>
      </div>

      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
        padding: 20, marginTop: 24,
      }}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>Antes de conectar</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.8 }}>
          <strong style={{ color: 'var(--text)' }}>Google Ads:</strong> el cliente debe otorgar acceso
          a la cuenta desde Google Ads → Herramientas → Accesos y seguridad, o bien darte acceso
          a través de tu cuenta MCC (Manager Account).<br /><br />
          <strong style={{ color: 'var(--text)' }}>Meta Ads:</strong> el cliente debe agregarte como
          socio en Business Manager → Socios → Compartir activos, con permiso de <em>Analista</em> o superior.
        </div>
      </div>
    </div>
  );
}
