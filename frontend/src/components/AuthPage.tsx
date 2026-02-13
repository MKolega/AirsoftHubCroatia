import React, { useEffect, useMemo, useState } from 'react';

type Mode = 'login' | 'register';

type AuthPageProps = {
  signedIn: boolean;
  signedInEmail: string | null;
  authToken: string | null;
  onOpenEvent?: (id: number) => void;
  onAuthUpdate: (token: string | null, email: string | null) => void;
  onDone?: () => void;
};

type AuthResponse = {
  token?: string;
  email?: string;
  error?: string;
};

type MeResponse = {
  email?: string;
  username?: string;
  airsoft_club?: string;
  error?: string;
};

type MyEvent = {
  id: number;
  name: string;
  date?: string;
  location?: string;
  creator_email?: string;
};

type SavedEvent = {
  id: number;
  name: string;
  date?: string;
  location?: string;
};

function formatDateDDMMYYYY(value: string) {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return value;

  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

function getApiErrorMessage(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const rec = value as Record<string, unknown>;
  const err = rec.error;
  return typeof err === 'string' && err.trim() ? err : null;
}

const AuthPage: React.FC<AuthPageProps> = ({
  signedIn,
  signedInEmail,
  authToken,
  onOpenEvent,
  onAuthUpdate,
  onDone,
}) => {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [airsoftClub, setAirsoftClub] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  const [me, setMe] = useState<{ username: string; airsoftClub: string } | null>(null);
  const [meError, setMeError] = useState<string | null>(null);

  const [myEvents, setMyEvents] = useState<MyEvent[]>([]);
  const [myEventsError, setMyEventsError] = useState<string | null>(null);

  const [savedEvents, setSavedEvents] = useState<SavedEvent[]>([]);
  const [savedEventsError, setSavedEventsError] = useState<string | null>(null);

  useEffect(() => {
    if (!signedIn || !authToken) {
      setMe(null);
      setMeError(null);
      return;
    }

    const controller = new AbortController();
    setMeError(null);

    fetch('/api/auth/me', {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
    })
      .then(async res => {
        const data: MeResponse = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
        const club = (data.airsoft_club ?? '').trim() || 'No Club/Freelancer';
        const uname = (data.username ?? '').trim();
        setMe({ username: uname, airsoftClub: club });
      })
      .catch(err => {
        if (!controller.signal.aborted) setMeError(err instanceof Error ? err.message : String(err));
      });

    return () => controller.abort();
  }, [signedIn, authToken]);

  useEffect(() => {
    if (!signedIn || !signedInEmail) {
      setMyEvents([]);
      setMyEventsError(null);
      return;
    }

    const controller = new AbortController();
    setMyEventsError(null);

    fetch('/api/events', { signal: controller.signal })
      .then(async res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: unknown) => {
        const list = Array.isArray(data) ? (data as MyEvent[]) : [];
        const mine = list.filter(e => (e?.creator_email ?? '').toLowerCase() === signedInEmail.toLowerCase());
        setMyEvents(mine);
      })
      .catch(err => {
        if (!controller.signal.aborted) setMyEventsError(err instanceof Error ? err.message : String(err));
      });

    return () => controller.abort();
  }, [signedIn, signedInEmail]);

  useEffect(() => {
    if (!signedIn || !authToken) {
      setSavedEvents([]);
      setSavedEventsError(null);
      return;
    }

    const controller = new AbortController();
    setSavedEventsError(null);

    fetch('/api/saved-events', {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
    })
      .then(async res => {
        const data = await res.json().catch(() => []);
        if (!res.ok) {
          const msg = getApiErrorMessage(data);
          throw new Error(msg ?? `HTTP ${res.status}`);
        }
        const list = Array.isArray(data) ? (data as SavedEvent[]) : [];
        setSavedEvents(list);
      })
      .catch(err => {
        if (!controller.signal.aborted) setSavedEventsError(err instanceof Error ? err.message : String(err));
      });

    return () => controller.abort();
  }, [signedIn, authToken]);

  const sortedSavedEvents = useMemo(() => {
    return [...savedEvents].sort((a, b) => {
      const at = a.date ? new Date(a.date).getTime() : Number.POSITIVE_INFINITY;
      const bt = b.date ? new Date(b.date).getTime() : Number.POSITIVE_INFINITY;
      if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) return at - bt;
      if (Number.isFinite(at) && !Number.isFinite(bt)) return -1;
      if (!Number.isFinite(at) && Number.isFinite(bt)) return 1;
      return String(a.name ?? '').localeCompare(String(b.name ?? ''));
    });
  }, [savedEvents]);

  const sortedMyEvents = useMemo(() => {
    return [...myEvents].sort((a, b) => {
      const at = a.date ? new Date(a.date).getTime() : Number.POSITIVE_INFINITY;
      const bt = b.date ? new Date(b.date).getTime() : Number.POSITIVE_INFINITY;
      if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) return at - bt;
      if (Number.isFinite(at) && !Number.isFinite(bt)) return -1;
      if (!Number.isFinite(at) && Number.isFinite(bt)) return 1;
      return String(a.name ?? '').localeCompare(String(b.name ?? ''));
    });
  }, [myEvents]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);

    const payload =
      mode === 'register'
        ? {
            email: email.trim(),
            password,
            username: username.trim(),
            airsoftClub: airsoftClub.trim(),
          }
        : {
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
        <div style={{ display: 'grid', gap: 16, maxWidth: 820 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ opacity: 0.95 }}>Signed in{signedInEmail ? ` as ${signedInEmail}` : ''}.</div>
              <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
                <div>
                  <strong>Username:</strong> {me?.username ? me.username : '—'}
                </div>
                <div>
                  <strong>Airsoft Club:</strong> {me?.airsoftClub ? me.airsoftClub : 'No Club/Freelancer'}
                </div>
                {meError ? <div style={{ color: '#dc3545' }}>Profile error: {meError}</div> : null}
              </div>
            </div>
            <button type="button" onClick={signOut} style={{ whiteSpace: 'nowrap' }}>
              Sign out
            </button>
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ fontWeight: 800 }}>My Events</div>
            {myEventsError ? (
              <div style={{ color: '#dc3545' }}>Error: {myEventsError}</div>
            ) : sortedMyEvents.length === 0 ? (
              <div style={{ opacity: 0.85 }}>No events created yet.</div>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {sortedMyEvents.map(e => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => onOpenEvent?.(e.id)}
                    disabled={!onOpenEvent}
                    aria-disabled={!onOpenEvent}
                    style={{ textAlign: 'left' }}
                  >
                    <div style={{ fontWeight: 700 }}>{e.name}</div>
                    <div style={{ opacity: 0.85, fontSize: 13 }}>
                      {e.date ? formatDateDDMMYYYY(e.date) : 'No date'}
                      {e.location ? ` • ${e.location}` : ''}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ fontWeight: 800 }}>Saved Events</div>
            {savedEventsError ? (
              <div style={{ color: '#dc3545' }}>Error: {savedEventsError}</div>
            ) : sortedSavedEvents.length === 0 ? (
              <div style={{ opacity: 0.85 }}>No saved events yet.</div>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {sortedSavedEvents.map(e => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => onOpenEvent?.(e.id)}
                    disabled={!onOpenEvent}
                    aria-disabled={!onOpenEvent}
                    style={{ textAlign: 'left' }}
                  >
                    <div style={{ fontWeight: 700 }}>{e.name}</div>
                    <div style={{ opacity: 0.85, fontSize: 13 }}>
                      {e.date ? formatDateDDMMYYYY(e.date) : 'No date'}
                      {e.location ? ` • ${e.location}` : ''}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
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
            {mode === 'register' ? (
              <>
                <input
                  name="username"
                  placeholder="Username"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                />
                <input
                  name="airsoftClub"
                  placeholder="Airsoft Club (optional)"
                  value={airsoftClub}
                  onChange={e => setAirsoftClub(e.target.value)}
                />
              </>
            ) : null}

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
        </>
      )}

      {status ? <div style={{ marginTop: 12 }}>{status}</div> : null}
    </div>
  );
};

export default AuthPage;
