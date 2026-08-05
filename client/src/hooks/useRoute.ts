import { useState } from 'react';
import { routeApi } from '../api/endpoints';
import type { Waypoint, Route } from '../types';

export const useRoute = () => {
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [currentRoute, setCurrentRoute] = useState<Route | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addWaypoint = (waypoint: Waypoint) => {
    setWaypoints((prev) => [...prev, waypoint]);
  };

  const removeWaypoint = (index: number) => {
    setWaypoints((prev) => prev.filter((_, i) => i !== index));
  };

  const reorderWaypoints = (startIndex: number, endIndex: number) => {
    setWaypoints((prev) => {
      const result = Array.from(prev);
      const [removed] = result.splice(startIndex, 1);
      result.splice(endIndex, 0, removed);
      return result;
    });
  };

  const calculateRoute = async (name: string) => {
    if (waypoints.length < 2) {
      setError('At least 2 waypoints are required to calculate a route');
      return;
    }
    
    setLoading(true);
    setError(null);
    try {
      const response = await routeApi.calculateRoute({ name, waypoints });
      setCurrentRoute(response.data);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      setError(error.response?.data?.error || 'Failed to calculate route');
    } finally {
      setLoading(false);
    }
  };

  return {
    waypoints,
    currentRoute,
    loading,
    error,
    addWaypoint,
    removeWaypoint,
    reorderWaypoints,
    calculateRoute,
    setWaypoints,
  };
};
