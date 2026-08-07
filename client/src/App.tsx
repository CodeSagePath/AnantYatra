import { useState, useEffect } from 'react';
import { useAuthStore } from './store/authStore';
import { useRoute } from './hooks/useRoute';
import { useThemeStore } from './store/themeStore';
import type { Waypoint, Checkin } from './types';
import { checkinApi } from './api/endpoints';

import { LoginForm } from './components/auth/LoginForm';
import { RegisterForm } from './components/auth/RegisterForm';
import { MapView } from './components/map/MapView';
import { RoutePolyline } from './components/map/RoutePolyline';
import { CarMarker } from './components/map/CarMarker';
import { WaypointList, type SavedItem } from './components/waypoints/WaypointList';
import { CheckinModal } from './components/checkin/CheckinModal';
import { AdminDashboardModal } from './components/admin/AdminDashboardModal';
import { Button } from './components/ui/button';
import { LogOut, Map, UserCircle, X, Sun, Moon, Navigation, Shield, Car } from 'lucide-react';

function App() {
  const { isAuthenticated, user, logout } = useAuthStore();
  const {
    slots,
    waypoints,
    currentRoute,
    costing,
    setCosting,
    loading: routeLoading,
    error,
    addSlot,
    updateSlot,
    removeSlot,
    reorderSlots,
    loadSavedWaypoints,
  } = useRoute();

  const { theme, toggleTheme } = useThemeStore();

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showLogin, setShowLogin] = useState(true);
  const [showCheckinModal, setShowCheckinModal] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [activeCheckin, setActiveCheckin] = useState<Checkin | null>(null);

  useEffect(() => {
    // Sync theme to document element
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Handle shared check-in URL query parameter (?checkin=<shareToken>)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const shareToken = urlParams.get('checkin');
    if (shareToken) {
      checkinApi.getSharedCheckin(shareToken)
        .then((res) => {
          setActiveCheckin(res.data);
        })
        .catch(() => {
          // Ignore invalid share link
        });
    }
  }, []);

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

      {/* ── Checkin & Admin Modals ───────────────────────────── */}
      <CheckinModal
        isOpen={showCheckinModal}
        onClose={() => setShowCheckinModal(false)}
      />

      <AdminDashboardModal
        isOpen={showAdminModal}
        onClose={() => setShowAdminModal(false)}
        onSelectCheckinOnMap={(checkin) => {
          setActiveCheckin(checkin);
        }}
      />

      {/* ── Full-screen Map (Base Layer) ────────────────────── */}
      <div className="absolute inset-0 z-0">
        <MapView
          waypoints={waypoints}
          centerLocation={activeCheckin ? [activeCheckin.latitude, activeCheckin.longitude] : null}
        >
          {currentRoute && (
            <RoutePolyline encodedPolyline={currentRoute.polyline} />
          )}
          {activeCheckin && (
            <CarMarker checkin={activeCheckin} />
          )}
        </MapView>
      </div>

      {/* Active Shared Location Alert Card */}
      {activeCheckin && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-white/90 dark:bg-midnight-2/90 backdrop-blur-md border border-slate-200 dark:border-white/10 px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-porcelain animate-bounce">
          <Car className="w-4 h-4 text-grapefruit shrink-0" />
          <span>Tracking: {activeCheckin.user?.email || 'Check-in Location'}</span>
          <button
            onClick={() => setActiveCheckin(null)}
            className="ml-1 text-slate-400 hover:text-slate-600 dark:hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ── Floating Route Planner (Overlay) ────────────────── */}
      <div className="absolute z-[1000] bottom-0 left-0 w-full md:w-[400px] md:top-4 md:left-4 md:bottom-auto max-h-[78vh] md:max-h-[calc(100vh-2rem)] flex flex-col gap-3 p-3.5 md:p-5 md:rounded-3xl rounded-t-3xl shadow-[0_-15px_40px_rgba(0,0,0,0.25)] md:shadow-2xl bg-white/95 dark:bg-midnight-2/95 backdrop-blur-3xl border border-slate-200 dark:border-white/10 transition-all duration-300 pointer-events-auto">
        
        {/* Mobile Drag Handle Indicator */}
        <div className="md:hidden flex justify-center pb-0.5 -mt-1 shrink-0">
          <div className="w-10 h-1 bg-slate-300 dark:bg-slate-700 rounded-full"></div>
        </div>

        {/* App Header */}
        <div className="flex items-center justify-between shrink-0 mb-1">
          <div className="flex items-center gap-2">
            <Map className="w-5 h-5 md:w-6 md:h-6 text-evergreen dark:text-grapefruit shrink-0" />
            <div className="flex flex-col justify-center">
              <h1 className="text-evergreen dark:text-porcelain font-extrabold tracking-tight text-sm md:text-[16px] transition-colors leading-none">AnantYatra</h1>
              <p className="text-[9px] md:text-[10px] text-evergreen/70 dark:text-porcelain/60 transition-colors font-medium mt-0.5">Infinite Journeys</p>
            </div>
          </div>

          <div className="flex items-center gap-1 md:gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="text-evergreen dark:text-porcelain hover:bg-slate-100 dark:hover:bg-white/10 h-7 w-7 md:h-8 md:w-8 rounded-full transition-colors shrink-0"
            >
              {theme === 'dark' ? <Sun className="w-3.5 h-3.5 md:w-4 md:h-4" /> : <Moon className="w-3.5 h-3.5 md:w-4 md:h-4" />}
            </Button>

            {isAuthenticated ? (
              <div className="flex items-center gap-1 md:gap-1.5">
                <Button
                  size="sm"
                  onClick={() => setShowCheckinModal(true)}
                  className="bg-evergreen hover:bg-evergreen/90 dark:bg-grapefruit dark:hover:bg-grapefruit/90 text-white text-[11px] md:text-xs h-7 md:h-8 rounded-full px-2.5 md:px-3 flex items-center gap-1 transition-colors shadow-sm"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>Check In</span>
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowAdminModal(true)}
                  className="text-slate-700 dark:text-slate-300 border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 text-[11px] md:text-xs h-7 md:h-8 rounded-full px-2.5 flex items-center gap-1 transition-colors"
                >
                  <Shield className="w-3.5 h-3.5 text-evergreen dark:text-grapefruit" />
                  <span className="hidden sm:inline">Admin</span>
                </Button>

                <div className="hidden sm:flex items-center gap-1.5 bg-slate-100 dark:bg-midnight-1/50 rounded-full px-2.5 py-1 border border-slate-200 dark:border-white/5 transition-colors">
                  <UserCircle className="w-3.5 h-3.5 text-evergreen dark:text-grapefruit shrink-0" />
                  <span className="text-[11px] font-semibold text-evergreen dark:text-porcelain transition-colors max-w-[70px] truncate">
                    {user?.name || user?.email?.split('@')[0] || 'User'}
                  </span>
                </div>

                <Button
                  size="sm"
                  onClick={logout}
                  className="bg-red-500/10 hover:bg-red-500/20 text-red-500 dark:text-red-400 border border-red-500/20 text-[11px] md:text-xs h-7 md:h-8 rounded-full px-2 md:px-2.5 flex items-center gap-1 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                onClick={() => setShowAuthModal(true)}
                className="bg-evergreen hover:bg-evergreen/90 dark:bg-grapefruit dark:hover:bg-grapefruit/90 text-porcelain text-[11px] md:text-xs h-7 md:h-8 rounded-full px-3 md:px-4 flex items-center gap-1.5 transition-colors shadow-sm"
              >
                <UserCircle className="w-3.5 h-3.5 md:w-4 md:h-4" />
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
            costing={costing}
            setCosting={setCosting}
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
