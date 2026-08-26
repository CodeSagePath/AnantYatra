import { searchApi } from '../api/endpoints';

export const reverseGeocodeClient = async (lat: number, lon: number): Promise<string | null> => {
  try {
    const response = await searchApi.reverseGeocode(lat, lon);
    return response.data.name || null;
  } catch (error) {
    console.error('Reverse geocoding failed via backend:', error);
    return null;
  }
};

export const batchGetStatesForWaypoints = async (waypoints: { lat: number; lon: number }[]): Promise<Record<number, string>> => {
  try {
    const coords = waypoints.map(wp => ({ lat: wp.lat, lon: wp.lon }));
    const response = await searchApi.batchStates(coords);
    return response.data;
  } catch (err) {
    console.error('Failed to fetch batch states from backend:', err);
    return {};
  }
};
