import { apiClient } from './client';
import type { User, Route, SearchResult } from '../types';

export const authApi = {
  login: (data: Record<string, unknown>) => apiClient.post<{ token: string; user: User }>('/auth/login', data),
  register: (data: Record<string, unknown>) => apiClient.post<{ token: string; user: User }>('/auth/register', data),
};

export const searchApi = {
  searchPlaces: (query: string) => apiClient.get<SearchResult[]>(`/search?q=${query}`),
};

export const routeApi = {
  calculateRoute: (data: Record<string, unknown>) => apiClient.post<Route>('/routes', data),
  getSavedRoutes: () => apiClient.get<Route[]>('/routes'),
};
