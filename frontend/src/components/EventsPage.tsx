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

function getApiErrorMessage(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const rec = value as Record<string, unknown>;
  const err = rec.error;
  return typeof err === 'string' && err.trim() ? err : null;
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
  authToken: string | null;
};

const EventsPage: React.FC<EventsPageProps> = ({
  onCreateEvent,
  onEditEvent,
  onOpenEvent,
  openEventId,
  onCloseEvent,
  authToken,
}) => {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [savedEventIds, setSavedEventIds] = useState<Set<number>>(() => new Set());

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

  useEffect(() => {
    if (!authToken) {
      setSavedEventIds(new Set());
      return;
    }

    const controller = new AbortController();

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
        const list = Array.isArray(data) ? (data as Array<{ id?: number }>) : [];
        const next = new Set<number>();
        for (const item of list) {
          if (typeof item?.id === 'number') next.add(item.id);
        }
        setSavedEventIds(next);
      })
      .catch(() => {
        if (!controller.signal.aborted) setSavedEventIds(new Set());
      });

    return () => controller.abort();
  }, [authToken]);

  const toggleSave = async (eventId: number) => {
    if (!authToken) {
      window.alert('Sign in to Save events');
      return;
    }

    const isSaved = savedEventIds.has(eventId);
    const method = isSaved ? 'DELETE' : 'POST';
    try {
      const res = await fetch(`/api/events/${eventId}/save`, {
        method,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = getApiErrorMessage(data);
        throw new Error(msg ?? `HTTP ${res.status}`);
      }

      setSavedEventIds(prev => {
        const next = new Set(prev);
        if (isSaved) next.delete(eventId);
        else next.add(eventId);
        return next;
      });
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Failed to save event');
    }
  };

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

          {onCreateEvent ? (
            <button type="button" onClick={onCreateEvent} style={{ whiteSpace: 'nowrap' }}>
              Add an Event
            </button>
          ) : null}
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
              <button
                type="button"
                className={
                  savedEventIds.has(e.id)
                    ? 'eventSaveBtn eventSaveBtn--saved'
                    : 'eventSaveBtn'
                }
                title="Save Event"
                aria-label="Save Event"
                onClick={ev => {
                  ev.stopPropagation();
                  void toggleSave(e.id);
                }}
              >
                {savedEventIds.has(e.id) ? '★' : '☆'}
              </button>
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
