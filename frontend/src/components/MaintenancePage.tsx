import React, { useEffect, useState } from 'react';
import './MaintenancePage.css';

type MaintenancePageProps = {
  onAuthUpdate: (token: string | null, email: string | null) => void;
};

type LoginResponse = {
  token?: string;
  email?: string;
  error?: string;
};

type MeResponse = {
  is_admin?: boolean;
  error?: string;
};

const MaintenancePage: React.FC<MaintenancePageProps> = ({ onAuthUpdate }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setStatus(null);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const nextEmail = email.trim();
    const nextPassword = password;
    if (!nextEmail || !nextPassword) {
      setStatus('Email and password are required');
      return;
    }

    setSubmitting(true);
    setStatus(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ email: nextEmail, password: nextPassword }),
      });

      const data: LoginResponse = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }

      const token = (data.token ?? '').trim();
      const serverEmail = (data.email ?? '').trim();
      if (!token) throw new Error('Login failed');

      const meRes = await fetch('/api/auth/me', {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      const meData: MeResponse = await meRes.json().catch(() => ({}));
      if (!meRes.ok) {
        throw new Error(meData?.error || `HTTP ${meRes.status}`);
      }

      if (!meData.is_admin) {
        onAuthUpdate(null, null);
        throw new Error('Admins only');
      }

      onAuthUpdate(token, serverEmail || nextEmail);
      setPassword('');
      setStatus(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="maintenance">
      <div className="maintenance__card">
        <h1 className="maintenance__title">Under Maintenance</h1>
        <p className="maintenance__text">
          The site is temporarily unavailable. Admin access is required.
        </p>

        <form className="maintenance__form" onSubmit={submit}>
          <label className="maintenance__label">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>

          <label className="maintenance__label">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          {status && <div className="maintenance__status">{status}</div>}

          <button className="maintenance__button" type="submit" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Admin login'}
          </button>
        </form>

        <div className="maintenance__hint">
          If you’re the admin, sign in to access the site.
        </div>
      </div>
    </div>
  );
};

export default MaintenancePage;
