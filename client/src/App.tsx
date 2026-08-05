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
import { LogOut, Map } from 'lucide-react';

function App() {
  const { isAuthenticated, user, logout } = useAuthStore();
  const { waypoints, currentRoute, loading: routeLoading, addWaypoint, removeWaypoint, calculateRoute } = useRoute();
  
  const [showLogin, setShowLogin] = useState(true);

  // If not authenticated, show the login/register screen with a beautiful blurred background
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center relative overflow-hidden">
        {/* Background Decorative Blobs */}
        <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-indigo-600/30 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-purple-600/30 rounded-full blur-[100px] pointer-events-none" />
        
        <div className="z-10 w-full flex justify-center p-4">
          {showLogin ? (
            <LoginForm 
              onSuccess={() => {}} 
              onToggleForm={() => setShowLogin(false)} 
            />
          ) : (
            <RegisterForm 
              onSuccess={() => {}} 
              onToggleForm={() => setShowLogin(true)} 
            />
          )}
        </div>
      </div>
    );
  }

  // Main Dashboard View
  return (
    <div className="h-screen w-screen bg-slate-950 flex overflow-hidden">
      {/* Sidebar Layout */}
      <div className="w-[400px] h-full flex flex-col gap-4 p-4 z-10 shrink-0 relative">
        {/* Header */}
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-4 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500 rounded-lg">
              <Map className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-white font-bold tracking-tight">AnantYatra</h1>
              <p className="text-xs text-indigo-300">Welcome, {user?.name || 'Explorer'}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={logout} className="text-indigo-200 hover:text-white hover:bg-white/10">
            <LogOut className="w-5 h-5" />
          </Button>
        </div>

        {/* Waypoints Sidebar */}
        <div className="flex-1 overflow-hidden">
          <WaypointList 
            waypoints={waypoints}
            onRemove={removeWaypoint}
            onCalculateRoute={() => calculateRoute("My Journey")}
            loading={routeLoading}
          />
        </div>
      </div>

      {/* Main Map Area */}
      <div className="flex-1 h-full p-4 pl-0 relative">
        {/* Search Bar overlaid on top of map */}
        <div className="absolute top-8 left-8 z-[1000] w-96">
          <SearchBar onSelectWaypoint={addWaypoint} />
        </div>

        {/* Map Instance */}
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
