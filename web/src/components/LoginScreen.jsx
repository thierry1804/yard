import { useState } from 'react';
import './LoginScreen.css';

export default function LoginScreen({ onLogin, notice }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);
    try {
      await onLogin(email.trim(), password);
    } catch (err) {
      setError(err.message || 'Connexion impossible. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-page">
      <div className="login-shell">
        <div className="login-brand">
          <span className="login-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6">
              <rect x="4" y="7" width="24" height="18" rx="2" />
              <path d="M10 11v10m6-10v10m6-10v10M8 25v3m16-3v3" />
            </svg>
          </span>
          <div><p className="login-brand-name">CCIS Yard View</p><p className="login-brand-site">CEVA Logistics · Dépôt Toamasina</p></div>
        </div>

        <section className="login-card" aria-labelledby="login-title">
          <header className="login-heading">
            <p className="login-eyebrow">VOTRE ESPACE DE TRAVAIL</p>
            <h1 id="login-title">Connexion</h1>
            <p>Connectez-vous pour accéder à la gestion du parc.</p>
          </header>
          <form className="login-form" onSubmit={handleSubmit} aria-busy={loading}>
            {notice && !error && <p className="login-notice" role="status">{notice}</p>}
            <div className="login-field">
              <label htmlFor="login-email">Adresse e-mail</label>
              <input id="login-email" name="email" type="email" value={email}
                onChange={(e) => setEmail(e.target.value)} placeholder="prenom.nom@entreprise.com"
                autoComplete="username" autoCapitalize="none" spellCheck={false} required readOnly={loading} />
            </div>
            <div className="login-field">
              <label htmlFor="login-password">Mot de passe</label>
              <div className="login-password">
                <input id="login-password" name="password" type={showPassword ? 'text' : 'password'}
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="Votre mot de passe" autoComplete="current-password" required readOnly={loading} />
                <button className="login-reveal" type="button" onClick={() => setShowPassword(!showPassword)}
                  aria-controls="login-password" aria-pressed={showPassword}
                  aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>
                  {showPassword ? 'Masquer' : 'Afficher'}
                </button>
              </div>
            </div>
            {error && <p className="login-error" role="alert">{error}</p>}
            <button className="login-submit" type="submit" disabled={loading}>
              {loading ? <><span className="login-spinner" aria-hidden="true" />Connexion en cours…</> : <>Se connecter <span aria-hidden="true">→</span></>}
            </button>
          </form>
          <p className="login-help">Un problème d’accès ?<br /><span>Contactez votre administrateur.</span></p>
        </section>
        <p className="login-footer">Accès réservé aux équipes autorisées</p>
      </div>
    </main>
  );
}
