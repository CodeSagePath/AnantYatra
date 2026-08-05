import React, { useEffect } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { Waypoint } from '../../types';
import L from 'leaflet';

// Fix for default marker icons in React-Leaflet
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
const DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

interface MapViewProps {
  waypoints: Waypoint[];
  children?: React.ReactNode;
}

// Helper component to auto-center map when waypoints change
const MapUpdater: React.FC<{ waypoints: Waypoint[] }> = ({ waypoints }) => {
  const map = useMap();
  useEffect(() => {
    if (waypoints.length > 0) {
      const bounds = L.latLngBounds(waypoints.map((wp) => [wp.lat, wp.lon]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
  }, [waypoints, map]);
  return null;
};

export const MapView: React.FC<MapViewProps> = ({ waypoints, children }) => {
  // Default to geographical center of India
  const defaultCenter: [number, number] = [20.5937, 78.9629];
  
  return (
    <div className="w-full h-full relative rounded-2xl overflow-hidden shadow-2xl border border-white/20">
      <MapContainer
        center={defaultCenter}
        zoom={5}
        zoomControl={false} // We can add custom zoom controls later if needed
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        {/* Render child components (like RoutePolyline and Markers) */}
        {children}

        {/* Auto-update map bounds based on waypoints */}
        <MapUpdater waypoints={waypoints} />
      </MapContainer>
    </div>
  );
};
