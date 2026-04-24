// ============================================================
// src/pages/LoginPage.jsx — PTI Analytics
// ============================================================
import { useState }    from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth }     from '../context/AuthContext';

const PTI_DARK   = '#0D0D1A';
const PTI_VIOLET = '#8B5CF6';
const PTI_GRAD   = 'linear-gradient(135deg, #6B3FA0, #4F46E5)';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate   = useNavigate();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const submit = async () => {
    if (!email || !password) { setError('Completá email y contraseña'); return; }
    setError(''); setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (e) {
      setError(e.response?.data?.error || 'Credenciales incorrectas');
    } finally { setLoading(false); }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: PTI_DARK,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Inter', sans-serif",
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at 60% 30%, rgba(107,63,160,0.25) 0%, transparent 65%)',
        pointerEvents: 'none',
      }} />

      <div style={{
        background: '#12112A',
        border: '1px solid rgba(107,63,160,0.35)',
        borderRadius: 20,
        padding: '44px 40px',
        width: 380,
        position: 'relative',
        boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
      }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: PTI_GRAD,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 13, color: '#fff',
            margin: '0 auto 14px',
            boxShadow: '0 4px 20px rgba(107,63,160,0.5)',
            letterSpacing: 0.5,
          }}>
            PTI
          </div>
          <h1 style={{
            fontSize: 22, fontWeight: 700, color: '#FFFFFF',
            letterSpacing: '-0.3px', margin: '0 0 6px',
          }}>
            PTI <span style={{ color: PTI_VIOLET }}>Analytics</span>
          </h1>
          <p style={{ color: '#6B6B8A', fontSize: 13, margin: 0 }}>
            Plataforma interna · PTI Consulting Partner
          </p>
        </div>

        {error && (
          <div style={{
            background: 'rgba(192,57,43,0.12)',
            border: '1px solid rgba(192,57,43,0.4)',
            borderRadius: 8, padding: '10px 14px',
            color: '#E57373', fontSize: 13, marginBottom: 18,
          }}>
            ⚠️ {error}
          </div>
        )}

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, color: '#6B6B8A', display: 'block', marginBottom: 6, letterSpacing: 0.8 }}>
            EMAIL
          </label>
          <input
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="tu@pticonsulting.com"
            type="email"
            style={inputStyle}
            onFocus={e => e.target.style.borderColor = PTI_VIOLET}
            onBlur={e => e.target.style.borderColor = 'rgba(107,63,160,0.35)'}
          />
        </div>

        <div style={{ marginBottom: 28 }}>
          <label style={{ fontSize: 11, color: '#6B6B8A', display: 'block', marginBottom: 6, letterSpacing: 0.8 }}>
            CONTRASEÑA
          </label>
          <input
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••••"
            type="password"
            style={inputStyle}
            onFocus={e => e.target.style.borderColor = PTI_VIOLET}
            onBlur={e => e.target.style.borderColor = 'rgba(107,63,160,0.35)'}
            onKeyDown={e => e.key === 'Enter' && submit()}
          />
        </div>

        <button
          onClick={submit}
          disabled={loading}
          style={{
            width: '100%', padding: '13px',
            borderRadius: 10, border: 'none',
            background: loading ? '#4A3A6A' : PTI_GRAD,
            color: '#FFFFFF',
            fontWeight: 700, fontSize: 14,
            cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: "'Inter', sans-serif",
            boxShadow: loading ? 'none' : '0 4px 20px rgba(107,63,160,0.4)',
          }}
        >
          {loading ? 'Ingresando...' : 'Ingresar'}
        </button>

        <div style={{
          textAlign: 'center', marginTop: 28,
          paddingTop: 20, borderTop: '1px solid rgba(107,63,160,0.2)',
        }}>
          <p style={{ fontSize: 11, color: '#3A3A5A', margin: 0 }}>
            pticonsultingpartner.com
          </p>
        </div>
      </div>
    </div>
  );
}

const inputStyle = {
  width: '100%',
  background: '#0D0D1A',
  border: '1px solid rgba(107,63,160,0.35)',
  borderRadius: 8,
  padding: '11px 14px',
  color: '#FFFFFF',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
  display: 'block',
  fontFamily: "'Inter', sans-serif",
  transition: 'border-color 0.15s',
};
