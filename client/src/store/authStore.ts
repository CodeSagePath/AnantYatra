import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '../types';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  autoCheckinEnabled: boolean;
  showAuthModal: boolean;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
  setAutoCheckinEnabled: (enabled: boolean) => void;
  setShowAuthModal: (show: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      autoCheckinEnabled: true,
      showAuthModal: false,
      setAuth: (user, token) => {
        localStorage.setItem('token', token); // Also saving in raw localStorage for axios interceptor
        set({ user, token, isAuthenticated: true });
      },
      logout: () => {
        localStorage.removeItem('token');
        localStorage.removeItem('anantyatra_saved_routes');
        localStorage.removeItem('anantyatra_current_draft_route');
        localStorage.removeItem('anantyatra_recent_searches');
        set({ user: null, token: null, isAuthenticated: false });
      },
      setAutoCheckinEnabled: (enabled) => set({ autoCheckinEnabled: enabled }),
      setShowAuthModal: (show) => set({ showAuthModal: show }),
    }),
    { name: 'auth-storage' }
  )
);
