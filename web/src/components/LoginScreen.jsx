import { useState } from 'react';

export default function LoginScreen({ onLogin, notice }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await onLogin(email, password);
    } catch (err) {
      setError(err.message || 'Connexion impossible.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'var(--bg)' }}>
      <form
        className="modal"
        style={{ maxWidth: 380, margin: '12vh auto' }}
        onSubmit={handleSubmit}
      >
        <div className="modal-header">
          <div>
            <h3>CCIS Yard View</h3>
            <span className="modal-subtitle">CEVA Logistics — Dépôt Toamasina</span>
          </div>
        </div>
        <div className="modal-form">
          <div className="form-field">
            <label>Email</label>
            <input
              type="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div className="form-field">
            <label>Mot de passe</label>
            <input
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {notice && !error && <div className="form-result error">{notice}</div>}
          {error && <div className="form-result error">{error}</div>}
          <button className="modal-primary-btn" type="submit" disabled={loading}>
            {loading ? 'Connexion…' : 'Se connecter'}
          </button>
        </div>
      </form>
    </div>
  );
}
