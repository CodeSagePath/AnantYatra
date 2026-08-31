import { useState, useEffect } from 'react';
import { useAuthStore } from './store/authStore';
import { useRoute } from './hooks/useRoute';
import { useThemeStore } from './store/themeStore';
import type { Checkin, Route } from './types';
import { checkinApi } from './api/endpoints';
import { reverseGeocodeClient } from './utils/location';

import { LoginForm } from './components/auth/LoginForm';
import { RegisterForm } from './components/auth/RegisterForm';
import { MapView } from './components/map/MapView';
import { RoutePolyline } from './components/map/RoutePolyline';
import { CarMarker } from './components/map/CarMarker';
import { WaypointList } from './components/waypoints/WaypointList';
import { CheckinModal } from './components/checkin/CheckinModal';
import { AdminDashboardModal } from './components/admin/AdminDashboardModal';
import { SettingsModal } from './components/settings/SettingsModal';
import { InstallAppBanner } from './components/pwa/InstallAppBanner';
import { Button } from './components/ui/button';
import { SharedTripView } from './components/shared/SharedTripView';
import { LogOut, UserCircle, X, Sun, Moon, Navigation, Shield, Settings, ArrowLeft, Menu, Compass, MapPin, ChevronDown, ChevronUp } from 'lucide-react';

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
    startDate,
    endDate,
    isEndDateManuallySet,
    totalPlannedNights,
    setStartDate,
    setEndDate,
    clearDates,
    recalculateDownstreamDates,
    clearDownstreamDates,
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
  const [userCheckins, setUserCheckins] = useState<Checkin[]>([]);
  const [showCheckinTrail, setShowCheckinTrail] = useState<boolean>(true);

  useEffect(() => {
    if (isAuthenticated) {
      checkinApi.getMyCheckins()
        .then((res) => setUserCheckins(res.data))
        .catch(() => setUserCheckins([]));
    } else {
      setUserCheckins([]);
    }
  }, [isAuthenticated]);
  const [sharedTripToken, setSharedTripToken] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get('trip') || new URLSearchParams(window.location.search).get('share')
  );
  const [sharedRouteData, setSharedRouteData] = useState<Route | null>(null);
  const [isMobileCollapsed, setIsMobileCollapsed] = useState(false);
  const [isMobileFocused, setIsMobileFocused] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartY(e.touches[0].clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartY === null) return;
    const currentY = e.touches[0].clientY;
    const diffY = currentY - touchStartY;

    if (diffY > 30 && !isMobileCollapsed) {
      setIsMobileCollapsed(true);
      setTouchStartY(null);
    } else if (diffY < -30 && isMobileCollapsed) {
      setIsMobileCollapsed(false);
      setTouchStartY(null);
    }
  };

  const handleTouchEnd = () => {
    setTouchStartY(null);
  };

  useEffect(() => {
    // Sync theme to document element
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Global 401 Unauthorized Interceptor listener
  useEffect(() => {
    const handleUnauthorized = () => {
      logout();
      setShowAuthModal(true);
    };
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, [logout]);

  // Handle shared check-in URL query parameter (?checkin=<shareToken>)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const checkinToken = urlParams.get('checkin');

    if (checkinToken) {
      checkinApi.getSharedCheckin(checkinToken)
        .then((res) => {
          setActiveCheckin(res.data);
        })
        .catch(() => {
          // Ignore invalid share link
        });
    }
  }, []);

  // Background Location Tracker (On Open + Every 30 Mins + On Foreground Resume)
  useEffect(() => {
    if (!isAuthenticated || !autoCheckinEnabled || !navigator.geolocation) return;

    let isTracking = false;

    const trackLocation = () => {
      if (isTracking) return;
      isTracking = true;

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          isTracking = false;
          const { latitude, longitude } = position.coords;
          try {
            const placeName = await reverseGeocodeClient(latitude, longitude);
            
            const res = await checkinApi.createCheckin({ 
              latitude, 
              longitude, 
              address: placeName || undefined 
            });
            
            setActiveCheckin(prev => prev || res.data);
          } catch {
            // Silently ignore API failures
          }
        },
        (error) => {
          isTracking = false;
          console.warn('Geolocation error:', error.message);
          if (error.code === error.PERMISSION_DENIED) {
            console.warn('User denied location permissions. Background tracking disabled.');
          }
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    };

    // 1. Trigger immediately on app open / successful login
    trackLocation();

    // 2. Trigger periodically every 30 minutes (30 * 60 * 1000 ms)
    const intervalId = setInterval(trackLocation, 30 * 60 * 1000);

    // 3. Trigger immediately when app comes back to foreground (since mobile OS pauses intervals)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        trackLocation();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
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
          waypoints={sharedRouteData ? sharedRouteData.waypoints : waypoints}
          checkins={showCheckinTrail ? userCheckins : []}
          startDate={sharedRouteData ? (sharedRouteData.startDate || null) : startDate}
          centerLocation={activeCheckin ? [activeCheckin.latitude, activeCheckin.longitude] : null}
        >
          {sharedRouteData ? (
            <RoutePolyline encodedPolyline={sharedRouteData.polyline} />
          ) : (
            currentRoute && <RoutePolyline encodedPolyline={currentRoute.polyline} />
          )}
          {activeCheckin && (
            <CarMarker checkin={activeCheckin} />
          )}
        </MapView>

        {/* Floating Check-in Trail Toggle Button */}
        {isAuthenticated && userCheckins.length > 0 && (
          <div className="absolute top-4 right-14 z-[1000]">
            <button
              onClick={() => setShowCheckinTrail(!showCheckinTrail)}
              title={showCheckinTrail ? 'Hide Check-in Trail' : 'Show Check-in Trail'}
              className={`h-9 px-3 rounded-full flex items-center gap-1.5 text-xs font-bold shadow-lg backdrop-blur-md transition-all border ${
                showCheckinTrail
                  ? 'bg-emerald-600 text-white border-emerald-500 hover:bg-emerald-700'
                  : 'bg-white/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800'
              }`}
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>{showCheckinTrail ? 'Trail On' : 'Trail Off'}</span>
            </button>
          </div>
        )}
      </div>

      {/* ── Floating Route Planner (Overlay / Mobile Bottom Sheet) ── */}
      {!sharedTripToken && (
        <div className={`absolute z-[1000] bottom-0 left-0 w-full md:w-[420px] md:top-4 md:left-4 md:bottom-auto flex flex-col md:rounded-3xl rounded-t-[24px] shadow-[0_-8px_32px_rgba(0,0,0,0.18)] md:shadow-[0_8px_30px_rgb(0,0,0,0.12)] dark:md:shadow-[0_8px_30px_rgba(0,0,0,0.3)] bg-white dark:bg-[#1e2532] border-t md:border border-slate-200/80 dark:border-white/5 transition-all duration-300 ease-out pointer-events-auto overflow-hidden ${
          isMobileFocused
            ? 'fixed inset-0 h-full max-h-full rounded-none z-[3000]'
            : isMobileCollapsed
            ? 'h-[64px]'
            : 'max-h-[72vh] md:max-h-[calc(100vh-2rem)]'
        }`}>

        {/* Mobile Handle + Collapsed/Expanded Info + Touch Swipe Handle */}
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onClick={() => setIsMobileCollapsed(!isMobileCollapsed)}
          className="md:hidden flex flex-col items-center pt-2.5 pb-1.5 shrink-0 cursor-pointer select-none border-b border-slate-100 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
        >
          <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-600 rounded-full mb-1" />
          
          {isMobileCollapsed ? (
            <div className="flex items-center justify-between w-full px-4 py-0.5">
              <div className="flex items-center gap-2 min-w-0">
                <Compass className="w-4 h-4 text-evergreen dark:text-grapefruit shrink-0" />
                <span className="text-[13px] font-bold text-slate-800 dark:text-slate-100 truncate">
                  {currentRoute
                    ? `${currentRoute.duration >= 60 ? `${Math.floor(currentRoute.duration / 60)}h ${Math.round(currentRoute.duration % 60)}m` : `${Math.round(currentRoute.duration)} min`}  ·  ${currentRoute.distance.toFixed(1)} km`
                    : 'AnantYatra — Route Planner'}
                </span>
              </div>
              <span className="text-[11px] font-bold text-evergreen dark:text-grapefruit bg-evergreen/10 dark:bg-grapefruit/10 px-2.5 py-1 rounded-full flex items-center gap-1 shrink-0">
                <ChevronUp className="w-3.5 h-3.5" />
                Planner
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-between w-full px-4 py-0.5 text-slate-500 dark:text-slate-400">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Swipe down to view map</span>
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-full flex items-center gap-1">
                <ChevronDown className="w-3.5 h-3.5 text-evergreen dark:text-grapefruit" />
                View Map
              </span>
            </div>
          )}
        </div>

        {/* Inner scroll container — all the actual content lives here */}
        <div className="flex flex-col flex-1 min-h-0 px-4 pb-4 pt-3 md:px-5 md:pb-5 md:pt-4 gap-2.5 overflow-hidden">

        {/* Mobile Full Screen Top Bar (Google Maps style when focused) */}
        {isMobileFocused && (
          <div className="md:hidden flex items-center justify-between pt-2 pb-2.5 border-b border-slate-200 dark:border-slate-800 shrink-0 mb-1">
            <button
              onClick={() => {
                setIsMobileFocused(false);
                setIsMobileCollapsed(true);
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
        <div className="flex items-center justify-between shrink-0 mb-2">
          <div className="flex items-center gap-2.5 shrink-0">
            <Compass className="w-5 h-5 md:w-6 md:h-6 text-evergreen dark:text-grapefruit shrink-0" />
            <div className="flex flex-col justify-center">
              <h1 className="text-evergreen dark:text-porcelain font-extrabold tracking-tight text-sm md:text-[16px] transition-colors leading-none">AnantYatra</h1>
              <p className="text-[9px] md:text-[10px] text-evergreen/70 dark:text-porcelain/60 transition-colors font-medium mt-0.5">Infinite Journeys</p>
            </div>
          </div>

          <div className="flex items-center gap-1 md:gap-1.5 shrink-0">
            {/* Mobile Slide-Down Map Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsMobileCollapsed(true)}
              className="md:hidden text-[11px] font-bold text-slate-700 dark:text-porcelain bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 h-7 px-2.5 rounded-full transition-colors shrink-0 flex items-center gap-1"
            >
              <ChevronDown className="w-3.5 h-3.5 text-evergreen dark:text-grapefruit" />
              <span>Map</span>
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="text-evergreen dark:text-porcelain hover:bg-slate-100 dark:hover:bg-white/10 h-7 w-7 md:h-8 md:w-8 rounded-full transition-colors shrink-0"
            >
              {theme === 'dark' ? <Sun className="w-3.5 h-3.5 md:w-4 md:h-4" /> : <Moon className="w-3.5 h-3.5 md:w-4 md:h-4" />}
            </Button>
            
            {/* Hamburger Menu Toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsMenuOpen(true)}
              className="text-evergreen dark:text-porcelain hover:bg-slate-100 dark:hover:bg-white/10 h-7 w-7 md:h-8 md:w-8 rounded-full transition-colors shrink-0"
            >
              <Menu className="w-4 h-4 md:w-5 md:h-5" />
            </Button>
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
            checkins={userCheckins}
            error={error}
            costing={costing}
            setCosting={setCosting}
            startDate={startDate}
            endDate={endDate}
            isEndDateManuallySet={isEndDateManuallySet}
            totalPlannedNights={totalPlannedNights}
            setStartDate={setStartDate}
            setEndDate={setEndDate}
            clearDates={clearDates}
            recalculateDownstreamDates={recalculateDownstreamDates}
            clearDownstreamDates={clearDownstreamDates}
            isMobileFocused={isMobileFocused}
            onOpenAuthModal={() => setShowAuthModal(true)}
            onInputFocus={() => {
              if (window.innerWidth < 768) {
                setIsMobileFocused(true);
              }
            }}
            onLoadRoute={(saved: Route) => {
              if (saved.waypoints) {
                loadSavedWaypoints(saved.waypoints);
                if (saved.costing) {
                  setCosting(saved.costing);
                }
                if (saved.startDate) setStartDate(saved.startDate);
                if (saved.endDate) setEndDate(saved.endDate);
              }
            }}
          />
        </div>
        </div>{/* close inner scroll container */}
      </div>
      )}{/* close bottom sheet & conditional planner */}

      {/* Shared Trip View Side Panel Drawer */}
      {sharedTripToken && (
        <SharedTripView
          shareToken={sharedTripToken}
          currentUserId={user?.id}
          activeWaypointsCount={waypoints.length}
          onRouteLoaded={(route) => setSharedRouteData(route)}
          onLoadRouteToPlanner={(saved: Route) => {
            if (saved.waypoints) {
              loadSavedWaypoints(saved.waypoints);
              if (saved.costing) setCosting(saved.costing);
              if (saved.startDate) setStartDate(saved.startDate);
              if (saved.endDate) setEndDate(saved.endDate);
            }
          }}
          onClose={() => {
            setSharedTripToken(null);
            setSharedRouteData(null);
            // Clean URL query param without full page refresh
            const newUrl = window.location.pathname;
            window.history.replaceState({}, '', newUrl);
          }}
        />
      )}

      {/* ── Slide-Out Menu Drawer ── */}
      {/* Overlay */}
      <div 
        className={`fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[4000] transition-opacity duration-300 ${isMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setIsMenuOpen(false)}
      />
      
      {/* Drawer */}
      <div className={`fixed top-0 bottom-0 w-[280px] bg-white dark:bg-[#1e2532] shadow-[0_0_40px_rgba(0,0,0,0.3)] z-[4001] transition-transform duration-300 ease-out flex flex-col 
        left-0 md:left-auto md:right-0
        ${isMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-full'}
      `}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <span className="font-bold text-slate-800 dark:text-porcelain text-[16px]">Menu</span>
          <button onClick={() => setIsMenuOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-full transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {isAuthenticated ? (
            <>
              {/* User Info */}
              <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl mb-4 border border-slate-100 dark:border-slate-700/50 flex items-center gap-3">
                <UserCircle className="w-8 h-8 text-evergreen dark:text-grapefruit shrink-0" />
                <div className="flex flex-col min-w-0">
                  <span className="text-[14px] font-bold text-slate-800 dark:text-slate-100 truncate">
                    {user?.name || user?.email?.split('@')[0] || 'User'}
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{user?.email}</span>
                </div>
              </div>

              <button 
                onClick={() => { setIsMenuOpen(false); setShowCheckinModal(true); }}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-[14px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/80 rounded-xl transition-colors"
              >
                <Navigation className="w-4 h-4 text-evergreen dark:text-grapefruit" />
                Check In
              </button>
              
              {user?.role === 'ADMIN' && (
                <button 
                  onClick={() => { setIsMenuOpen(false); setShowAdminModal(true); }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-[14px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/80 rounded-xl transition-colors"
                >
                  <Shield className="w-4 h-4 text-evergreen dark:text-grapefruit" />
                  Admin Dashboard
                </button>
              )}

              <button 
                onClick={() => { setIsMenuOpen(false); setShowSettingsModal(true); }}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-[14px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/80 rounded-xl transition-colors"
              >
                <Settings className="w-4 h-4 text-evergreen dark:text-grapefruit" />
                Settings
              </button>
              
              <hr className="border-slate-100 dark:border-slate-800 my-4" />

              <button 
                onClick={() => { setIsMenuOpen(false); logout(); }}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-[14px] font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center pt-8 pb-4 text-center">
              <UserCircle className="w-12 h-12 text-slate-300 dark:text-slate-600 mb-3" />
              <p className="text-[13px] text-slate-500 dark:text-slate-400 mb-6">Sign in to save trips and access settings.</p>
              <Button
                onClick={() => { setIsMenuOpen(false); setShowAuthModal(true); }}
                className="w-full bg-evergreen hover:bg-evergreen/90 dark:bg-grapefruit dark:hover:bg-grapefruit/90 text-white rounded-xl h-11 font-bold shadow-md"
              >
                Sign In / Create Account
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
