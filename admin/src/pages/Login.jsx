import React, { useState } from 'react';
import { useAuth } from '../auth/AuthContext';

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('Enter your staff email and password.');
      return;
    }
    setLoading(true);
    try {
      await signIn(email, password);
      // AuthContext + App routing take over on success.
    } catch (err) {
      setError(prettyError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="brand-mark">D</div>
        <h2 style={{ textAlign: 'center' }}>Deluxe Admin</h2>
        <p className="muted small" style={{ textAlign: 'center', marginTop: 6, marginBottom: 22 }}>
          Staff sign-in
        </p>

        {error ? <div className="error-note">{error}</div> : null}

        <div className="field">
          <label className="label">Email</label>
          <input
            className="input"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@deluxe.com"
          />
        </div>
        <div className="field">
          <label className="label">Password</label>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>

        <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="muted small mt-3" style={{ textAlign: 'center' }}>
          Staff accounts are created by an administrator. There is no public sign-up.
        </p>
      </form>
    </div>
  );
}

function prettyError(e) {
  const map = {
    'auth/invalid-email': 'That email address looks invalid.',
    'auth/user-not-found': 'No account with that email.',
    'auth/wrong-password': 'Incorrect password.',
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/too-many-requests': 'Too many attempts. Please try again later.',
    'auth/user-disabled': 'This account has been disabled.',
  };
  return map[(e && e.code) || ''] || 'Sign-in failed. Please try again.';
}
