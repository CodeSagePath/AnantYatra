import { useState } from 'react';
import { useAuthStore } from './store/authStore';
import { useRoute } from './hooks/useRoute';
import { useThemeStore } from './store/themeStore';
import type { Waypoint } from './types';

import { LoginForm } from './components/auth/LoginForm';
import { RegisterForm } from './components/auth/RegisterForm';
import { MapView } from './components/map/MapView';
import { RoutePolyline } from './components/map/RoutePolyline';
import { WaypointList, type SavedItem } from './components/waypoints/WaypointList';
import { Button } from './components/ui/button';
import { LogOut, Map, UserCircle, X, Sun, Moon } from 'lucide-react';
import { useEffect } from 'react';

function App() {
  const { isAuthenticated, user, logout } = useAuthStore();
  const {
    slots,
    waypoints,
    currentRoute,
    loading: routeLoading,
    error,
    addSlot,
    updateSlot,
    removeSlot,
    reorderSlots,
    loadSavedWaypoints,
  } = useRoute();

  const { theme, toggleTheme } = useThemeStore();

  useEffect(() => {
    // Also sync the theme to document body so external things like modals have the class context
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showLogin, setShowLogin] = useState(true);

  return (
    <div className={`h-screen w-screen flex overflow-hidden relative ${theme} bg-porcelain dark:bg-midnight-1 transition-colors duration-300`}>

      {/* ── Auth Modal overlay ──────────────────────────────── */}
      {showAuthModal && (
        <div className="absolute inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="relative">
            <button
              onClick={() => setShowAuthModal(false)}
              className="absolute -top-3 -right-3 z-10 w-8 h-8 bg-slate-800 hover:bg-slate-700 border border-white/10 rounded-full flex items-center justify-center text-white/70 hover:text-white transition-all"
            >
              <X className="w-4 h-4" />
            </button>
            {showLogin ? (
              <LoginForm
                onSuccess={() => setShowAuthModal(false)}
                onToggleForm={() => setShowLogin(false)}
              />
            ) : (
              <RegisterForm
                onSuccess={() => setShowAuthModal(false)}
                onToggleForm={() => setShowLogin(true)}
              />
            )}
          </div>
        </div>
      )}

      {/* ── Left Sidebar ──────────────────────────────────── */}
      <div className="w-[360px] h-full flex flex-col gap-3 p-4 z-10 shrink-0 relative">
        {/* App Header */}
        <div className="bg-white/80 dark:bg-midnight-2/80 backdrop-blur-xl border border-slate-200 dark:border-white/10 rounded-2xl px-4 py-3 flex items-center justify-between shadow-lg transition-colors duration-300">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-evergreen dark:bg-grapefruit rounded-lg transition-colors">
              <Map className="w-5 h-5 text-porcelain" />
            </div>
            <div>
              <h1 className="text-evergreen dark:text-porcelain font-bold tracking-tight text-sm transition-colors">AnantYatra</h1>
              <p className="text-[11px] text-evergreen/60 dark:text-porcelain/60 transition-colors">Infinite Journeys</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="text-evergreen dark:text-porcelain hover:bg-slate-200 dark:hover:bg-white/10 h-8 w-8 transition-colors"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>

            {isAuthenticated ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-evergreen/80 dark:text-porcelain/80 truncate max-w-[80px] transition-colors">{user?.email}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={logout}
                  className="text-evergreen dark:text-porcelain hover:bg-slate-200 dark:hover:bg-white/10 h-8 w-8 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                onClick={() => setShowAuthModal(true)}
                className="bg-evergreen hover:bg-evergreen/90 dark:bg-grapefruit dark:hover:bg-grapefruit/90 text-porcelain text-xs h-8 flex items-center gap-1.5 transition-colors"
              >
                <UserCircle className="w-4 h-4" />
                Sign In
              </Button>
            )}
          </div>
        </div>

        {/* Waypoint Manager */}
        <div className="flex-1 overflow-hidden">
          <WaypointList
            slots={slots}
            addSlot={addSlot}
            updateSlot={updateSlot}
            removeSlot={removeSlot}
            reorderSlots={reorderSlots}
            loading={routeLoading}
            currentRoute={currentRoute}
            error={error}
            onLoadRoute={(saved: SavedItem) => {
              if (saved.slots) {
                const validWps = saved.slots.map((s) => s.waypoint).filter(Boolean) as Waypoint[];
                loadSavedWaypoints(validWps);
              }
            }}
          />
        </div>
      </div>

      {/* ── Full-screen Map ──────────────────────────────────── */}
      <div className="flex-1 h-full relative">
        <MapView waypoints={waypoints}>
          {currentRoute && (
            <RoutePolyline encodedPolyline={currentRoute.polyline} />
          )}
        </MapView>
      </div>
    </div>
  );
}

export default App;
