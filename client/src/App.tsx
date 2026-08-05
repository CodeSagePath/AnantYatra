import { useState } from 'react';
import { useAuthStore } from './store/authStore';
import { useRoute } from './hooks/useRoute';

import { LoginForm } from './components/auth/LoginForm';
import { RegisterForm } from './components/auth/RegisterForm';
import { MapView } from './components/map/MapView';
import { SearchBar } from './components/map/SearchBar';
import { RoutePolyline } from './components/map/RoutePolyline';
import { WaypointList } from './components/waypoints/WaypointList';
import { Button } from './components/ui/button';
import { LogOut, Map, UserCircle, X } from 'lucide-react';

function App() {
  const { isAuthenticated, user, logout } = useAuthStore();
  const {
    waypoints,
    currentRoute,
    loading: routeLoading,
    addWaypoint,
    removeWaypoint,
    calculateRoute,
    setWaypoints,
  } = useRoute();

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showLogin, setShowLogin] = useState(true);

  return (
    <div className="h-screen w-screen bg-slate-950 flex overflow-hidden relative">

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
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl px-4 py-3 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500 rounded-lg">
              <Map className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-white font-bold tracking-tight text-sm">AnantYatra</h1>
              <p className="text-[11px] text-indigo-300">Infinite Journeys</p>
            </div>
          </div>

          {isAuthenticated ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-indigo-200 truncate max-w-[80px]">{user?.email}</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={logout}
                className="text-indigo-200 hover:text-white hover:bg-white/10 h-8 w-8"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              onClick={() => setShowAuthModal(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-8 flex items-center gap-1.5"
            >
              <UserCircle className="w-4 h-4" />
              Sign In
            </Button>
          )}
        </div>

        {/* Waypoint Manager */}
        <div className="flex-1 overflow-hidden">
          <WaypointList
            waypoints={waypoints}
            onRemove={removeWaypoint}
            onCalculateRoute={() => calculateRoute('My Journey')}
            loading={routeLoading}
            currentRoute={currentRoute}
            onLoadRoute={(saved) => setWaypoints(saved.waypoints)}
          />
        </div>
      </div>

      {/* ── Full-screen Map ──────────────────────────────────── */}
      <div className="flex-1 h-full relative">
        {/* Search bar floating on top of the map */}
        <div className="absolute top-5 left-1/2 -translate-x-1/2 z-[1000] w-96">
          <SearchBar onSelectWaypoint={addWaypoint} />
        </div>

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
