import { useState } from 'react';
import { authApi } from '../api/endpoints';
import { useAuthStore } from '../store/authStore';

export const useAuth = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setAuth, logout } = useAuthStore();

  const login = async (data: any) => {
    setLoading(true);
    setError(null);
    try {
      const response = await authApi.login(data);
      setAuth(response.data.user, response.data.token);
      return true;
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login failed');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const register = async (data: any) => {
    setLoading(true);
    setError(null);
    try {
      const response = await authApi.register(data);
      setAuth(response.data.user, response.data.token);
      return true;
    } catch (err: any) {
      setError(err.response?.data?.error || 'Registration failed');
      return false;
    } finally {
      setLoading(false);
    }
  };

  return { login, register, logout, loading, error };
};
