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
}

export interface Route {
  id: string;
  name: string;
  waypoints: Waypoint[];
  polyline: string;
  distance: number;
  duration: number;
  userId: string;
  createdAt: string;
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

