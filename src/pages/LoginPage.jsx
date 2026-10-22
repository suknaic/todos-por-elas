import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { login } from '../api/dashboard.js';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchParams] = useSearchParams();
  const rawNext = searchParams.get('next') || '/';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('/login') ? rawNext : '/';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      window.location.assign(next.startsWith('/') ? next : '/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '24px', background: 'var(--bg)' }}>
      <section className="login-shell">
        <section className="login-card" aria-labelledby="loginTitle">
          <div className="login-brand">
            <img src="/assets/por-todos-elas-logo.png" alt="Por Todas Elas" />
            <div><h1>TodosPorElas</h1><p>Cadastro de Usuários</p></div>
          </div>
          <h2 id="loginTitle">Acessar dashboard</h2>
          <p className="login-intro">Entre com suas credenciais para continuar.</p>
          <p className="login-error" id="loginError" role="alert" hidden={!error}>{error}</p>
          <form id="loginForm" onSubmit={handleSubmit}>
            <div className="login-field">
              <label htmlFor="username">Usuário</label>
              <input id="username" name="username" autoComplete="username" required autoFocus value={username} onChange={e => setUsername(e.target.value)} disabled={loading} />
            </div>
            <div className="login-field">
              <label htmlFor="password">Senha</label>
              <input id="password" name="password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} disabled={loading} />
            </div>
            <button className="btn btn-primary login-submit" id="loginSubmit" type="submit" disabled={loading}>
              {loading ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
        </section>
      </section>
    </main>
  );
}