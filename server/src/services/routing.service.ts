import polyline from '@mapbox/polyline';

interface Waypoint {
  lat: number;
  lon: number;
  name: string;
}

interface RouteResult {
  polyline: string; // polyline6 encoded string
  distance: number; // in km
  duration: number; // in minutes
}

export const fetchValhallaRoute = async (waypoints: Waypoint[]): Promise<RouteResult> => {
  if (waypoints.length < 2) {
    throw new Error('At least 2 waypoints are required for a route');
  }

  // Valhalla expects format: [{lat, lon}, ...]
  const locations = waypoints.map((wp) => ({ lat: wp.lat, lon: wp.lon }));
  
  const response = await fetch(`${process.env.ROUTING_HOST}/route`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      locations: locations,
      costing: 'auto',
      directions_options: { units: 'kilometers' }
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(`Valhalla Error: ${errData.error || response.statusText}`);
  }

  const data = await response.json();
  
  if (!data.trip || !data.trip.legs || data.trip.legs.length === 0) {
    throw new Error('No route found between these points');
  }

  // Valhalla returns a shape per leg. Decode (precision 6) and combine them.
  let decodedPolyline: [number, number][] = [];
  for (const leg of data.trip.legs) {
    const legPoints = polyline.decode(leg.shape, 6) as [number, number][];
    decodedPolyline = decodedPolyline.concat(legPoints);
  }

  // Re-encode into a single continuous polyline6 string for the frontend
  const combinedEncoded = polyline.encode(decodedPolyline, 6);

  return {
    polyline: combinedEncoded,
    distance: data.trip.summary.length, // Already in kilometers
    duration: data.trip.summary.time / 60, // Convert seconds to minutes
  };
};
