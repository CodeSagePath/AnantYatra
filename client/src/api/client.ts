import axios from 'axios';
import { useAuthStore } from '../store/authStore';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'https://anantyatra.codesagepath.dev/api',
  timeout: 45000, // 45 second timeout for complex route computations (e.g. walk/cycle)
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Global handling for invalid/expired tokens
      useAuthStore.getState().logout();
      useAuthStore.getState().setShowAuthModal(true);
      error.customMessage = 'Your session has expired. Please log in again.';
    } else if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      error.customMessage = 'Server request timed out. Please try again.';
    } else if (!error.response) {
      error.customMessage = 'Backend server is unreachable. Please check your connection or server status.';
    }
    return Promise.reject(error);
  }
);

