import React, { useEffect, useState } from 'react'
import './App.css'
import EventsMap from './components/EventsMap';

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

type Page = 'map' | 'events'

function App() {
  const [page, setPage] = useState<Page>(() =>
    window.location.pathname.startsWith('/events') ? 'events' : 'map'
  )
  const [events, setEvents] = useState<Array<{ id: number; name: string; date?: string; location?: string; description?: string }>>([])
  const [eventsError, setEventsError] = useState<string | null>(null)
  const [eventsLoading, setEventsLoading] = useState(false)

  useEffect(() => {
    const onPopState = () => setPage(window.location.pathname.startsWith('/events') ? 'events' : 'map')
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const navigate = (to: Page) => {
    const path = to === 'events' ? '/events' : '/'
    window.history.pushState({}, '', path)
    setPage(to)
  }

  useEffect(() => {
    if (page !== 'events') return
    setEventsLoading(true)
    setEventsError(null)

    fetch('/api/events')
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(data => setEvents(Array.isArray(data) ? data : []))
      .catch(err => setEventsError(err instanceof Error ? err.message : String(err)))
      .finally(() => setEventsLoading(false))
  }, [page])

  return (
    <ErrorBoundary>
      <div className="appLayout">
        <aside className="sidebar">
          <div className="sidebar__section">
            <div className="sidebar__title">Navigation</div>
            <button className="sidebar__btn" onClick={() => navigate('events')}>Events</button>
            <button className="sidebar__btn" onClick={() => navigate('map')}>Map</button>
          </div>
        </aside>

        <main className="content">
          {page === 'map' && <EventsMap />}

          {page === 'events' && (
            <div className="page">
              <h2 style={{ marginTop: 0 }}>Events</h2>

              {eventsLoading && <div>Loading…</div>}
              {eventsError && <div style={{ color: '#dc3545' }}>Error: {eventsError}</div>}

              {!eventsLoading && !eventsError && (
                <div style={{ display: 'grid', gap: 12 }}>
                  {events.length === 0 ? (
                    <div>No events found.</div>
                  ) : (
                    events.map(e => (
                      <div key={e.id} className="eventCard">
                        <div style={{ fontWeight: 700 }}>{e.name}</div>
                        {e.date && <div>Date: {e.date}</div>}
                        {e.location && <div>{e.location}</div>}
                        {e.description && <div>{e.description}</div>}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </ErrorBoundary>
  );
}

export default App
