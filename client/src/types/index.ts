export interface User {
  id: string;
  email: string;
  name?: string;
  role?: string;
}

export interface Waypoint {
  lat: number;
  lon: number;
  name?: string;
  date?: string;
  stayDuration?: string;
  isRestDay?: boolean;
  notes?: string;
}

export interface Route {
  id: string;
  name: string;
  waypoints: Waypoint[];
  polyline: string;
  distance: number;
  duration: number;
  legDistances?: number[];
  legDurations?: number[];
  costing?: string;
  mode?: 'car' | 'motorcycle' | 'bicycle';
  engine?: { name: string; version: string };
  snapshotId?: string;
  attribution?: { text: string; url: string };
  plannerRoute?: PlannerRouteAlternative;
  startDate?: string;
  endDate?: string;
  shareToken?: string;
  userId?: string;
  user?: {
    id?: string;
    email: string;
    name?: string;
  };
  createdAt: string;
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

export interface TripPlanStop {
  poiId: string;
  arrival: string;
  departure: string;
  reason: string;
  evidenceIds: string[];
}

export interface TripPlanDay {
  dayNumber: number;
  date?: string;
  legs: Array<{
    from: string;
    to: string;
    distanceMeters: number;
    durationSeconds: number;
  }>;
  stops: TripPlanStop[];
  notes?: string[];
}

export interface TripPlanDraft {
  requestId: string;
  revision: number;
  status: 'draft' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
  routeId: string;
  days: TripPlanDay[];
  uncertainties: string[];
}

export interface SearchResult {
  name: string;
  display_name: string;
  lat: number;
  lon: number;
}

export interface Checkin {
  id: string;
  userId: string;
  latitude: number;
  longitude: number;
  address?: string;
  shareToken: string;
  createdAt: string;
  user?: {
    id?: string;
    email: string;
    role?: string;
  };
}

