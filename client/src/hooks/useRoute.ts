import { useState, useEffect, useCallback } from 'react';
import { routeApi } from '../api/endpoints';
import type { Waypoint, Route } from '../types';
import { AxiosError } from 'axios';

export interface WaypointSlot {
  id: string;
  waypoint: Waypoint | null;
}

export const useRoute = () => {
  // Initialize from local storage or with two empty slots
  const [slots, setSlots] = useState<WaypointSlot[]>(() => {
    const saved = localStorage.getItem('anantyatra_current_draft_route');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length >= 2) return parsed;
      } catch (e) {
        console.error('Failed to parse saved draft route', e);
      }
    }
    return [
      { id: 'slot-1', waypoint: null },
      { id: 'slot-2', waypoint: null },
    ];
  });
  const [currentRoute, setCurrentRoute] = useState<Route | null>(null);
  const [costing, setCosting] = useState<string>('auto');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Derived valid waypoints
  const waypoints = slots.map((s) => s.waypoint).filter(Boolean) as Waypoint[];

  // Persist draft route
  useEffect(() => {
    localStorage.setItem('anantyatra_current_draft_route', JSON.stringify(slots));
  }, [slots]);

  const addSlot = () => {
    setSlots((prev) => [...prev, { id: `slot-${Date.now()}`, waypoint: null }]);
  };

  const updateSlot = (id: string, waypoint: Waypoint | null) => {
    setSlots((prev) =>
      prev.map((slot) => (slot.id === id ? { ...slot, waypoint } : slot))
    );
  };

  const removeSlot = (id: string) => {
    setSlots((prev) => prev.filter((slot) => slot.id !== id));
  };

  const reorderSlots = (oldIndex: number, newIndex: number) => {
    setSlots((prev) => {
      const result = Array.from(prev);
      const [removed] = result.splice(oldIndex, 1);
      result.splice(newIndex, 0, removed);
      return result;
    });
  };

  // Helper to load a saved route array directly
  const loadSavedWaypoints = (savedWaypoints: Waypoint[]) => {
    const newSlots: WaypointSlot[] = savedWaypoints.map((wp, idx) => ({
      id: `saved-slot-${Date.now()}-${idx}`,
      waypoint: wp,
    }));
    // If it's only 1 waypoint, ensure we have a second empty slot
    while (newSlots.length < 2) {
      newSlots.push({ id: `saved-slot-empty-${Date.now()}-${newSlots.length}`, waypoint: null });
    }
    setSlots(newSlots);
  };

  const calculateRoute = useCallback(async (name: string, wps: Waypoint[], mode: string = costing) => {
    if (wps.length < 2) {
      setCurrentRoute(null); // Clear route if less than 2
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await routeApi.calculateRoute({ name, waypoints: wps, costing: mode });
      setCurrentRoute(response.data);
    } catch (err: unknown) {
      if (err instanceof AxiosError) {
        const serverErr = err?.response?.data?.error;
        // const customErr = err?.customMessage || err?.message;
        setError(serverErr || 'Failed to calculate route');
        // setError(serverErr || customErr || 'Failed to calculate route');
      } else {
        setError('Failed to calculate route');
      }
    } finally {
      setLoading(false);
    }
  }, [costing]);

  const waypointsStr = JSON.stringify(waypoints);
  
  // Auto-calculation effect
  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      if (waypoints.length >= 2) {
        calculateRoute('My Journey', waypoints, costing);
      } else {
        setCurrentRoute(null);
      }
    }, 800);

    return () => clearTimeout(delayDebounce);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waypointsStr, costing, calculateRoute]);

  // Legacy compat functions for App.tsx before refactor finishes
  const addWaypoint = (waypoint: Waypoint) => {
    // Find first empty slot, or add a new one
    const emptyIndex = slots.findIndex((s) => s.waypoint === null);
    if (emptyIndex >= 0) {
      updateSlot(slots[emptyIndex].id, waypoint);
    } else {
      setSlots((prev) => [...prev, { id: `slot-${Date.now()}`, waypoint }]);
    }
  };

  const removeWaypoint = (index: number) => {
    if (index >= 0 && index < slots.length) {
      removeSlot(slots[index].id);
    }
  };

  return {
    slots,
    waypoints,
    currentRoute,
    costing,
    setCosting,
    loading,
    error,
    addSlot,
    updateSlot,
    removeSlot,
    reorderSlots,
    loadSavedWaypoints,
    
    // Legacy mapping to avoid immediately breaking everything
    addWaypoint,
    removeWaypoint,
    calculateRoute,
    setWaypoints: loadSavedWaypoints,
  };
};
