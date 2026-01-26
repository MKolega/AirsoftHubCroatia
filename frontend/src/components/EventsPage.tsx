import React, { useEffect, useState } from 'react';

interface Event {
  id: number;
  name: string;
  date?: string;
  location?: string;
  description?: string;
  thumbnail?: string;
}

type EventsPageProps = {
  onCreateEvent?: () => void;
  onEditEvent?: (id: number) => void;
};

const EventsPage: React.FC<EventsPageProps> = ({ onCreateEvent, onEditEvent }) => {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetch('/api/events', { signal: controller.signal })
      .then(async res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => setEvents(Array.isArray(data) ? data : []))
      .catch(err => {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, []);

  if (loading) return <div>Loading…</div>;
  if (error) return <div style={{ color: '#dc3545' }}>Error: {error}</div>;

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h2 style={{ marginTop: 0, marginBottom: 0 }}>Events</h2>
        <button
          type="button"
          onClick={onCreateEvent}
          disabled={!onCreateEvent}
          aria-disabled={!onCreateEvent}
          style={{ whiteSpace: 'nowrap' }}
        >
          Create Event
        </button>
      </div>
      <div style={{ display: 'grid', gap: 12 }}>
        {events.length === 0 ? (
          <div>No events found.</div>
        ) : (
          events.map(e => (
            <div key={e.id} className="eventCard">
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                {e.thumbnail ? (
                  <img
                    src={e.thumbnail}
                    alt={`${e.name} thumbnail`}
                    style={{
                      width: 72,
                      height: 72,
                      objectFit: 'cover',
                      borderRadius: 10,
                      border: '1px solid rgba(255,255,255,0.12)',
                      flex: '0 0 auto',
                    }}
                    loading="lazy"
                  />
                ) : (
                  <div
                    style={{
                      width: 72,
                      height: 72,
                      borderRadius: 10,
                      border: '1px solid rgba(255,255,255,0.08)',
                      background: 'rgba(255,255,255,0.03)',
                      flex: '0 0 auto',
                    }}
                  />
                )}

                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>{e.name}</div>
                  {e.date && <div>Date: {e.date}</div>}
                  {e.location && <div>{e.location}</div>}
                  {e.description && <div>{e.description}</div>}

                  <div style={{ marginTop: 10 }}>
                    <button
                      type="button"
                      onClick={() => onEditEvent?.(e.id)}
                      disabled={!onEditEvent}
                      aria-disabled={!onEditEvent}
                    >
                      Modify
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default EventsPage;
