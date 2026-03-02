import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';

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
  const theme = useTheme();
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
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        px: 3,
        py: 4,
        background: `
          radial-gradient(900px 420px at 15% 10%, ${alpha(theme.palette.primary.main, 0.10)} 0%, transparent 55%),
          radial-gradient(900px 420px at 85% 25%, ${alpha(theme.palette.common.black, 0.04)} 0%, transparent 55%),
          ${theme.palette.background.default}
        `,
      }}
    >
      <Paper
        elevation={0}
        variant="outlined"
        sx={{
          width: '100%',
          maxWidth: 460,
          p: 2.5,
          borderRadius: 3,
          boxShadow: theme.shadows[2],
        }}
      >
        <Stack spacing={1.5}>
          <Typography variant="h5" fontWeight={900} letterSpacing="0.01em">
            Under Maintenance
          </Typography>
          <Typography variant="body2" color="text.secondary">
            The site is temporarily unavailable. Admin access is required.
          </Typography>

          <Box component="form" onSubmit={submit} sx={{ mt: 0.5 }}>
            <Stack spacing={1.25}>
              <TextField
                label="Email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
                required
                size="small"
                fullWidth
                disabled={submitting}
              />
              <TextField
                label="Password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                size="small"
                fullWidth
                disabled={submitting}
              />

              {status ? (
                <Alert severity="error" variant="outlined">
                  {status}
                </Alert>
              ) : null}

              <Button type="submit" variant="contained" fullWidth disabled={submitting}>
                {submitting ? 'Signing in…' : 'Admin login'}
              </Button>
            </Stack>
          </Box>

          <Typography variant="caption" color="text.secondary">
            If you’re the admin, sign in to access the site.
          </Typography>
        </Stack>
      </Paper>
    </Box>
  );
};

export default MaintenancePage;
