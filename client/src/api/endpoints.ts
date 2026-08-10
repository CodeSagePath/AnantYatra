import { apiClient } from './client';
import type { User, Route, SearchResult, Checkin } from '../types';

export const authApi = {
  login: (data: Record<string, unknown>) => apiClient.post<{ token: string; user: User }>('/auth/login', data),
  register: (data: Record<string, unknown>) => apiClient.post<{ token: string; user: User }>('/auth/register', data),
};

export const searchApi = {
  searchPlaces: (query: string) => apiClient.get<SearchResult[]>(`/search?q=${query}`),
};

export const routeApi = {
  calculateRoute: (data: Record<string, unknown>) => apiClient.post<Route>('/routes/calculate', data),
  getSavedRoutes: () => apiClient.get<Route[]>('/routes'),
  createSavedRoute: (data: { name: string; waypoints: unknown[]; costing?: string }) => apiClient.post<Route>('/routes', data),
  updateSavedRoute: (id: string, data: { name?: string; waypoints: unknown[]; costing?: string }) => apiClient.put<Route>(`/routes/${id}`, data),
  deleteSavedRoute: (id: string) => apiClient.delete<{ message: string }>(`/routes/${id}`),
  getSharedRoute: (shareToken: string) => apiClient.get<Route>(`/routes/share/${shareToken}`),
};

export const checkinApi = {
  createCheckin: (data: { latitude: number; longitude: number; address?: string }) =>
    apiClient.post<Checkin>('/checkins', data),
  getAdminCheckins: () => apiClient.get<Checkin[]>('/checkins/admin'),
  getSharedCheckin: (shareToken: string) => apiClient.get<Checkin>(`/checkins/share/${shareToken}`),
};

