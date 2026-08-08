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
import { SettingsModal } from './components/settings/SettingsModal';
import { InstallAppBanner } from './components/pwa/InstallAppBanner';
import { Button } from './components/ui/button';
import { LogOut, Map, UserCircle, X, Sun, Moon, Navigation, Shield, Car, Settings, ArrowLeft, Menu } from 'lucide-react';

function App() {
  const { isAuthenticated, user, logout, autoCheckinEnabled } = useAuthStore();
  const {
    slots,
    waypoints,
    currentRoute,
    costing,
    setCosting,
    loading: routeLoading,
    error,
    addSlot,
    insertSlot,
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
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [activeCheckin, setActiveCheckin] = useState<Checkin | null>(null);
  const [isMobileCollapsed, setIsMobileCollapsed] = useState(false);
  const [isMobileFocused, setIsMobileFocused] = useState(false);

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

  // Automatically record check-in and display user's location on map upon login
  useEffect(() => {
    if (isAuthenticated && autoCheckinEnabled && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          checkinApi.createCheckin({ latitude, longitude })
            .then((res) => {
              setActiveCheckin(res.data);
            })
            .catch(() => {
              // Silently ignore if offline
            });
        },
        () => {},
        { enableHighAccuracy: true, timeout: 8000 }
      );
    }
  }, [isAuthenticated, autoCheckinEnabled]);

  return (
    <div className={`h-screen w-screen overflow-hidden relative ${theme} bg-porcelain dark:bg-midnight-1 transition-colors duration-300`}>
      <InstallAppBanner />

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

      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
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

      {/* ── Floating Route Planner (Overlay / Mobile Bottom Sheet) ── */}
      <div className={`absolute z-[1000] bottom-0 left-0 w-full md:w-[420px] md:top-4 md:left-4 md:bottom-auto flex flex-col md:rounded-3xl rounded-t-[24px] shadow-[0_-8px_32px_rgba(0,0,0,0.18)] md:shadow-[0_8px_30px_rgb(0,0,0,0.12)] dark:md:shadow-[0_8px_30px_rgba(0,0,0,0.3)] bg-white dark:bg-[#1e2532] border-t border-slate-200/80 dark:border-white/5 transition-all duration-300 ease-out pointer-events-auto overflow-hidden ${
        isMobileFocused
          ? 'fixed inset-0 h-full max-h-full rounded-none z-[3000]'
          : isMobileCollapsed
          ? 'h-[64px]'
          : 'max-h-[80vh] md:max-h-[calc(100vh-2rem)]'
      }`}>

        {/* Mobile Handle + Collapsed Info */}
        <div
          onClick={() => setIsMobileCollapsed(!isMobileCollapsed)}
          className="md:hidden flex flex-col items-center pt-2 pb-1 shrink-0 cursor-pointer select-none"
        >
          <div className="w-9 h-[3px] bg-slate-300 dark:bg-slate-600 rounded-full" />
          {isMobileCollapsed && (
            <div className="flex items-center gap-2 mt-1.5 px-4">
              <span className="text-[13px] font-bold text-slate-800 dark:text-slate-100">
                {currentRoute
                  ? `${currentRoute.duration >= 60 ? `${Math.floor(currentRoute.duration / 60)}h ${Math.round(currentRoute.duration % 60)}m` : `${Math.round(currentRoute.duration)} min`}  ·  ${currentRoute.distance.toFixed(1)} km`
                  : 'AnantYatra — Route Planner'}
              </span>
              <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                Tap to open
              </span>
            </div>
          )}
        </div>

        {/* Inner scroll container — all the actual content lives here */}
        <div className="flex flex-col flex-1 min-h-0 px-3 pb-4 md:px-5 md:pb-5 gap-2.5 overflow-hidden">

        {/* Mobile Full Screen Top Bar (Google Maps style when focused) */}
        {isMobileFocused && (
          <div className="md:hidden flex items-center justify-between pt-2 pb-2.5 border-b border-slate-200 dark:border-slate-800 shrink-0 mb-1">
            <button
              onClick={() => {
                setIsMobileFocused(false);
                if (document.activeElement instanceof HTMLElement) {
                  document.activeElement.blur();
                }
              }}
              className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-porcelain bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-3.5 py-1.5 rounded-full transition-colors"
            >
              <ArrowLeft className="w-4 h-4 text-evergreen dark:text-grapefruit" />
              <span>Done / View Map</span>
            </button>
            <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Search Places</span>
          </div>
        )}

        {/* App Header */}
        {!isMobileFocused && (
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
                {/* Mobile Hamburger Menu */}
                <div className="md:hidden relative group">
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10">
                    <Menu className="w-4 h-4" />
                  </Button>
                  <div className="absolute right-0 top-full mt-1 w-40 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 p-1 opacity-0 pointer-events-none group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-all z-[5000]">
                    <button onClick={() => setShowCheckinModal(true)} className="w-full text-left px-3 py-2.5 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg flex items-center gap-2 font-medium">
                      <Navigation className="w-3.5 h-3.5 text-evergreen dark:text-grapefruit" /> Check In
                    </button>
                    <button onClick={() => setShowAdminModal(true)} className="w-full text-left px-3 py-2.5 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg flex items-center gap-2 font-medium">
                      <Shield className="w-3.5 h-3.5 text-evergreen dark:text-grapefruit" /> Admin
                    </button>
                    <button onClick={() => setShowSettingsModal(true)} className="w-full text-left px-3 py-2.5 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg flex items-center gap-2 font-medium">
                      <Settings className="w-3.5 h-3.5 text-evergreen dark:text-grapefruit" /> Settings
                    </button>
                    <button onClick={logout} className="w-full text-left px-3 py-2.5 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg flex items-center gap-2 font-medium">
                      <LogOut className="w-3.5 h-3.5" /> Logout
                    </button>
                  </div>
                </div>

                {/* Desktop Buttons */}
                <div className="hidden md:flex items-center gap-1.5">
                  <Button
                    size="sm"
                    onClick={() => setShowCheckinModal(true)}
                    className="bg-evergreen hover:bg-evergreen/90 dark:bg-grapefruit dark:hover:bg-grapefruit/90 text-white text-xs h-8 rounded-full px-3 flex items-center gap-1 shadow-sm transition-colors"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                    <span>Check In</span>
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowAdminModal(true)}
                    className="text-slate-700 dark:text-slate-300 border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 text-xs h-8 rounded-full px-2.5 flex items-center gap-1 transition-colors"
                  >
                    <Shield className="w-3.5 h-3.5 text-evergreen dark:text-grapefruit" />
                    <span>Admin</span>
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowSettingsModal(true)}
                    className="text-slate-700 dark:text-slate-300 border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 text-xs h-8 rounded-full px-2.5 flex items-center gap-1 transition-colors"
                  >
                    <Settings className="w-3.5 h-3.5 text-evergreen dark:text-grapefruit" />
                    <span>Settings</span>
                  </Button>

                  <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-midnight-1/50 rounded-full px-2.5 py-1 border border-slate-200 dark:border-white/5 transition-colors">
                    <UserCircle className="w-3.5 h-3.5 text-evergreen dark:text-grapefruit shrink-0" />
                    <span className="text-[11px] font-semibold text-evergreen dark:text-porcelain transition-colors max-w-[70px] truncate">
                      {user?.name || user?.email?.split('@')[0] || 'User'}
                    </span>
                  </div>

                  <Button
                    size="sm"
                    onClick={logout}
                    className="bg-red-500/10 hover:bg-red-500/20 text-red-500 dark:text-red-400 border border-red-500/20 text-xs h-8 rounded-full px-2.5 flex items-center transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </Button>
                </div>
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
        )}

        {/* Waypoint Manager */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0 relative">
          <WaypointList
            slots={slots}
            addSlot={addSlot}
            insertSlot={insertSlot}
            updateSlot={updateSlot}
            removeSlot={removeSlot}
            reorderSlots={reorderSlots}
            loading={routeLoading}
            currentRoute={currentRoute}
            error={error}
            costing={costing}
            setCosting={setCosting}
            isMobileFocused={isMobileFocused}
            onInputFocus={() => setIsMobileFocused(true)}
            onLoadRoute={(saved: SavedItem) => {
              if (saved.slots) {
                const validWps = saved.slots.map((s) => s.waypoint).filter(Boolean) as Waypoint[];
                loadSavedWaypoints(validWps);
              }
            }}
          />
        </div>
        </div>{/* close inner scroll container */}
      </div>{/* close bottom sheet */}
    </div>
  );
}

export default App;
