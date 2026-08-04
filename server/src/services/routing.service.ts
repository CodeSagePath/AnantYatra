import polyline from '@mapbox/polyline';

interface Waypoint {
  lat: number;
  lng: number;
  name: string;
}

interface RouteResult {
  polyline: [number, number][]; // [lat, lng] pairs
  distance: number; // in km
  duration: number; // in minutes
}

export const fetchOSRMRoute = async (waypoints: Waypoint[]): Promise<RouteResult> => {
  if (waypoints.length < 2) {
    throw new Error('At least 2 waypoints are required for a route');
  }

  // OSRM expects format: [[lng, lat], [lng, lat], ...]
  const coordinates = waypoints.map((wp) => [wp.lng, wp.lat]);
  
  // POST request to bypass URL length limits (crucial for unlimited waypoints)
  const response = await fetch(`${process.env.OSRM_HOST}/route/v1/driving/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      coordinates: coordinates,
      geometries: 'polyline',
      overview: 'full',
    }),
  });

  if (!response.ok) {
    throw new Error(`OSRM Error: ${response.statusText}`);
  }

  const data = await response.json();
  
  if (!data.routes || data.routes.length === 0) {
    throw new Error('No route found between these points');
  }

  const route = data.routes[0];
  const decodedPolyline = polyline.decode(route.geometry); // Returns [lat, lng][]

  return {
    polyline: decodedPolyline,
    distance: route.distance / 1000, // Convert meters to kilometers
    duration: route.duration / 60,   // Convert seconds to minutes
  };
};
