import { randomUUID } from 'node:crypto';
import polyline from '@mapbox/polyline';

export interface Waypoint {
  lat: number;
  lon: number;
  name: string;
}

export interface PlannerRouteAlternative {
  schemaVersion: '1.0';
  routeId: string;
  mode: 'car' | 'motorcycle' | 'bicycle';
  engine: { name: string; version: string };
  snapshotId: string;
  distanceMeters: number;
  durationSeconds: number;
  geometry: string;
  legs: Array<{
    from: string;
    to: string;
    distanceMeters: number;
    durationSeconds: number;
  }>;
  createdAt: string;
  extensions: { attributionText: string; sourceUri: string };
}

export interface RouteResult {
  polyline: string; // polyline6 encoded string
  distance: number; // in km
  duration: number; // in minutes
  legDistances: number[]; // in km per leg
  legDurations: number[]; // in minutes per leg
  mode?: 'car' | 'motorcycle' | 'bicycle';
  engine: { name: string; version: string };
  snapshotId: string;
  attribution: { text: string; url: string };
  plannerRoute?: PlannerRouteAlternative;
}

const plannerModes: Record<string, 'car' | 'motorcycle' | 'bicycle'> = {
  auto: 'car',
  motorcycle: 'motorcycle',
  bicycle: 'bicycle',
};

export const toPlannerMode = (costing: string): 'car' | 'motorcycle' | 'bicycle' | undefined =>
  plannerModes[costing];

export const toValhallaCosting = (mode: string): string | undefined => {
  const costings: Record<string, string> = {
    car: 'auto',
    motorcycle: 'motorcycle',
    bicycle: 'bicycle',
  };
  return costings[mode];
};

const createPlannerRoute = (
  waypoints: Waypoint[],
  route: Omit<RouteResult, 'plannerRoute'>,
): PlannerRouteAlternative | undefined => {
  if (!route.mode || route.legDistances.length !== waypoints.length - 1) {
    return undefined;
  }

  return {
    schemaVersion: '1.0',
    routeId: randomUUID(),
    mode: route.mode,
    engine: route.engine,
    snapshotId: route.snapshotId,
    distanceMeters: route.distance * 1000,
    durationSeconds: route.duration * 60,
    geometry: route.polyline,
    legs: route.legDistances.map((distance, index) => ({
      from: waypoints[index].name || `waypoint-${index + 1}`,
      to: waypoints[index + 1].name || `waypoint-${index + 2}`,
      distanceMeters: distance * 1000,
      durationSeconds: route.legDurations[index] * 60,
    })),
    createdAt: new Date().toISOString(),
    extensions: {
      attributionText: route.attribution.text,
      sourceUri: route.attribution.url,
    },
  };
};

export const fetchValhallaRoute = async (waypoints: Waypoint[], costing: string = 'auto'): Promise<RouteResult> => {
  if (waypoints.length < 2) {
    throw new Error('At least 2 waypoints are required for a route');
  }

  // Valhalla expects format: [{lat, lon}, ...]
  const locations = waypoints.map((wp) => ({ lat: wp.lat, lon: wp.lon }));
  
  let response: Response;
  try {
    response = await fetch(`${process.env.ROUTING_HOST}/route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(45000), // 45s timeout for Valhalla backend (complex walk/cycle queries)
      body: JSON.stringify({
        locations: locations,
        costing: costing || 'auto',
        directions_options: { units: 'kilometers' }
      }),
    });
  } catch (err: any) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      throw new Error('Routing calculation timed out (exceeded 45s). Please try shorter distances or fewer stops for walk/cycle mode.');
    }
    throw new Error('Valhalla routing engine is unreachable. Please ensure the container is running on port 5005.');
  }

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
  const legDistances: number[] = [];
  const legDurations: number[] = [];

  for (const leg of data.trip.legs) {
    const legPoints = polyline.decode(leg.shape, 6) as [number, number][];
    decodedPolyline = decodedPolyline.concat(legPoints);
    legDistances.push(leg.summary?.length ?? 0);
    legDurations.push((leg.summary?.time ?? 0) / 60);
  }

  // Re-encode into a single continuous polyline6 string for the frontend
  const combinedEncoded = polyline.encode(decodedPolyline, 6);

  const route: Omit<RouteResult, 'plannerRoute'> = {
    polyline: combinedEncoded,
    distance: data.trip.summary.length, // Already in kilometers
    duration: data.trip.summary.time / 60, // Convert seconds to minutes
    legDistances,
    legDurations,
    ...(toPlannerMode(costing) ? { mode: toPlannerMode(costing) } : {}),
    engine: {
      name: 'Valhalla',
      version: process.env.ROUTING_ENGINE_VERSION || 'unreported',
    },
    snapshotId: process.env.ROUTING_SNAPSHOT_ID || 'unconfigured',
    attribution: {
      text: '© OpenStreetMap contributors. Data available under the Open Database License (ODbL) 1.0.',
      url: 'https://www.openstreetmap.org/copyright',
    },
  };
  return { ...route, plannerRoute: createPlannerRoute(waypoints, route) };
};
