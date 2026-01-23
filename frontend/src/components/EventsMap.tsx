import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, GeoJSON, useMap } from 'react-leaflet';
import * as L from 'leaflet';
import axios from 'axios';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface Event {
  id: number;
  name: string;
  description?: string;
  location?: string;
  date?: string;
  lat: number;
  lng: number;
}

type CountriesGeoJSON = GeoJSON.FeatureCollection<GeoJSON.Geometry, Record<string, unknown>>;

const eventIcon = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const CROATIA_ISO3 = 'HRV';
const NEIGHBOR_ISO3 = new Set(['SVN', 'HUN', 'SRB', 'BIH', 'MNE']); // add 'ITA' if you want

function FitToBounds({ bounds }: { bounds: L.LatLngBounds | null }) {
  const map = useMap();
  const lastFitted = useRef<string | null>(null);

  useEffect(() => {
    if (!bounds) return;

    const key = bounds.toBBoxString();
    if (lastFitted.current === key) return; // avoid repeated fits (e.g. React StrictMode)
    lastFitted.current = key;

    map.fitBounds(bounds, { padding: [24, 24] });
  }, [bounds, map]);

  return null;
}

function InvalidateSizeOnMount() {
  const map = useMap();
  useEffect(() => {
    const t = window.setTimeout(() => map.invalidateSize(), 0);
    return () => window.clearTimeout(t);
  }, [map]);
  return null;
}

const EventsMap: React.FC = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const [countries, setCountries] = useState<CountriesGeoJSON | null>(null);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [countriesError, setCountriesError] = useState<string | null>(null);

  useEffect(() => {
    axios.get('/api/events')
      .then(res => setEvents(res.data || []))
      .catch(err => {
        setEventsError(err instanceof Error ? err.message : String(err));
      });
  }, []);

  useEffect(() => {
    fetch('https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson')
      .then(r => r.json())
      .then((fc: CountriesGeoJSON) => setCountries(fc))
      .catch(err => {
        setCountriesError(err instanceof Error ? err.message : String(err));
      });
  }, []);

  const croatiaAndNeighbors = useMemo(() => {
    if (!countries) return null;
    const features = (countries.features || []).filter(f => {
      const props = (f.properties || {}) as Record<string, unknown>;
      const iso3 = String(props.ISO_A3 ?? '');
      return iso3 === CROATIA_ISO3 || NEIGHBOR_ISO3.has(iso3);
    });
    return { ...countries, features } as CountriesGeoJSON;
  }, [countries]);

  const croatiaBounds = useMemo(() => {
    if (!croatiaAndNeighbors) return null;

    const croatiaFeature = croatiaAndNeighbors.features.find(f => {
      const props = (f.properties || {}) as Record<string, unknown>;
      return String(props.ISO_A3 ?? '') === CROATIA_ISO3;
    });
    if (!croatiaFeature) return null;

    return L.geoJSON(croatiaFeature as unknown as GeoJSON.GeoJsonObject).getBounds();
  }, [croatiaAndNeighbors]);

  const countryStyle = (feature?: GeoJSON.Feature) => {
    const props = (feature?.properties || {}) as Record<string, unknown>;
    const iso3 = String(props.ISO_A3 ?? '');

    if (iso3 === CROATIA_ISO3) {
      return {
        color: '#0b5ed7',
        weight: 3,
        opacity: 1,
        fillColor: '#0b5ed7',
        fillOpacity: 0.22,
      };
    }

    // Fade everything else
    return {
      color: '#6c757d',
      weight: 1,
      opacity: 0.12,
      fillColor: '#6c757d',
      fillOpacity: 0.02,
    };
  };

  const isPathLayer = (layer: L.Layer): layer is L.Path => layer instanceof L.Path;

  return (
    <div style={{ height: '100%', width: '100%', position: 'relative' }}>
      <div
        style={{
          position: 'absolute',
          zIndex: 1000,
          top: 8,
          left: 8,
          padding: '6px 8px',
          background: 'rgba(0,0,0,0.65)',
          color: 'white',
          fontSize: 12,
          borderRadius: 6,
          pointerEvents: 'none',
          maxWidth: 360,
        }}
      >
        <div>events: {events.length}{eventsError ? ` (error: ${eventsError})` : ''}</div>
        <div>countries: {countries ? 'loaded' : 'loading'}{countriesError ? ` (error: ${countriesError})` : ''}</div>
      </div>

      <MapContainer
        center={[45.1, 15.2]}
        zoom={7}
        style={{ height: '100%', width: '100%' }}
      >
        <InvalidateSizeOnMount />

        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {croatiaBounds && <FitToBounds bounds={croatiaBounds} />}

        {croatiaAndNeighbors && (
          <GeoJSON
            data={croatiaAndNeighbors as unknown as GeoJSON.GeoJsonObject}
            style={countryStyle}
            onEachFeature={(feature: GeoJSON.Feature, layer: L.Layer) => {
              const props = (feature?.properties || {}) as Record<string, unknown>;
              const iso3 = String(props.ISO_A3 ?? '');

              if (isPathLayer(layer)) {
                layer.options.interactive = false;

                // Keep Croatia visually on top of the faded neighbors
                if (iso3 === CROATIA_ISO3) layer.bringToFront();
                else layer.bringToBack();
              }
            }}
          />
        )}

        {events.map(event => (
          <Marker
            key={`event-${event.id}`}
            position={[event.lat, event.lng]}
            icon={eventIcon}
          >
            <Popup>
              <div>
                <strong>{event.name}</strong>
                {event.date && <div>Date: {event.date}</div>}
                {event.location && <div>{event.location}</div>}
                {event.description && <div>{event.description}</div>}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
};

export default EventsMap;
