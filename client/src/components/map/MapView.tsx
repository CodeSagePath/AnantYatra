import { useEffect } from 'react';
import { MapContainer, TileLayer, useMap, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import type { Waypoint } from '../../types';

// Fix default marker icon
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

interface MapViewProps {
  waypoints: Waypoint[];
  children?: React.ReactNode;
}

const MapUpdater = ({ waypoints }: { waypoints: Waypoint[] }) => {
  const map = useMap();
  useEffect(() => {
    if (waypoints.length > 0) {
      const bounds = L.latLngBounds(waypoints.map((wp) => [wp.lat, wp.lon]));
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 });
    }
  }, [waypoints, map]);
  return null;
};

export const MapView = ({ waypoints, children }: MapViewProps) => {
  return (
    <div className="w-full h-full">
      <MapContainer
        center={[20.5937, 78.9629]}
        zoom={5}
        style={{ height: '100%', width: '100%' }}
        zoomControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {waypoints.map((wp, i) => (
          <Marker key={i} position={[wp.lat, wp.lon]}>
            <Popup>{wp.name || `Stop ${i + 1}`}</Popup>
          </Marker>
        ))}
        {children}
        <MapUpdater waypoints={waypoints} />
      </MapContainer>
    </div>
  );
};
