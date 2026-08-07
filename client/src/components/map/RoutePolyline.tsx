import React, { useMemo } from 'react';
import { Polyline, useMap } from 'react-leaflet';

interface RoutePolylineProps {
  encodedPolyline: string;
}

// Valhalla uses precision 6 (1e6) for encoding
function decodePolyline6(str: string): [number, number][] {
  let index = 0;
  let lat = 0;
  let lng = 0;
  const coordinates: [number, number][] = [];
  const factor = 1e6;

  while (index < str.length) {
    let b;
    let shift = 0;
    let result = 0;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) !== 0 ? ~(result >> 1) : (result >> 1);
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1) !== 0 ? ~(result >> 1) : (result >> 1);
    lng += dlng;

    coordinates.push([lat / factor, lng / factor]);
  }
  return coordinates;
}

export const RoutePolyline: React.FC<RoutePolylineProps> = ({ encodedPolyline }) => {
  const map = useMap();

  const decodedPositions = useMemo(() => {
    if (!encodedPolyline) return [];
    const positions = decodePolyline6(encodedPolyline);
    
    // Auto fit map to the route bounds when polyline changes
    if (positions.length > 0) {
      map.fitBounds(positions, { padding: [50, 50] });
    }
    
    return positions;
  }, [encodedPolyline, map]);

  if (decodedPositions.length === 0) return null;

  return (
    <>
      {/* Outer casing stroke using brand Evergreen (#042A2B) to separate from map roads */}
      <Polyline 
        positions={decodedPositions} 
        pathOptions={{ color: '#042A2B', weight: 9, opacity: 0.75, lineCap: 'round', lineJoin: 'round' }} 
      />
      {/* Brand Grapefruit Pink (#FF6B6B) main route line */}
      <Polyline 
        positions={decodedPositions} 
        pathOptions={{ color: '#FF6B6B', weight: 6, opacity: 1, lineCap: 'round', lineJoin: 'round' }} 
      />
    </>
  );
};
