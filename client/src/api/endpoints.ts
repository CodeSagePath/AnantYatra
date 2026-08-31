import { apiClient } from './client';
import type { User, Route, SearchResult, Checkin } from '../types';

export const authApi = {
  login: (data: Record<string, unknown>) => apiClient.post<{ token: string; user: User }>('/auth/login', data),
  register: (data: Record<string, unknown>) => apiClient.post<{ token: string; user: User }>('/auth/register', data),
};

export const searchApi = {
  searchPlaces: (query: string) => apiClient.get<SearchResult[]>(`/search?q=${query}`),
  reverseGeocode: (lat: number, lon: number) => apiClient.get<{ name: string }>(`/search/reverse?lat=${lat}&lon=${lon}`),
  batchStates: (coordinates: { lat: number; lon: number }[]) => apiClient.post<Record<number, string>>('/search/states', { coordinates }),
};

export const routeApi = {
  calculateRoute: (data: Record<string, unknown>) => apiClient.post<Route>('/routes/calculate', data),
  getSavedRoutes: () => apiClient.get<Route[]>('/routes'),
  createSavedRoute: (data: { name: string; waypoints: unknown[]; costing?: string; startDate?: string | null; endDate?: string | null }) => apiClient.post<Route>('/routes', data),
  updateSavedRoute: (id: string, data: { name?: string; waypoints: unknown[]; costing?: string; startDate?: string | null; endDate?: string | null }) => apiClient.put<Route>(`/routes/${id}`, data),
  deleteSavedRoute: (id: string) => apiClient.delete<{ message: string }>(`/routes/${id}`),
  getSharedRoute: (shareToken: string) => apiClient.get<Route>(`/routes/share/${shareToken}`),
};

export const checkinApi = {
  createCheckin: (data: { latitude: number; longitude: number; address?: string }) =>
    apiClient.post<Checkin>('/checkins', data),
  getAdminCheckins: () => apiClient.get<Checkin[]>('/checkins/admin'),
  getSharedCheckin: (shareToken: string) => apiClient.get<Checkin>(`/checkins/share/${shareToken}`),
};

