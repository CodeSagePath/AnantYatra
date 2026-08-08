import axios from 'axios';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5005/api',
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
    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      error.customMessage = 'Server request timed out. Please try again.';
    } else if (!error.response) {
      error.customMessage = 'Backend server is unreachable. Please check your connection or server status.';
    }
    return Promise.reject(error);
  }
);

