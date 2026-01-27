import React, { useMemo } from 'react';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';

function formatDateDDMMYYYY(value: string) {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return value;

  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

export type EventForModal = {
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
};

type EventDetailsModalProps = {
  event: EventForModal;
  onClose: () => void;
};

const EventDetailsModal: React.FC<EventDetailsModalProps> = ({ event, onClose }) => {
  const mapCenter = useMemo<[number, number]>(() => [event.lat, event.lng], [event.lat, event.lng]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Event details: ${event.name}`}
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        background: 'rgba(0,0,0,0.6)',
        display: 'grid',
        placeItems: 'center',
        padding: 16,
      }}
    >
      <div
        style={{
          width: 'min(920px, 96vw)',
          maxHeight: '92vh',
          overflow: 'auto',
          borderRadius: 14,
          border: '1px solid rgba(255,255,255,0.16)',
          background: 'rgba(20,20,20,0.95)',
          backdropFilter: 'blur(10px)',
          padding: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.15 }}>{event.name}</div>
            <div style={{ opacity: 0.9, marginTop: 6, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <span className="eventCategoryBadge">{event.category ?? 'Skirmish'}</span>
              {event.date && <span>Date: {formatDateDDMMYYYY(event.date)}</span>}
              {event.location && <span>{event.location}</span>}
            </div>
          </div>

          <button type="button" onClick={onClose} aria-label="Close event details">
            Close
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 14,
            marginTop: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ flex: '1 1 360px', minWidth: 0 }}>
             {event.facebook_link ? (
              <div style={{ marginTop: 12 }}>
                Event page:{' '}
                <a href={event.facebook_link} target="_blank" rel="noreferrer">
                  {event.facebook_link}
                </a>
              </div>
            ) : null}
            {event.detailed_description ? (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 800, marginBottom: 6 }}>Description</div>
                <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{event.detailed_description}</div>
              </div>
            ) : null}

           
          </div>

          <div
            style={{
              width: 'clamp(220px, 34vw, 320px)',
              flex: '0 0 auto',
              display: 'grid',
              gap: 12,
            }}
          >
            <div
              style={{
                width: '100%',
                aspectRatio: '1 / 1',
                borderRadius: 12,
                overflow: 'hidden',
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.04)',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              {event.thumbnail ? (
                <img
                  src={event.thumbnail}
                  alt={`${event.name} thumbnail`}
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  loading="lazy"
                />
              ) : (
                <div style={{ opacity: 0.75, fontSize: 12 }}>No image</div>
              )}
            </div>

            <div
              style={{
                width: '100%',
                aspectRatio: '1 / 1',
                borderRadius: 12,
                overflow: 'hidden',
                border: '1px solid rgba(255,255,255,0.12)',
              }}
            >
              <MapContainer center={mapCenter} zoom={12} style={{ height: '100%', width: '100%' }}>
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <Marker position={mapCenter}>
                  <Popup>{event.name}</Popup>
                </Marker>
              </MapContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EventDetailsModal;
