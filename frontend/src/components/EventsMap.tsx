import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import * as L from 'leaflet';
import axios from 'axios';

import icon24h from '../assets/24h.jpg';
import icon12h from '../assets/12h.jpg';
import iconSkirmish from '../assets/Skirmish.webp';

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
  return category === '24h' ? icon24h : category === '12h' ? icon12h : iconSkirmish;
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
    const targetZoom = Math.min(Math.max(currentZoom, 11), 10);
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

const EventsMap: React.FC<EventsMapProps> = ({ onOpenEvent, focusEventId, focusToken }) => {
  const [events, setEvents] = useState<Event[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [categoryFilter, setCategoryFilter] = useState<string>('All');

  const markersRef = useRef<Map<number, L.Marker>>(new Map());

  useEffect(() => {
    axios.get('/api/events')
      .then(res => setEvents(res.data || []))
      .catch(err => {
        setError(err instanceof Error ? err.message : String(err));
      });
  }, []);

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

  const filteredEvents =
    categoryFilter === 'All'
      ? events
      : events.filter(e => (e.category ?? 'Skirmish') === categoryFilter);

  const ensureFocusedEventVisible = useMemo(() => {
    return () => {
      
      setCategoryFilter('All');
    };
  }, []);

  return (
    <div style={{ height: '100%', width: '100%', position: 'relative' }}>
      {error && <div style={{ color: 'red', padding: 8 }}>Error: {error}</div>}

      <div
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          zIndex: 1000,
          background: 'rgba(0,0,0,0.55)',
          border: '1px solid rgba(255,255,255,0.18)',
          borderRadius: 10,
          padding: '10px 12px',
          backdropFilter: 'blur(6px)',
        }}
      >
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, opacity: 0.9 }}>Category</span>
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
            <option value="All">All</option>
            <option value="24h">24h</option>
            <option value="12h">12h</option>
            <option value="Skirmish">Skirmish</option>
          </select>
        </label>
      </div>

      <MapContainer center={[44.7, 16]} zoom={7.5} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <FocusEventController
          focusEventId={focusEventId}
          focusToken={focusToken}
          events={events}
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
                    onClick={() => onOpenEvent?.(event.id)}
                    disabled={!onOpenEvent}
                    aria-disabled={!onOpenEvent}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      padding: 0,
                      fontWeight: 800,
                      color: 'inherit',
                      textDecoration: 'underline',
                      cursor: onOpenEvent ? 'pointer' : 'default',
                    }}
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
