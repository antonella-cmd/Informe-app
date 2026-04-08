// ============================================================
// src/pages/LoginPage.jsx
// ============================================================
import { useState }    from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth }     from '../context/AuthContext';

export default function LoginPage() {
  const { login, register } = useAuth();
  const navigate   = useNavigate();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [isReg,    setIsReg]    = useState(false);
  const [name,     setName]     = useState('');

  const submit = async () => {
    setError(''); setLoading(true);
    try {
      if (isReg) {
        await register(name, email, password);
      } else {
        await login(email, password);
      }
      navigate('/');
    } catch (e) {
      setError(e.response?.data?.error || 'Error al iniciar sesión');
    } finally { setLoading(false); }
  };

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 18, padding: 40, width: 380,
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, margin: '0 auto 12px',
            background: 'linear-gradient(135deg, #4285F4, #9B6DFF)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 20, color: '#fff',
          }}>M</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
            Metrics<span style={{ color: '#9B6DFF' }}>Hub</span>
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 6 }}>
            Plataforma de analítica para agencias
          </p>
        </div>

        {error && (
          <div style={{
            background: 'rgba(255,77,106,0.1)', border: '1px solid rgba(255,77,106,0.3)',
            borderRadius: 8, padding: '10px 14px', color: '#FF4D6A', fontSize: 13, marginBottom: 16,
          }}>{error}</div>
        )}

        {isReg && (
          <input value={name} onChange={e => setName(e.target.value)}
            placeholder="Nombre completo" style={{ ...inp, marginBottom: 10 }} />
        )}
        <input value={email}    onChange={e => setEmail(e.target.value)}
          placeholder="Email" type="email" style={{ ...inp, marginBottom: 10 }} />
        <input value={password} onChange={e => setPassword(e.target.value)}
          placeholder="Contraseña" type="password" style={{ ...inp, marginBottom: 20 }}
          onKeyDown={e => e.key === 'Enter' && submit()} />

        <button onClick={submit} disabled={loading} style={{
          width: '100%', padding: '11px', borderRadius: 9, border: 'none',
          background: '#9B6DFF', color: '#fff', fontWeight: 700, fontSize: 14,
          cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
        }}>
          {loading ? 'Ingresando…' : isReg ? 'Crear cuenta' : 'Ingresar'}
        </button>

        <p style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: 'var(--muted)' }}>
          {isReg ? '¿Ya tenés cuenta? ' : '¿No tenés cuenta? '}
          <button onClick={() => setIsReg(!isReg)} style={{
            background: 'none', border: 'none', color: '#9B6DFF', cursor: 'pointer', fontSize: 13,
          }}>
            {isReg ? 'Iniciar sesión' : 'Registrarse'}
          </button>
        </p>
      </div>
    </div>
  );
}

const inp = {
  width: '100%', background: 'var(--bg)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '10px 14px', color: 'var(--text)', fontSize: 14,
  outline: 'none', boxSizing: 'border-box', display: 'block',
};
