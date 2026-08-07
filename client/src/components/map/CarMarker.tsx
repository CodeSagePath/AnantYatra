import React from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import type { Checkin } from '../../types';
import { Car, Clock, MapPin } from 'lucide-react';

const createCarIcon = () => {
  const svgHtml = `
    <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 44px; height: 44px;">
      <div style="position: relative; background: #042A2B; color: #FF6B6B; border: 2px solid #FF6B6B; border-radius: 9999px; width: 38px; height: 38px; display: flex; align-items: center; justify-content: center; box-shadow: 0px 4px 12px rgba(0,0,0,0.4);">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.5 2.8C2.05 11.2 2 11.6 2 12v4c0 .6.4 1 1 1h2"/>
          <circle cx="7" cy="17" r="2"/>
          <path d="M9 17h6"/>
          <circle cx="17" cy="17" r="2"/>
        </svg>
      </div>
    </div>
  `;

  return L.divIcon({
    html: svgHtml,
    className: 'custom-car-marker bg-transparent border-none',
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -22],
  });
};

interface CarMarkerProps {
  checkin: Checkin;
}

export const CarMarker: React.FC<CarMarkerProps> = ({ checkin }) => {
  if (!checkin) return null;

  const lat = typeof checkin.latitude === 'number' ? checkin.latitude : parseFloat(checkin.latitude);
  const lng = typeof checkin.longitude === 'number' ? checkin.longitude : parseFloat(checkin.longitude);

  if (isNaN(lat) || isNaN(lng)) return null;

  const dateObj = checkin.createdAt ? new Date(checkin.createdAt) : new Date();
  const formattedTime = isNaN(dateObj.getTime()) ? 'Recently' : dateObj.toLocaleString();

  return (
    <Marker
      position={[lat, lng]}
      icon={createCarIcon()}
    >
      <Popup className="font-sans">
        <div className="p-1 min-w-[200px]">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 border-b border-slate-100 pb-1.5 mb-1.5">
            <Car className="w-4 h-4 text-red-500 shrink-0" />
            <span>{checkin.user?.email || 'Checked-in Location'}</span>
          </div>
          <div className="text-[11px] text-slate-600 space-y-1">
            <div className="flex items-center gap-1">
              <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
              <span>{checkin.address || `${lat.toFixed(4)}, ${lng.toFixed(4)}`}</span>
            </div>
            <div className="flex items-center gap-1 text-slate-400 text-[10px]">
              <Clock className="w-3 h-3 shrink-0" />
              <span>Last Seen: {formattedTime}</span>
            </div>
          </div>
        </div>
      </Popup>
    </Marker>
  );
};
