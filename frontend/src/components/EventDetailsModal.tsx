import React, { useMemo } from 'react';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import './EventDetailsModal.css';

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
      className="eventDetailsModal__overlay"
    >
      <div className="eventDetailsModal__dialog">
        <div className="eventDetailsModal__header">
          <div className="eventDetailsModal__headerLeft">
            <div className="eventDetailsModal__title">{event.name}</div>
            <div className="eventDetailsModal__meta">
              <span className="eventCategoryBadge">{event.category ?? 'Skirmish'}</span>
              {event.date && <span>Date: {formatDateDDMMYYYY(event.date)}</span>}
              {event.location && <span>{event.location}</span>}
            </div>
          </div>

          <button type="button" onClick={onClose} aria-label="Close event details">
            Close
          </button>
        </div>

        <div className="eventDetailsModal__content">
          <div className="eventDetailsModal__left">
            {event.facebook_link ? (
              <div className="eventDetailsModal__block">
                Event page:{' '}
                <a href={event.facebook_link} target="_blank" rel="noreferrer">
                  {event.facebook_link}
                </a>
              </div>
            ) : null}
            {event.detailed_description ? (
              <div className="eventDetailsModal__block">
                <div className="eventDetailsModal__blockTitle">Description</div>
                <div className="eventDetailsModal__detailsText">{event.detailed_description}</div>
              </div>
            ) : null}
          </div>

          <div className="eventDetailsModal__right">
            <div className="eventDetailsModal__mediaBox">
              {event.thumbnail ? (
                <img
                  src={event.thumbnail}
                  alt={`${event.name} thumbnail`}
                  className="eventDetailsModal__mediaImg"
                  loading="lazy"
                />
              ) : (
                <div className="eventDetailsModal__noImage">No image</div>
              )}
            </div>

            <div className="eventDetailsModal__mapBox">
              <MapContainer center={mapCenter} zoom={12} className="eventDetailsModal__map">
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
