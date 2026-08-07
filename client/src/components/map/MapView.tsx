import { useEffect } from 'react';
import { MapContainer, TileLayer, useMap, Marker, Popup, ZoomControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import type { Waypoint } from '../../types';

const createCustomIcon = (index: number, total: number) => {
  const isLast = index === total - 1 && total > 1;
  // Evergreen for origin/stops, Grapefruit for destination
  const color = isLast ? '#FF6B6B' : '#042A2B'; 

  const svgHtml = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${color}" width="36" height="36" style="filter: drop-shadow(0px 2px 4px rgba(0,0,0,0.3))">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
    </svg>
  `;

  return L.divIcon({
    html: svgHtml,
    className: 'custom-leaflet-marker bg-transparent border-none',
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -36],
  });
};

interface MapViewProps {
  waypoints: Waypoint[];
  centerLocation?: [number, number] | null;
  children?: React.ReactNode;
}

const MapUpdater = ({ waypoints, centerLocation }: { waypoints: Waypoint[]; centerLocation?: [number, number] | null }) => {
  const map = useMap();
  useEffect(() => {
    if (centerLocation) {
      map.setView(centerLocation, 15, { animate: true });
    } else if (waypoints.length > 0) {
      const bounds = L.latLngBounds(waypoints.map((wp) => [wp.lat, wp.lon]));
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 });
    }
  }, [waypoints, centerLocation, map]);
  return null;
};

export const MapView = ({ waypoints, centerLocation, children }: MapViewProps) => {
  return (
    <div className="w-full h-full">
      <MapContainer
        center={centerLocation || [20.5937, 78.9629]}
        zoom={centerLocation ? 15 : 5}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
      >
        <ZoomControl position="topright" />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {waypoints.map((wp, i) => (
          <Marker key={i} position={[wp.lat, wp.lon]} icon={createCustomIcon(i, waypoints.length)}>
            <Popup className="font-sans text-evergreen font-semibold">
              {wp.name || `Stop ${i + 1}`}
            </Popup>
          </Marker>
        ))}
        {children}
        <MapUpdater waypoints={waypoints} centerLocation={centerLocation} />
      </MapContainer>
    </div>
  );
};
