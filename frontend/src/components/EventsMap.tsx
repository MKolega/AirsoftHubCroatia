import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import * as L from 'leaflet';
import axios from 'axios';
import './EventsMap.css';

import assetsManifest from '../assets.r2.json';

type AssetsManifest = Record<string, { key: string; url: string }>;

const assets = assetsManifest as AssetsManifest;

function assetUrl(name: string): string {
  return assets[name]?.url ?? '';
}

function formatDateDDMMYYYY(value: string) {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return value;

  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

function normalizeCategory(value: string | undefined) {
  const v = (value ?? '').trim();
  if (v === '24h' || v === '12h' || v === 'Skirmish') return v;
  return 'Skirmish';
}

function categoryClassSuffix(category: string) {
  return category === '24h' ? '24h' : category === '12h' ? '12h' : 'skirmish';
}

function getCategoryIconUrl(category: string) {
  return category === '24h' ? assetUrl('24h.jpg') : category === '12h' ? assetUrl('12h.jpg') : assetUrl('Skirmish.webp');
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
  description?: string;
  location?: string;
  date?: string;
  lat: number;
  lng: number;
  thumbnail?: string; 
  category?: string;
}

type EventsMapProps = {
  onOpenEvent?: (id: number) => void;
  focusEventId?: number;
  focusToken?: number;
  authToken: string | null;
};

type FocusControllerProps = {
  focusEventId?: number;
  focusToken?: number;
  events: Event[];
  markersRef: React.MutableRefObject<Map<number, L.Marker>>;
  onEnsureVisible: () => void;
};

const FocusEventController: React.FC<FocusControllerProps> = ({
  focusEventId,
  focusToken,
  events,
  markersRef,
  onEnsureVisible,
}) => {
  const map = useMap();

  useEffect(() => {
    if (typeof focusEventId !== 'number' || !Number.isFinite(focusEventId)) return;
    onEnsureVisible();

    const ev = events.find(e => e.id === focusEventId);
    if (!ev) return;

    const currentZoom = map.getZoom();
    const targetZoom = Math.min(Math.max(currentZoom, 10), 11);
    map.flyTo([ev.lat, ev.lng], targetZoom, { animate: true, duration: 0.9 });

    const t = window.setTimeout(() => {
      const marker = markersRef.current.get(focusEventId);
      marker?.openPopup();
      const size = map.getSize();
      const yOffset = Math.round(size.y * 0.14);
      if (Number.isFinite(yOffset) && yOffset !== 0) {
        map.panBy([0, yOffset], { animate: true });
      }
    }, 350);

    return () => window.clearTimeout(t);
    
  }, [focusEventId, focusToken, events, map, markersRef, onEnsureVisible]);

  return null;
};

// Default Leaflet marker fallback
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const EventsMap: React.FC<EventsMapProps> = ({ onOpenEvent, focusEventId, focusToken, authToken }) => {
  const [events, setEvents] = useState<Event[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [categoryFilter, setCategoryFilter] = useState<string>('All');

  const markersRef = useRef<Map<number, L.Marker>>(new Map());

  useEffect(() => {
    const controller = new AbortController();

    queueMicrotask(() => setError(null));

    axios
      .get('/api/events', {
        signal: controller.signal,
        headers: authToken
          ? {
              Accept: 'application/json',
              Authorization: `Bearer ${authToken}`,
            }
          : { Accept: 'application/json' },
      })
      .then(res => setEvents(Array.isArray(res.data) ? res.data : []))
      .catch(err => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : String(err));
      });

    return () => controller.abort();
  }, [authToken]);

  const createCategoryIcon = (categoryRaw?: string) => {
    const category = normalizeCategory(categoryRaw);
    const suffix = categoryClassSuffix(category);

    const iconUrl = getCategoryIconUrl(category);
    const bubbleInner = `<img class="eventMarker__img" src="${iconUrl}" alt="${category}" />`;

	return L.divIcon({
		className: `eventMarker eventMarker--${suffix}`,
	  html: `<div class="eventMarker__pin"><div class="eventMarker__bubble">${bubbleInner}</div></div>`,
      iconSize: [48, 62],
      iconAnchor: [24, 62],
      popupAnchor: [0, -56],
	});
  };

  const upcomingEvents = events.filter(e => !isPastEventDate(e.date));

  const filteredEvents =
    categoryFilter === 'All'
      ? upcomingEvents
      : upcomingEvents.filter(e => (e.category ?? 'Skirmish') === categoryFilter);

  const ensureFocusedEventVisible = useMemo(() => {
    return () => {
      
      setCategoryFilter('All');
    };
  }, []);

  return (
    <div className="eventsMap">
      {error ? <div className="eventsMap__error">Error: {error}</div> : null}

      <div className="eventsMap__panel eventsMap__panel--filter">
        <label className="eventsMap__label">
          <span className="eventsMap__labelText">Category</span>
          <select
            className="eventsMap__select"
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
          >
            <option value="All">All</option>
            <option value="24h">24h</option>
            <option value="12h">12h</option>
            <option value="Skirmish">Skirmish</option>
          </select>
        </label>
      </div>

      <div className="eventsMap__panel eventsMap__panel--legend" aria-label="Map legend">
        <div className="eventsMap__legendTitle">Legend</div>
        <div className="eventsMap__legendGrid">
          <div className="eventsMap__legendRow">
            <img src={getCategoryIconUrl('24h')} alt="24h" className="eventsMap__legendIcon" />
            <span className="eventsMap__legendText">24h</span>
          </div>
          <div className="eventsMap__legendRow">
            <img src={getCategoryIconUrl('12h')} alt="12h" className="eventsMap__legendIcon" />
            <span className="eventsMap__legendText">12h</span>
          </div>
          <div className="eventsMap__legendRow">
            <img src={getCategoryIconUrl('Skirmish')} alt="Skirmish" className="eventsMap__legendIcon" />
            <span className="eventsMap__legendText">Skirmish</span>
          </div>
        </div>
      </div>

      <MapContainer center={[44.7, 16]} zoom={7.5} className="eventsMap__map">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <FocusEventController
          focusEventId={focusEventId}
          focusToken={focusToken}
          events={upcomingEvents}
          markersRef={markersRef}
          onEnsureVisible={ensureFocusedEventVisible}
        />

        {filteredEvents.map(event => {
          const icon = createCategoryIcon(event.category);
          return (
            <Marker
              key={event.id}
              position={[event.lat, event.lng]}
              icon={icon}
              ref={m => {
                if (m) markersRef.current.set(event.id, m);
                else markersRef.current.delete(event.id);
              }}
            >
              <Popup autoPan={false}>
                <div>
                  <button
                    type="button"
                    className="eventsMap__popupTitleBtn"
                    onClick={() => onOpenEvent?.(event.id)}
                    disabled={!onOpenEvent}
                    aria-disabled={!onOpenEvent}
                  >
                    {event.name}
                  </button>
                  <div>Category: {event.category ?? 'Skirmish'}</div>
                  {event.date && <div>Date: {formatDateDDMMYYYY(event.date)}</div>}
                  {event.location && <div>{event.location}</div>}
                  {event.description && <div>{event.description}</div>}
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
};

export default EventsMap;
