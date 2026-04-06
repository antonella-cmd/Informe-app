// ============================================================
// src/pages/ConnectionsPage.jsx
// Connect / disconnect Google Ads and Meta Ads per client
// ============================================================
import { useEffect, useState } from 'react';
import { useParams }           from 'react-router-dom';
import { googleAPI, metaAPI, clientsAPI } from '../services/api';

function ConnectCard({ platform, connection, onConnect, onDisconnect }) {
  const isGoogle = platform === 'google_ads';
  const name     = isGoogle ? 'Google Ads' : 'Meta Ads';
  const color    = isGoogle ? '#4285F4' : '#0866FF';
  const icon     = isGoogle ? '🔵' : '🔷';
  const connected = !!connection;

  return (
    <div style={{
      background: 'var(--surface)', border: `1px solid ${connected ? color + '44' : 'var(--border)'}`,
      borderRadius: 14, padding: 24,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12, background: color + '22',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
        }}>{icon}</div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 16 }}>{name}</div>
          <div style={{ fontSize: 12, color: connected ? '#34C78A' : 'var(--muted)', marginTop: 3 }}>
            {connected ? '✓ Conectado' : 'Sin conectar'}
          </div>
        </div>
      </div>

      {connected ? (
        <>
          <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 12, marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Cuenta conectada</div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>
              {connection.account_name || connection.account_id || 'ID: ' + connection.account_id}
            </div>
          </div>
          <button onClick={onDisconnect} style={{
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
            {isGoogle
              ? 'Conecta tu cuenta de Google Ads para ver campañas, palabras clave y métricas de conversión.'
              : 'Conecta tu cuenta de Meta para ver campañas de Facebook e Instagram, audiencias y ROAS.'}
          </p>
          <button onClick={onConnect} style={{
            width: '100%', padding: '10px', borderRadius: 8, border: 'none',
            background: color, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600,
          }}>
            Conectar {name}
          </button>
        </>
      )}
    </div>
  );
}

export default function ConnectionsPage() {
  const { clientId } = useParams();
  const [client, setClient]  = useState(null);
  const [conns,  setConns]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      clientsAPI.get(clientId),
      // We fetch connections via the client details
    ]).then(([r]) => {
      setClient(r.data);
      setConns(r.data.connections || []);
    }).finally(() => setLoading(false));
  }, [clientId]);

  const connectGoogle = async () => {
    const r   = await googleAPI.authUrl(clientId);
    window.location.href = r.data.url + `&state=clientId:${clientId}`;
  };

  const connectMeta = async () => {
    const r = await metaAPI.authUrl(clientId);
    window.location.href = r.data.url;
  };

  const gConn = conns.find(c => c.platform === 'google_ads');
  const mConn = conns.find(c => c.platform === 'meta_ads');

  if (loading) return <div style={{ padding: 40, color: 'var(--muted)' }}>Cargando…</div>;

  return (
    <div style={{ padding: 24, maxWidth: 760 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>Conexiones de plataformas</h1>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 28 }}>
        Cliente: <strong style={{ color: 'var(--text)' }}>{client?.name}</strong>
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <ConnectCard
          platform="google_ads"
          connection={gConn}
          onConnect={connectGoogle}
          onDisconnect={() => {/* call DELETE /api/clients/:id/connections/google_ads */}}
        />
        <ConnectCard
          platform="meta_ads"
          connection={mConn}
          onConnect={connectMeta}
          onDisconnect={() => {}}
        />
      </div>

      {/* Instructions */}
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
          socio en Business Manager → Socios → Compartir activos, con permiso de <em>Analista</em>
          o superior.
        </div>
      </div>
    </div>
  );
}
