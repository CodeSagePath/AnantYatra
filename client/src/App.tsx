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
    <div className={`h-screen w-screen overflow-hidden relative ${theme} bg-porcelain dark:bg-midnight-1 transition-colors duration-300`}>

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

      {/* ── Full-screen Map (Base Layer) ────────────────────── */}
      <div className="absolute inset-0 z-0">
        <MapView waypoints={waypoints}>
          {currentRoute && (
            <RoutePolyline encodedPolyline={currentRoute.polyline} />
          )}
        </MapView>
      </div>

      {/* ── Floating Route Planner (Overlay) ────────────────── */}
      <div className="absolute z-[1000] bottom-0 left-0 w-full md:w-[400px] md:top-4 md:left-4 md:bottom-auto max-h-[60vh] md:max-h-[calc(100vh-2rem)] flex flex-col gap-4 p-4 md:p-5 md:rounded-3xl rounded-t-3xl shadow-[0_-15px_40px_rgba(0,0,0,0.15)] md:shadow-2xl bg-white/95 dark:bg-midnight-2/95 backdrop-blur-3xl border border-slate-200 dark:border-white/10 transition-all duration-300 pointer-events-auto">
        
        {/* Mobile Drag Handle Indicator */}
        <div className="md:hidden flex justify-center pb-1 -mt-2">
          <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700/80 rounded-full"></div>
        </div>

        {/* App Header */}
        <div className="flex items-center justify-between shrink-0 mb-2">
          <div className="flex items-center gap-2">
            <Map className="w-6 h-6 text-evergreen dark:text-grapefruit" />
            <div className="flex flex-col justify-center">
              <h1 className="text-evergreen dark:text-porcelain font-extrabold tracking-tight text-[16px] transition-colors leading-none">AnantYatra</h1>
              <p className="text-[10px] text-evergreen/70 dark:text-porcelain/60 transition-colors font-medium mt-0.5">Infinite Journeys</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="text-evergreen dark:text-porcelain hover:bg-slate-100 dark:hover:bg-white/10 h-8 w-8 rounded-full transition-colors"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>

            {isAuthenticated ? (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-midnight-1/50 rounded-full px-3 py-1.5 border border-slate-200 dark:border-white/5 transition-colors">
                  <UserCircle className="w-3.5 h-3.5 text-evergreen dark:text-grapefruit shrink-0" />
                  <span className="text-xs font-semibold text-evergreen dark:text-porcelain transition-colors">
                    {user?.name || user?.email?.split('@')[0] || 'User'}
                  </span>
                </div>
                <Button
                  size="sm"
                  onClick={logout}
                  className="bg-red-500/10 hover:bg-red-500/20 text-red-500 dark:text-red-400 border border-red-500/20 text-xs h-8 rounded-full px-3 flex items-center gap-1.5 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign Out
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                onClick={() => setShowAuthModal(true)}
                className="bg-evergreen hover:bg-evergreen/90 dark:bg-grapefruit dark:hover:bg-grapefruit/90 text-porcelain text-xs h-8 rounded-full px-4 flex items-center gap-1.5 transition-colors shadow-sm"
              >
                <UserCircle className="w-4 h-4" />
                Sign In
              </Button>
            )}
          </div>
        </div>

        {/* Waypoint Manager */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0 relative">
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
    </div>
  );
}

export default App;
