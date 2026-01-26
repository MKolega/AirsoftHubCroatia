import React, { useState, useEffect } from 'react';
import './App.css';
import EventsMap from './components/EventsMap';
import EventsPage from './components/EventsPage'; // new file
import AdminCreateEvent from './components/CreateEvent';
import EditEvent from './components/EditEvent';

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

type Page = 'map' | 'events' | 'create-event' | 'edit-event';

type Route =
  | { page: 'map' }
  | { page: 'events' }
  | { page: 'create-event' }
  | { page: 'edit-event'; eventId: number };

function getRouteFromPath(pathname: string): Route {
  const editMatch = pathname.match(/^\/events\/(\d+)\/edit/);
  if (editMatch) return { page: 'edit-event', eventId: Number.parseInt(editMatch[1]!, 10) };
  if (pathname.startsWith('/events/create')) return { page: 'create-event' };
  if (pathname.startsWith('/events')) return { page: 'events' };
  return { page: 'map' };
}

function App() {
  const [route, setRoute] = useState<Route>(() => getRouteFromPath(window.location.pathname));

  
  useEffect(() => {
    const onPopState = () => {
      setRoute(getRouteFromPath(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = (to: Page) => {
    const path =
      to === 'events' ? '/events' : to === 'create-event' ? '/events/create' : to === 'map' ? '/' : '/events';
    window.history.pushState({}, '', path);
    setRoute(getRouteFromPath(path));
  };

  const navigateEdit = (eventId: number) => {
    const path = `/events/${eventId}/edit`;
    window.history.pushState({}, '', path);
    setRoute({ page: 'edit-event', eventId });
  };

  return (
    <ErrorBoundary>
      <div className="appLayout">
        <aside className="sidebar">
          <div className="sidebar__section">
            <div className="sidebar__title">Navigation</div>
            <button className="sidebar__btn" onClick={() => navigate('events')}>
              Events
            </button>
            <button className="sidebar__btn" onClick={() => navigate('map')}>
              Map
            </button>
          </div>
        </aside>

        <main className="content">
          {route.page === 'map' && <EventsMap />}
          {route.page === 'events' && (
            <EventsPage
              onCreateEvent={() => navigate('create-event')}
              onEditEvent={id => navigateEdit(id)}
            />
          )}
          {route.page === 'create-event' && <AdminCreateEvent />}
          {route.page === 'edit-event' && (
            <EditEvent eventId={route.eventId} onDone={() => navigate('events')} />
          )}
        </main>
      </div>
    </ErrorBoundary>
  );
}

export default App;
