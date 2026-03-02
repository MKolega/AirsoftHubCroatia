import React, { useState, useEffect, useRef } from 'react';
import {
  Alert,
  AppBar,
  Box,
  Button,
  Divider,
  Drawer,
  List,
  ListItemButton,
  ListItemText,
  Snackbar,
  Toolbar,
  Typography,
} from '@mui/material';
import './App.css';
import EventsMap from './components/EventsMap';
import EventsPage from './components/EventsPage'; // new file
import AdminCreateEvent from './components/CreateEvent';
import EditEvent from './components/EditEvent';
import AuthPage from './components/AuthPage';
import MaintenancePage from './components/MaintenancePage';

type EventForSidebar = {
  id: number;
  name: string;
  date?: string;
  location?: string;
  category?: string;
};

function formatDateDDMMYYYY(value: string) {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return value;

  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

function toDateSortKey(value: string | undefined) {
  if (!value) return Number.POSITIVE_INFINITY;
  const d = new Date(value);
  const t = d.getTime();
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
}

function parseLocalDateOnly(value: string): Date | null {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const yyyy = Number(m[1]);
    const mm = Number(m[2]);
    const dd = Number(m[3]);
    if (Number.isFinite(yyyy) && Number.isFinite(mm) && Number.isFinite(dd)) {
      return new Date(yyyy, mm - 1, dd);
    }
  }

  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isPastEventDate(value: string | undefined): boolean {
  if (!value) return false;
  const eventDay = parseLocalDateOnly(value);
  if (!eventDay) return false;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return eventDay.getTime() < todayStart.getTime();
}

function parseEventForSidebar(value: unknown): EventForSidebar | null {
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;

  const id = obj.id;
  const name = obj.name;
  if (typeof id !== 'number' || typeof name !== 'string') return null;

  const date = typeof obj.date === 'string' ? obj.date : undefined;
  const location = typeof obj.location === 'string' ? obj.location : undefined;
  const category = typeof obj.category === 'string' ? obj.category : undefined;
  return { id, name, date, location, category };
}

class ErrorBoundary extends React.Component<React.PropsWithChildren, { error: unknown }> {
  state = { error: null as unknown };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  override render() {
    if (this.state.error) {
      const message =
        this.state.error instanceof Error ? this.state.error.message : String(this.state.error);

      return (
        <pre style={{ padding: 16, whiteSpace: 'pre-wrap' }}>
          Frontend crashed:
          {'\n'}
          {message}
        </pre>
      );
    }
    return this.props.children;
  }
}

type Page = 'map' | 'events' | 'create-event' | 'edit-event' | 'auth';

type Route =
  | { page: 'map' }
  | { page: 'events' }
  | { page: 'event-detail'; eventId: number }
  | { page: 'create-event' }
  | { page: 'edit-event'; eventId: number }
  | { page: 'auth' };

function getRouteFromPath(pathname: string): Route {
  const editMatch = pathname.match(/^\/events\/(\d+)\/edit/);
  if (editMatch) return { page: 'edit-event', eventId: Number.parseInt(editMatch[1]!, 10) };
  if (pathname.startsWith('/auth')) return { page: 'auth' };
  if (pathname.startsWith('/events/create')) return { page: 'create-event' };
  const detailMatch = pathname.match(/^\/events\/(\d+)\/?$/);
  if (detailMatch) return { page: 'event-detail', eventId: Number.parseInt(detailMatch[1]!, 10) };
  if (pathname.startsWith('/events')) return { page: 'events' };
  return { page: 'map' };
}

function App() {
  const drawerWidth = 260;
  const topbarHeight = 64;

  const [route, setRoute] = useState<Route>(() => getRouteFromPath(window.location.pathname));

  const [auth, setAuth] = useState<{ token: string | null; email: string | null }>(() => ({
    token: window.localStorage.getItem('authToken'),
    email: window.localStorage.getItem('authEmail'),
  }));

  const [mapFocus, setMapFocus] = useState<{ eventId: number; token: number } | null>(null);

  const [sidebarEvents, setSidebarEvents] = useState<EventForSidebar[]>([]);
  const [sidebarError, setSidebarError] = useState<string | null>(null);

  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const lastDeniedEditRef = useRef<number | null>(null);

  const [meIsAdmin, setMeIsAdmin] = useState(false);
  const [meChecked, setMeChecked] = useState(false);

  const [maintenanceEnabled, setMaintenanceEnabled] = useState(false);
  const [maintenanceChecked, setMaintenanceChecked] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/maintenance', { signal: controller.signal, headers: { Accept: 'application/json' } })
      .then(async res => {
        const data = (await res.json().catch(() => ({}))) as { enabled?: boolean };
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setMaintenanceEnabled(Boolean(data?.enabled));
      })
      .catch(() => {
        if (!controller.signal.aborted) setMaintenanceEnabled(false);
      })
      .finally(() => {
        if (!controller.signal.aborted) setMaintenanceChecked(true);
      });
    return () => controller.abort();
  }, []);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 5000);
  };

  useEffect(() => {
    if (!auth.token) {
      queueMicrotask(() => {
        setMeIsAdmin(false);
        setMeChecked(true);
      });
      return;
    }

    const controller = new AbortController();
    queueMicrotask(() => setMeChecked(false));

    fetch('/api/auth/me', {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${auth.token}`,
      },
    })
      .then(async res => {
        const data = (await res.json().catch(() => ({}))) as { is_admin?: boolean };
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setMeIsAdmin(Boolean(data?.is_admin));
      })
      .catch(() => {
        if (!controller.signal.aborted) setMeIsAdmin(false);
      })
      .finally(() => {
        if (!controller.signal.aborted) setMeChecked(true);
      });

    return () => controller.abort();
  }, [auth.token]);

  
  useEffect(() => {
    const onPopState = () => {
      setRoute(getRouteFromPath(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    // In maintenance mode the API is admin-only; avoid spamming 503s before login.
    if (maintenanceChecked && maintenanceEnabled && !auth.token) {
      return () => controller.abort();
    }

    fetch('/api/events', {
      signal: controller.signal,
      headers: auth.token
        ? { Authorization: `Bearer ${auth.token}` }
        : undefined,
    })
      .then(async res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: unknown) => {
        const list = Array.isArray(data) ? data : [];
        const next = list
          .map(parseEventForSidebar)
          .filter(Boolean) as EventForSidebar[];
        setSidebarEvents(next);
        setSidebarError(null);
      })
      .catch(err => {
        if (!controller.signal.aborted) {
          setSidebarError(err instanceof Error ? err.message : String(err));
        }
      });

    return () => controller.abort();
  }, [auth.token, maintenanceChecked, maintenanceEnabled]);

  const sortedSidebarEvents = React.useMemo(() => {
    const upcoming = sidebarEvents.filter(e => !isPastEventDate(e.date));
    return [...upcoming].sort((a, b) => {
      const at = toDateSortKey(a.date);
      const bt = toDateSortKey(b.date);
      if (at !== bt) return at - bt;
      return a.name.localeCompare(b.name);
    });
  }, [sidebarEvents]);

  const navigate = (to: Page) => {
    const path =
      to === 'events'
        ? '/events'
        : to === 'create-event'
          ? '/events/create'
          : to === 'auth'
            ? '/auth'
            : to === 'map'
              ? '/'
              : '/events';
    window.history.pushState({}, '', path);
    setRoute(getRouteFromPath(path));
  };

  const isSignedIn = Boolean(auth.token);

  useEffect(() => {
    // Avoid redirect/toast side-effects while the app is gated by maintenance mode.
    if (!maintenanceChecked) return;
    if (maintenanceEnabled) return;

    if (route.page !== 'edit-event') return;
    if (!meChecked) return;
    if (meIsAdmin) return;

    const deniedEventId = route.eventId;

    queueMicrotask(() => {
      if (lastDeniedEditRef.current !== deniedEventId) {
        lastDeniedEditRef.current = deniedEventId;
        showToast('error', 'Admin only');
      }

      window.history.replaceState({}, '', '/events');
      setRoute(getRouteFromPath('/events'));
    });
  }, [route, meChecked, meIsAdmin, maintenanceChecked, maintenanceEnabled]);

  if (!maintenanceChecked) {
    return (
      <pre style={{ padding: 16, whiteSpace: 'pre-wrap' }}>
        Loading…
      </pre>
    );
  }

  if (maintenanceEnabled) {
    if (!auth.token) {
      return (
        <ErrorBoundary>
          <MaintenancePage
            onAuthUpdate={(token, email) => {
              if (token) window.localStorage.setItem('authToken', token);
              else window.localStorage.removeItem('authToken');
              if (email) window.localStorage.setItem('authEmail', email);
              else window.localStorage.removeItem('authEmail');
              setAuth({ token, email });
            }}
          />
        </ErrorBoundary>
      );
    }

  
    if (!meChecked) {
      return (
        <pre style={{ padding: 16, whiteSpace: 'pre-wrap' }}>
          Checking admin access…
        </pre>
      );
    }

    if (!meIsAdmin) {
      return (
        <ErrorBoundary>
          <MaintenancePage
            onAuthUpdate={(token, email) => {
              if (token) window.localStorage.setItem('authToken', token);
              else window.localStorage.removeItem('authToken');
              if (email) window.localStorage.setItem('authEmail', email);
              else window.localStorage.removeItem('authEmail');
              setAuth({ token, email });
            }}
          />
        </ErrorBoundary>
      );
    }
  }

  const navigateEvent = (eventId: number) => {
    const path = `/events/${eventId}`;
    window.history.pushState({}, '', path);
    setRoute({ page: 'event-detail', eventId });
  };

  const navigateEdit = (eventId: number) => {
    const path = `/events/${eventId}/edit`;
    window.history.pushState({}, '', path);
    setRoute({ page: 'edit-event', eventId });
  };

  const focusEventOnMap = (eventId: number) => {
    navigate('map');
    setMapFocus(prev => ({ eventId, token: (prev?.token ?? 0) + 1 }));
  };

  return (
    <ErrorBoundary>
      <Box sx={{ height: '100vh', display: 'flex' }}>
        <Snackbar
          open={Boolean(toast)}
          anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
          onClose={() => setToast(null)}
        >
          {toast ? (
            <Alert
              onClose={() => setToast(null)}
              severity={toast.type === 'success' ? 'success' : 'error'}
              variant="filled"
              sx={{ fontWeight: 800 }}
            >
              {toast.message}
            </Alert>
          ) : undefined}
        </Snackbar>

        <AppBar
          position="fixed"
          color="primary"
          elevation={0}
          sx={{ width: `calc(100% - ${drawerWidth}px)`, ml: `${drawerWidth}px` }}
        >
          <Toolbar
            disableGutters
            sx={{
              minHeight: topbarHeight,
              px: 2,
              alignItems: 'stretch',
              display: 'grid',
              gridTemplateColumns: '1fr auto 1fr',
            }}
          >
            <Box />

            <Box component="nav" aria-label="Main navigation" sx={{ display: 'flex', alignItems: 'stretch' }}>
              <Button
                onClick={() => navigate('map')}
                color="inherit"
                sx={{
                  height: '100%',
                  borderRadius: 0,
                  px: 3.5,
                  borderLeft: '1px solid rgba(0, 0, 0, 0.45)',
                  borderRight: '1px solid rgba(0, 0, 0, 0.45)',
                  bgcolor: route.page === 'map' ? 'rgba(0,0,0,0.18)' : 'primary.main',
                  '&:hover': { bgcolor: 'primary.dark' },
                }}
              >
                Map
              </Button>
              <Button
                onClick={() => navigate('events')}
                color="inherit"
                sx={{
                  height: '100%',
                  borderRadius: 0,
                  px: 3.5,
                  borderLeft: '1px solid rgba(0, 0, 0, 0.45)',
                  borderRight: '1px solid rgba(0, 0, 0, 0.45)',
                  bgcolor:
                    route.page === 'events' || route.page === 'event-detail' ? 'rgba(0,0,0,0.18)' : 'primary.main',
                  '&:hover': { bgcolor: 'primary.dark' },
                }}
              >
                Events
              </Button>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
              <Button
                onClick={() => navigate('auth')}
                variant={route.page === 'auth' ? 'contained' : 'outlined'}
                color={route.page === 'auth' ? 'secondary' : 'inherit'}
                sx={{
                  borderColor: 'rgba(255,255,255,0.55)',
                  color: '#fff',
                  '&:hover': {
                    borderColor: 'rgba(255,255,255,0.75)',
                    bgcolor: 'rgba(255,255,255,0.08)',
                  },
                }}
              >
                {isSignedIn ? 'Account' : 'Sign in'}
              </Button>
            </Box>
          </Toolbar>
        </AppBar>

        <Drawer
          variant="permanent"
          sx={{
            width: drawerWidth,
            flexShrink: 0,
            '& .MuiDrawer-paper': {
              width: drawerWidth,
              boxSizing: 'border-box',
              bgcolor: 'background.default',
              color: 'text.primary',
              borderRight: '1px solid',
              borderColor: 'divider',
            },
          }}
        >
          <Box
            sx={{
              height: topbarHeight,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              px: 1.5,
              borderBottom: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Typography
              variant="subtitle1"
              sx={{ fontWeight: 900, letterSpacing: '0.02em', color: 'primary.main' }}
              noWrap
            >
              Airsoft Hub Croatia
            </Typography>
          </Box>

          <Box sx={{ p: 1.5, pt: 1.25 }}>
            <Typography
              variant="overline"
              sx={{ color: 'text.secondary', letterSpacing: '0.08em', fontWeight: 900 , alignItems: 'center',
              justifyContent: 'center', display: 'flex', gap: 0.5}}
            >
              Upcoming events
            </Typography>
            <Divider sx={{ my: 1.25 }} />

            {sidebarError ? (
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                Error: {sidebarError}
              </Typography>
            ) : sortedSidebarEvents.length === 0 ? (
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                No events.
              </Typography>
            ) : (
              <List disablePadding sx={{ display: 'grid', gap: 1 }}>
                {sortedSidebarEvents.map(e => (
                  <ListItemButton
                    key={e.id}
                    onClick={() => focusEventOnMap(e.id)}
                    sx={{
                      borderRadius: 2,
                      bgcolor: 'background.paper',
                      color: 'text.primary',
                      border: '1px solid rgba(17, 24, 39, 0.12)',
                      '&:hover': { bgcolor: 'action.hover' },
                    }}
                  >
                    <ListItemText
                      primary={e.name}
                      secondary={`${e.date ? formatDateDDMMYYYY(e.date) : 'No date'}${e.location ? ` • ${e.location}` : ''}`}
                      primaryTypographyProps={{ noWrap: true, fontWeight: 800 }}
                      secondaryTypographyProps={{ noWrap: true }}
                    />
                  </ListItemButton>
                ))}
              </List>
            )}
          </Box>
        </Drawer>

        <Box component="main" className="content" sx={{ flex: 1, minWidth: 0, minHeight: 0 }}>
          <Box sx={{ height: topbarHeight }} />
          <Box sx={{ height: `calc(100vh - ${topbarHeight}px)`, minHeight: 0 }}>
            {route.page === 'map' && (
              <EventsMap
                onOpenEvent={navigateEvent}
                focusEventId={mapFocus?.eventId}
                focusToken={mapFocus?.token}
                authToken={auth.token}
              />
            )}
            {route.page === 'events' && (
              <EventsPage
                onCreateEvent={isSignedIn ? () => navigate('create-event') : undefined}
                onEditEvent={meIsAdmin ? id => navigateEdit(id) : undefined}
                onOpenEvent={id => navigateEvent(id)}
                authToken={auth.token}
              />
            )}
            {route.page === 'event-detail' && (
              <EventsPage
                onCreateEvent={isSignedIn ? () => navigate('create-event') : undefined}
                onEditEvent={meIsAdmin ? id => navigateEdit(id) : undefined}
                onOpenEvent={id => navigateEvent(id)}
                openEventId={route.eventId}
                onCloseEvent={() => navigate('events')}
                authToken={auth.token}
              />
            )}
            {route.page === 'create-event' && (
              <AdminCreateEvent
                authToken={auth.token}
                onDone={() => navigate('events')}
                onNotify={(type, message) => showToast(type, message)}
              />
            )}
            {route.page === 'edit-event' && meIsAdmin && (
              <EditEvent eventId={route.eventId} authToken={auth.token} onDone={() => navigate('events')} />
            )}
            {route.page === 'auth' && (
              <AuthPage
                signedIn={isSignedIn}
                signedInEmail={auth.email}
                authToken={auth.token}
                onOpenEvent={navigateEvent}
                onAuthUpdate={(token, email) => {
                  if (token) window.localStorage.setItem('authToken', token);
                  else window.localStorage.removeItem('authToken');
                  if (email) window.localStorage.setItem('authEmail', email);
                  else window.localStorage.removeItem('authEmail');
                  setAuth({ token, email });
                }}
                onDone={() => navigate('map')}
              />
            )}
          </Box>
        </Box>
      </Box>
    </ErrorBoundary>
  );
}

export default App;
