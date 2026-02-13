import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import * as L from 'leaflet';

const DEFAULT_CENTER: [number, number] = [44.7, 16];

const MapRecenter: React.FC<{ center: [number, number]; zoom: number }> = ({ center, zoom }) => {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom, { animate: true });
  }, [center, zoom, map]);
  return null;
};

const MapClickSetter: React.FC<{ onPick: (lat: number, lng: number) => void }> = ({ onPick }) => {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
};

type EventInput = {
  name: string;
  description: string;
  detailedDescription: string;
  location: string;
  date: string;
  lat: number | null;
  lng: number | null;
  category: string;
  facebookLink: string;
  thumbnailFile: File | null;
};

type StringField = Exclude<keyof EventInput, 'lat' | 'lng' | 'thumbnailFile'>;

// Fix default marker icon
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

type AdminCreateEventProps = {
  authToken?: string | null;
};

const AdminCreateEvent: React.FC<AdminCreateEventProps> = ({ authToken }) => {
  const [form, setForm] = useState<EventInput>({
    name: '',
    description: '',
    detailedDescription: '',
    location: '',
    date: '',
    lat: null,
    lng: null,
    category: 'Skirmish',
    facebookLink: '',
    thumbnailFile: null,
  });

  const [status, setStatus] = useState<string | null>(null);
  const [loadingGeo, setLoadingGeo] = useState(false);

  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!form.thumbnailFile) {
      setLocalPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(form.thumbnailFile);
    setLocalPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [form.thumbnailFile]);

  const previewUrl = useMemo(() => localPreviewUrl ?? null, [localPreviewUrl]);

  const onChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const key = e.target.name as StringField;
    setForm(prev => ({ ...prev, [key]: e.target.value }));
  };

  const geocodeLocation = async (location: string) => {
    const q = location.trim();
    if (!q) throw new Error('Location is required');

    setLoadingGeo(true);
    try {
      const params = new URLSearchParams({
        format: 'json',
        q,
        limit: '1',
      });

      const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
        headers: { Accept: 'application/json' },
      });

      if (!res.ok) {
        throw new Error(res.status === 429 ? 'Geocoding rate-limited (try again later)' : 'Geocoding failed');
      }

      const data: unknown = await res.json();
      const first = Array.isArray(data) ? data[0] : undefined;
      const lat = typeof first?.lat === 'string' ? Number.parseFloat(first.lat) : NaN;
      const lng = typeof first?.lon === 'string' ? Number.parseFloat(first.lon) : NaN;

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw new Error('Location not found');
      }

      return { lat, lng };
    } finally {
      setLoadingGeo(false);
    }
  };

  const locate = async () => {
    setStatus(null);
    try {
      const coords = await geocodeLocation(form.location);
      setForm(prev => ({ ...prev, ...coords }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not locate address';
      setStatus(`❌ ${message}`);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);

    if (form.lat == null || form.lng == null) {
      setStatus('❌ Please set a location on the map');
      return;
    }

    try {
      const body = new FormData();
      body.set('name', form.name);
      body.set('description', form.description);
      body.set('detailedDescription', form.detailedDescription);
      body.set('location', form.location);
      body.set('date', form.date);
      body.set('lat', String(form.lat));
      body.set('lng', String(form.lng));
      body.set('category', form.category);
      body.set('facebookLink', form.facebookLink);
      if (form.thumbnailFile) body.set('thumbnail', form.thumbnailFile);

      const res = await fetch('/api/events', {
        method: 'POST',
        body,
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
      });

      if (!res.ok) {
        const raw = await res.text().catch(() => '');
        let message = `HTTP ${res.status}`;
        try {
          const parsed: unknown = raw ? JSON.parse(raw) : null;
          if (parsed && typeof parsed === 'object') {
            const errMsg =
              'error' in parsed && typeof (parsed as Record<string, unknown>).error === 'string'
                ? String((parsed as Record<string, unknown>).error)
                : '';
            if (errMsg) message = errMsg;
          } else if (raw) {
            message = raw;
          }
        } catch {
          if (raw) message = raw;
        }
        throw new Error(message);
      }

      setStatus('✅ Event created!');
      setForm({
        name: '',
        description: '',
        detailedDescription: '',
        location: '',
        date: '',
        lat: null,
        lng: null,
        category: 'Skirmish',
        facebookLink: '',
        thumbnailFile: null,
      });
    } catch (err) {
      setStatus(`❌ ${err instanceof Error ? err.message : 'Failed to save event'}`);
    }
  };

  const mapCenter = useMemo<[number, number]>(
    () => (form.lat != null && form.lng != null ? [form.lat, form.lng] : DEFAULT_CENTER),
    [form.lat, form.lng]
  );
  const mapZoom = form.lat != null && form.lng != null ? 13 : 7.5;

  return (
    <div className="page">
      <div className="warningBox" style={{ marginBottom: 12 }}>
        <strong>All created events will be sent for verification before publishing.</strong>
        <div style={{ marginTop: 6, opacity: 0.95 }}>
          Verification process can take up to 24 hours. Users are limited to creating 2 Events per day.
        </div>
      </div>

      <h2>Create Event</h2>

      <form onSubmit={submit} style={{ display: 'grid', gap: 10, maxWidth: 460 }}>
        <input name="name" placeholder="Event Name" value={form.name} onChange={onChange} required />

        <label style={{ display: 'grid', gap: 6 }}>
          <span>Category</span>
          <select name="category" value={form.category} onChange={onChange}>
            <option value="24h">24h</option>
            <option value="12h">12h</option>
            <option value="Skirmish">Skirmish</option>
          </select>
        </label>

        <textarea name="description" placeholder="Description" value={form.description} onChange={onChange} />

        <label style={{ display: 'grid', gap: 6 }}>
          <span>Detailed description (shown only in details view)</span>
          <textarea
            name="detailedDescription"
            placeholder="More detailed description"
            value={form.detailedDescription}
            onChange={onChange}
          />
        </label>

        <input name="location" placeholder="Town / Address" value={form.location} onChange={onChange} required />

        <label style={{ display: 'grid', gap: 6 }}>
          <span>Thumbnail (optional)</span>
          {previewUrl && (
            <img
              src={previewUrl}
              alt="Thumbnail preview"
              style={{
                width: 120,
                height: 120,
                objectFit: 'cover',
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.12)',
              }}
            />
          )}
          <input
            type="file"
            accept="image/*"
            onChange={e => {
              const file = e.currentTarget.files?.[0] ?? null;
              setForm(prev => ({ ...prev, thumbnailFile: file }));
            }}
          />
        </label>

        <button type="button" onClick={locate} disabled={loadingGeo}>
          {loadingGeo ? 'Locating…' : '📍 Locate on Map'}
        </button>

        <div style={{ height: 260, borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ fontSize: 12, opacity: 0.9, marginBottom: 6 }}>
            Tip: click on the map to place/move the event marker.
          </div>
          <MapContainer center={mapCenter} zoom={mapZoom} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
            <MapRecenter center={mapCenter} zoom={mapZoom} />
            <MapClickSetter
              onPick={(lat, lng) => {
                setForm(prev => ({ ...prev, lat, lng }));
              }}
            />
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {form.lat != null && form.lng != null ? <Marker position={[form.lat, form.lng]} /> : null}
          </MapContainer>
        </div>

        <input name="date" type="date" value={form.date} onChange={onChange} />
        <input name="facebookLink" placeholder="Facebook Event Link" value={form.facebookLink} onChange={onChange} />

        <button type="submit">Create Event</button>
      </form>

      {status && <div style={{ marginTop: 12 }}>{status}</div>}
    </div>
  );
};

export default AdminCreateEvent;
