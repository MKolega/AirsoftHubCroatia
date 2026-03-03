import React, { useEffect, useState } from 'react';
import { useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import EventDetailsModal, { type EventForModal } from './EventDetailsModal';
import './EventsPage.css';

import assetsManifest from '../assets.r2.json';

type AssetsManifest = Record<string, { key: string; url: string }>;

const assets = assetsManifest as AssetsManifest;

function assetUrl(name: string): string {
  return assets[name]?.url ?? '';
}

function normalizeCategory(value: string | undefined) {
  const v = (value ?? '').trim();
  if (v === '24h' || v === '12h' || v === 'Skirmish') return v;
  return 'Skirmish';
}

function getCategoryIconUrl(categoryRaw: string | undefined) {
  const category = normalizeCategory(categoryRaw);
  return category === '24h'
    ? assetUrl('24h.jpg')
    : category === '12h'
      ? assetUrl('12h.jpg')
      : assetUrl('Skirmish.webp');
}

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

function normalizeText(value: string) {
  return value
    .trim()
    .replace(/\u00A0/g, ' ')
    .replace(/\u200B/g, ' ')
    .replace(/\u200C/g, ' ')
    .replace(/\u200D/g, ' ')
    .replace(/\uFEFF/g, ' ')
    .trim();
}

function truncateToCharCount(text: string, maxChars: number) {
  const trimmed = normalizeText(text);
  if (!trimmed) return { preview: '', truncated: false };
  if (maxChars <= 0) return { preview: '', truncated: true };

  const chars = Array.from(trimmed);
  if (chars.length <= maxChars) return { preview: trimmed, truncated: false };

  let preview = chars.slice(0, maxChars).join('').trimEnd();
  const lastSpace = preview.lastIndexOf(' ');
  if (lastSpace >= Math.floor(maxChars * 0.55)) {
    preview = preview.slice(0, lastSpace).trimEnd();
  }

  return { preview, truncated: true };
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
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const descriptionMaxChars = isMobile ? 100 : 400;

  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [savedEventIds, setSavedEventIds] = useState<Set<number>>(() => new Set());

  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    queueMicrotask(() => {
      setLoading(true);
      setError(null);
    });

    fetch('/api/events', {
      signal: controller.signal,
      headers: authToken
        ? {
            Accept: 'application/json',
            Authorization: `Bearer ${authToken}`,
          }
        : { Accept: 'application/json' },
    })
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
  }, [authToken]);

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
  if (error) return <div className="eventsPage__error">Error: {error}</div>;

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

  const upcomingEvents: Event[] = [];
  const pastEvents: Event[] = [];
  for (const e of filteredEvents) {
    if (isPastEventDate(e.date)) pastEvents.push(e);
    else upcomingEvents.push(e);
  }

  const renderEventCard = (e: Event) => (
    <div
      key={e.id}
      className="eventCard eventsPage__card"
      role="button"
      tabIndex={0}
      onClick={() => openEvent(e.id)}
      onKeyDown={ev => {
        if (ev.key === 'Enter' || ev.key === ' ') openEvent(e.id);
      }}
    >
      <button
        type="button"
        className={savedEventIds.has(e.id) ? 'eventSaveBtn eventSaveBtn--saved' : 'eventSaveBtn'}
        title="Save Event"
        aria-label="Save Event"
        onClick={ev => {
          ev.stopPropagation();
          void toggleSave(e.id);
        }}
      >
        {savedEventIds.has(e.id) ? '★' : '☆'}
      </button>
      <div className="eventsPage__cardInner">
        {e.thumbnail ? (
          <img
            src={e.thumbnail}
            alt={`${e.name} thumbnail`}
            className="eventsPage__thumb"
            loading="lazy"
          />
        ) : (
          <img
            src={getCategoryIconUrl(e.category)}
            alt={`${normalizeCategory(e.category)} category`}
            className="eventsPage__thumb eventsPage__thumb--category"
            loading="lazy"
          />
        )}

        <div className="eventsPage__text">
          <div className="eventsPage__nameRow">
            <div className="eventsPage__name">{e.name}</div>
            <span className="eventCategoryBadge">{e.category ?? 'Skirmish'}</span>
          </div>
          {e.date && <div>Date: {formatDateDDMMYYYY(e.date)}</div>}
          {e.location && <div>{e.location}</div>}
          {(() => {
            const short = (e.description ?? '').trim();
            if (short) {
              const { preview, truncated } = truncateToCharCount(short, descriptionMaxChars);
              return <div>{preview}{truncated ? '…' : ''}</div>;
            }
            const detailed = (e.detailed_description ?? '').trim();
            if (!detailed) return null;
            const { preview, truncated } = truncateToCharCount(detailed, descriptionMaxChars);
            return <div>{preview}{truncated ? '…' : ''}</div>;
          })()}

          {onEditEvent ? (
            <div className="eventsPage__actions">
              <button
                type="button"
                onClick={ev => {
                  ev.stopPropagation();
                  onEditEvent(e.id);
                }}
              >
                Modify
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );

  return (
    <div className="page">
      <div className="eventsPage__header">
        <h2 className="eventsPage__title">Events</h2>

        <div className="eventsPage__controls">
          <label className="eventsPage__categoryLabel">
            <span className="eventsPage__categoryText">Category</span>
            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
              <option value="All">All</option>
              <option value="24h">24h</option>
              <option value="12h">12h</option>
              <option value="Skirmish">Skirmish</option>
            </select>
          </label>

          {onCreateEvent ? (
            <button type="button" onClick={onCreateEvent} className="eventsPage__createBtn">
              Add an Event
            </button>
          ) : null}
        </div>
      </div>

      <div className="eventsPage__section">
        <div className="eventsPage__sectionTitle">Upcoming Events</div>
        <div className="eventsPage__list">
          {upcomingEvents.length === 0 ? (
            <div>No upcoming events found.</div>
          ) : (
            upcomingEvents.map(renderEventCard)
          )}
        </div>
      </div>

      <div className="eventsPage__section eventsPage__section--past">
        <div className="eventsPage__sectionTitle">Past Events</div>
        <div className="eventsPage__list">
          {pastEvents.length === 0 ? <div>No past events.</div> : pastEvents.map(renderEventCard)}
        </div>
      </div>

      {selectedEvent ? <EventDetailsModal event={selectedEvent} onClose={closeEvent} /> : null}
    </div>
  );
};

export default EventsPage;
