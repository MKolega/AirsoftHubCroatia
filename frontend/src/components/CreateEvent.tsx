import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import * as L from 'leaflet';

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

const AdminCreateEvent: React.FC = () => {
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
      setStatus('❌ Please locate the address first');
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

      const res = await fetch('/api/events', { method: 'POST', body });

      if (!res.ok) throw new Error('Failed to create event');

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
    } catch {
      setStatus('❌ Failed to save event');
    }
  };

  return (
    <div className="page">
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

        {form.lat != null && form.lng != null && (
          <div style={{ height: 220, borderRadius: 8, overflow: 'hidden' }}>
            <MapContainer
              center={[form.lat, form.lng]}
              zoom={13}
              style={{ height: '100%', width: '100%' }}
              scrollWheelZoom={false}
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <Marker position={[form.lat, form.lng]} />
            </MapContainer>
          </div>
        )}

        <input name="date" type="date" value={form.date} onChange={onChange} />
        <input name="facebookLink" placeholder="Facebook Event Link" value={form.facebookLink} onChange={onChange} />

        <button type="submit">Create Event</button>
      </form>

      {status && <div style={{ marginTop: 12 }}>{status}</div>}
    </div>
  );
};

export default AdminCreateEvent;
