import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import * as L from 'leaflet';
import axios from 'axios';

interface Event {
  id: number;
  name: string;
  description?: string;
  location?: string;
  date?: string;
  lat: number;
  lng: number;
  thumbnail?: string; 
}

// Default Leaflet marker fallback
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const EventsMap: React.FC = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    axios.get('/api/events')
      .then(res => setEvents(res.data || []))
      .catch(err => {
        setError(err instanceof Error ? err.message : String(err));
      });
  }, []);

  // Create Leaflet icon
  const createIcon = (thumbnail?: string) => {
    if (!thumbnail) return new L.Icon.Default();

	// Use a DivIcon so we can style the thumbnail (rounded, shadow, border)
	return L.divIcon({
		className: 'eventMarker',
    html: `<div class="eventMarker__pin"><div class="eventMarker__bubble"><img class="eventMarker__img" src="${thumbnail}" alt="" /></div></div>`,
    iconSize: [48, 62],
    iconAnchor: [24, 62],
    popupAnchor: [0, -56],
	});
  };

  // Preload all images to detect broken URLs
  const [loadedThumbnails, setLoadedThumbnails] = useState<Record<number, boolean>>({});
  useEffect(() => {
    events.forEach(e => {
      if (!e.thumbnail) return;
      const img = new Image();
      img.src = e.thumbnail;
      img.onload = () => setLoadedThumbnails(prev => ({ ...prev, [e.id]: true }));
      img.onerror = () => setLoadedThumbnails(prev => ({ ...prev, [e.id]: false }));
    });
  }, [events]);

  return (
    <div style={{ height: '100%', width: '100%' }}>
      {error && <div style={{ color: 'red', padding: 8 }}>Error: {error}</div>}

      <MapContainer center={[45.1, 15.2]} zoom={7} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {events.map(event => {
          // If image failed to load, use default icon
          const icon = loadedThumbnails[event.id] ? createIcon(event.thumbnail) : new L.Icon.Default();
          return (
            <Marker key={event.id} position={[event.lat, event.lng]} icon={icon}>
              <Popup>
                <div>
                  <strong>{event.name}</strong>
                  {event.date && <div>Date: {event.date}</div>}
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
