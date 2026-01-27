import React, { useEffect, useState } from 'react';
import EventDetailsModal, { type EventForModal } from './EventDetailsModal';

function formatDateDDMMYYYY(value: string) {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return value;

  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

interface Event {
  id: number;
  name: string;
  date?: string;
  location?: string;
  description?: string;
  detailed_description?: string;
  thumbnail?: string;
  category?: string;
  facebook_link?: string;
  lat: number;
  lng: number;
}

type EventsPageProps = {
  onCreateEvent?: () => void;
  onEditEvent?: (id: number) => void;
  onOpenEvent?: (id: number) => void;
  openEventId?: number;
  onCloseEvent?: () => void;
};

const EventsPage: React.FC<EventsPageProps> = ({
  onCreateEvent,
  onEditEvent,
  onOpenEvent,
  openEventId,
  onCloseEvent,
}) => {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);

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

  const filteredEvents =
    categoryFilter === 'All'
      ? events
      : events.filter(e => (e.category ?? 'Skirmish') === categoryFilter);

  const effectiveSelectedEventId =
    typeof openEventId === 'number' && Number.isFinite(openEventId) ? openEventId : selectedEventId;

  const selectedEvent =
    effectiveSelectedEventId == null
      ? null
      : (events.find(e => e.id === effectiveSelectedEventId) as EventForModal | undefined);

  const openEvent = (id: number) => {
    onOpenEvent?.(id);
    if (!onOpenEvent) setSelectedEventId(id);
  };

  const closeEvent = () => {
    onCloseEvent?.();
    if (!onCloseEvent) setSelectedEventId(null);
  };

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h2 style={{ marginTop: 0, marginBottom: 0 }}>Events</h2>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ opacity: 0.9 }}>Category</span>
            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
              <option value="All">All</option>
              <option value="24h">24h</option>
              <option value="12h">12h</option>
              <option value="Skirmish">Skirmish</option>
            </select>
          </label>

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
      </div>
      <div style={{ display: 'grid', gap: 12 }}>
        {filteredEvents.length === 0 ? (
          <div>No events found.</div>
        ) : (
          filteredEvents.map(e => (
            <div
              key={e.id}
              className="eventCard"
              role="button"
              tabIndex={0}
              onClick={() => openEvent(e.id)}
              onKeyDown={ev => {
                if (ev.key === 'Enter' || ev.key === ' ') openEvent(e.id);
              }}
              style={{ cursor: 'pointer' }}
            >
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ fontWeight: 700 }}>{e.name}</div>
                    <span className="eventCategoryBadge">{e.category ?? 'Skirmish'}</span>
                  </div>
                  {e.date && <div>Date: {formatDateDDMMYYYY(e.date)}</div>}
                  {e.location && <div>{e.location}</div>}
                  {e.description && <div>{e.description}</div>}

                  <div style={{ marginTop: 10 }}>
                    <button
                      type="button"
                      onClick={ev => {
                        ev.stopPropagation();
                        onEditEvent?.(e.id);
                      }}
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

      {selectedEvent ? <EventDetailsModal event={selectedEvent} onClose={closeEvent} /> : null}
    </div>
  );
};

export default EventsPage;
