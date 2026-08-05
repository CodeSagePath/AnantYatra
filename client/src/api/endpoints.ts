import { apiClient } from './client';
import { User, Route, SearchResult } from '../types';

export const authApi = {
  login: (data: any) => apiClient.post<{ token: string; user: User }>('/auth/login', data),
  register: (data: any) => apiClient.post<{ token: string; user: User }>('/auth/register', data),
};

export const searchApi = {
  searchPlaces: (query: string) => apiClient.get<SearchResult[]>(`/search?q=${query}`),
};

export const routeApi = {
  calculateRoute: (data: any) => apiClient.post<Route>('/routes', data),
  getSavedRoutes: () => apiClient.get<Route[]>('/routes'),
};
