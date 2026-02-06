import React, { useState } from 'react';

type Mode = 'login' | 'register';

type AuthPageProps = {
  signedIn: boolean;
  signedInEmail: string | null;
  onAuthUpdate: (token: string | null, email: string | null) => void;
  onDone?: () => void;
};

type AuthResponse = {
  token?: string;
  email?: string;
  error?: string;
};

const AuthPage: React.FC<AuthPageProps> = ({ signedIn, signedInEmail, onAuthUpdate, onDone }) => {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);

    const payload = {
      email: email.trim(),
      password,
    };

    try {
      const res = await fetch(mode === 'register' ? '/api/auth/register' : '/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data: AuthResponse = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }

      if (!data.token) throw new Error('Missing token');

      onAuthUpdate(data.token, data.email ?? email.trim());

      setStatus(mode === 'register' ? '✅ Account created and signed in!' : '✅ Signed in!');
      onDone?.();
    } catch (err) {
      setStatus(`❌ ${err instanceof Error ? err.message : 'Authentication failed'}`);
    }
  };

  const signOut = () => {
    onAuthUpdate(null, null);
    setStatus('Signed out.');
  };

  return (
    <div className="page">
      <h2 style={{ marginTop: 0 }}>Account</h2>

      {signedIn ? (
        <div style={{ marginBottom: 12, opacity: 0.95 }}>
          Signed in{signedInEmail ? ` as ${signedInEmail}` : ''}.
          <div style={{ marginTop: 10 }}>
            <button type="button" onClick={signOut}>
              Sign out
            </button>
          </div>
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <button
          type="button"
          onClick={() => setMode('login')}
          aria-pressed={mode === 'login'}
          style={{ opacity: mode === 'login' ? 1 : 0.8 }}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => setMode('register')}
          aria-pressed={mode === 'register'}
          style={{ opacity: mode === 'register' ? 1 : 0.8 }}
        >
          Create account
        </button>
      </div>

      <form onSubmit={submit} style={{ display: 'grid', gap: 10, maxWidth: 420 }}>
        <input
          name="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
        <input
          name="password"
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          required
        />
        <button type="submit">{mode === 'register' ? 'Create account' : 'Sign in'}</button>
      </form>

      {status ? <div style={{ marginTop: 12 }}>{status}</div> : null}
    </div>
  );
};

export default AuthPage;
