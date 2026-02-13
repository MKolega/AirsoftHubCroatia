import React, { useState, useEffect } from 'react';
import './App.css';
import EventsMap from './components/EventsMap';
import EventsPage from './components/EventsPage'; // new file
import AdminCreateEvent from './components/CreateEvent';
import EditEvent from './components/EditEvent';
import AuthPage from './components/AuthPage';

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
  const [route, setRoute] = useState<Route>(() => getRouteFromPath(window.location.pathname));

  const [auth, setAuth] = useState<{ token: string | null; email: string | null }>(() => ({
    token: window.localStorage.getItem('authToken'),
    email: window.localStorage.getItem('authEmail'),
  }));

  const [mapFocus, setMapFocus] = useState<{ eventId: number; token: number } | null>(null);

  const [sidebarEvents, setSidebarEvents] = useState<EventForSidebar[]>([]);
  const [sidebarError, setSidebarError] = useState<string | null>(null);

  
  useEffect(() => {
    const onPopState = () => {
      setRoute(getRouteFromPath(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    fetch('/api/events', { signal: controller.signal })
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
      })
      .catch(err => {
        if (!controller.signal.aborted) {
          setSidebarError(err instanceof Error ? err.message : String(err));
        }
      });

    return () => controller.abort();
  }, []);

  const sortedSidebarEvents = React.useMemo(() => {
    return [...sidebarEvents].sort((a, b) => {
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
      <div className="appLayout">
        <header className="topbar">
          <div className="topbar__inner">
            <div className="topbar__title">Airsoft Hub Croatia</div>
            <nav className="topbar__nav" aria-label="Main navigation">
              <button
                type="button"
                className="topbar__btn"
                onClick={() => navigate('map')}
                aria-current={route.page === 'map' ? 'page' : undefined}
              >
                Map
              </button>
              <button
                type="button"
                className="topbar__btn"
                onClick={() => navigate('events')}
                aria-current={route.page === 'events' || route.page === 'event-detail' ? 'page' : undefined}
              >
                Events
              </button>
            </nav>

            <div className="topbar__right">
              <button
                type="button"
                className="topbar__btn"
                onClick={() => navigate('auth')}
                aria-current={route.page === 'auth' ? 'page' : undefined}
              >
                {isSignedIn ? 'Account' : 'Sign in'}
              </button>
            </div>
          </div>
        </header>

        <div className="appBody">
          <aside className="sidebar" aria-label="Upcoming events">
            <div className="sidebar__section">
              <div className="sidebar__title">Upcoming events</div>
              {sidebarError ? (
                <div className="sidebar__meta">Error: {sidebarError}</div>
              ) : sortedSidebarEvents.length === 0 ? (
                <div className="sidebar__meta">No events.</div>
              ) : (
                <div className="eventsMiniList">
                  {sortedSidebarEvents.map(e => (
                    <button
                      key={e.id}
                      type="button"
                      className="eventsMiniList__item"
                      onClick={() => focusEventOnMap(e.id)}
                      aria-label={`Show on map: ${e.name}`}
                    >
                      <div className="eventsMiniList__name">{e.name}</div>
                      <div className="eventsMiniList__tagRow">
                        <span className="eventCategoryBadge">{(e.category ?? 'Skirmish').trim() || 'Skirmish'}</span>
                      </div>
                      <div className="eventsMiniList__meta">
                        {e.date ? formatDateDDMMYYYY(e.date) : 'No date'}
                        {e.location ? ` • ${e.location}` : ''}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </aside>

          <main className="content">
            {route.page === 'map' && (
              <EventsMap
                onOpenEvent={navigateEvent}
                focusEventId={mapFocus?.eventId}
                focusToken={mapFocus?.token}
              />
            )}
            {route.page === 'events' && (
              <EventsPage
                onCreateEvent={isSignedIn ? () => navigate('create-event') : undefined}
                onEditEvent={id => navigateEdit(id)}
                onOpenEvent={id => navigateEvent(id)}
                authToken={auth.token}
              />
            )}
            {route.page === 'event-detail' && (
              <EventsPage
                onCreateEvent={isSignedIn ? () => navigate('create-event') : undefined}
                onEditEvent={id => navigateEdit(id)}
                onOpenEvent={id => navigateEvent(id)}
                openEventId={route.eventId}
                onCloseEvent={() => navigate('events')}
                authToken={auth.token}
              />
            )}
            {route.page === 'create-event' && <AdminCreateEvent authToken={auth.token} />}
            {route.page === 'edit-event' && (
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
          </main>
        </div>
      </div>
    </ErrorBoundary>
  );
}

export default App;
