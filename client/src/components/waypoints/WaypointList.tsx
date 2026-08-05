import React, { useState } from 'react';
import type { Waypoint, Route } from '../../types';
import { MapPin, X, GripVertical, Bookmark, Save, Trash2, Navigation } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

interface WaypointListProps {
  waypoints: Waypoint[];
  onRemove: (index: number) => void;
  onCalculateRoute: () => void;
  loading: boolean;
  currentRoute: Route | null;
  onLoadRoute?: (route: Route) => void;
}

interface SavedItem {
  id: string;
  name: string;
  waypoints: Waypoint[];
  createdAt: string;
}

export const WaypointList: React.FC<WaypointListProps> = ({
  waypoints,
  onRemove,
  onCalculateRoute,
  loading,
  onLoadRoute,
}) => {
  const [activeTab, setActiveTab] = useState<'planner' | 'saved'>('planner');
  const [routeName, setRouteName] = useState('');
  const [savedRoutes, setSavedRoutes] = useState<SavedItem[]>(() => {
    const local = localStorage.getItem('anantyatra_saved_routes');
    if (local) {
      try {
        return JSON.parse(local);
      } catch (e) {
        console.error(e);
      }
    }
    return [];
  });
  const [isSaving, setIsSaving] = useState(false);

  const handleSaveCurrentRoute = () => {
    if (waypoints.length === 0) return;
    const nameToSave =
      routeName.trim() ||
      `Journey (${waypoints[0]?.name || 'Point 1'} to ${
        waypoints[waypoints.length - 1]?.name || 'End'
      })`;
    const newItem: SavedItem = {
      id: Date.now().toString(),
      name: nameToSave,
      waypoints: [...waypoints],
      createdAt: new Date().toLocaleDateString(),
    };

    const updated = [newItem, ...savedRoutes];
    setSavedRoutes(updated);
    localStorage.setItem('anantyatra_saved_routes', JSON.stringify(updated));
    setRouteName('');
    setIsSaving(false);
  };

  const handleDeleteSaved = (id: string) => {
    const updated = savedRoutes.filter((r) => r.id !== id);
    setSavedRoutes(updated);
    localStorage.setItem('anantyatra_saved_routes', JSON.stringify(updated));
  };

  return (
    <div className="flex flex-col h-full bg-slate-900/80 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl p-5 text-white">
      {/* Tab Switcher */}
      <div className="flex bg-slate-950/60 p-1 rounded-xl mb-4 border border-white/5">
        <button
          onClick={() => setActiveTab('planner')}
          className={`flex-1 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
            activeTab === 'planner'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Navigation className="w-3.5 h-3.5" />
          Route Planner ({waypoints.length})
        </button>
        <button
          onClick={() => setActiveTab('saved')}
          className={`flex-1 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
            activeTab === 'saved'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Bookmark className="w-3.5 h-3.5" />
          Saved ({savedRoutes.length})
        </button>
      </div>

      {/* Tab Content: Planner */}
      {activeTab === 'planner' && (
        <div className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 custom-scrollbar">
            {waypoints.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 p-6 text-center border border-dashed border-slate-800 rounded-xl">
                <MapPin className="w-10 h-10 mb-2 text-indigo-400/60 animate-pulse" />
                <p className="text-xs font-medium text-slate-300">No Waypoints Selected</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Use search above to add places to your itinerary.
                </p>
              </div>
            ) : (
              waypoints.map((wp, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 bg-slate-800/50 border border-slate-700/50 p-3 rounded-xl hover:border-indigo-500/40 transition-all group"
                >
                  <GripVertical className="w-4 h-4 text-slate-500 shrink-0" />
                  <div className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-300 flex items-center justify-center text-xs font-bold shrink-0 border border-indigo-500/30">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-200 truncate text-xs">
                      {wp.name || `Waypoint ${index + 1}`}
                    </p>
                    <p className="text-[10px] text-slate-400 font-mono">
                      {wp.lat.toFixed(4)}, {wp.lon.toFixed(4)}
                    </p>
                  </div>
                  <button
                    onClick={() => onRemove(index)}
                    className="p-1 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Action Footer */}
          <div className="pt-4 mt-auto border-t border-slate-800 space-y-2">
            {isSaving ? (
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder="Trip Name (optional)..."
                  value={routeName}
                  onChange={(e) => setRouteName(e.target.value)}
                  className="h-9 text-xs bg-slate-950/80 border-slate-700 text-white placeholder:text-slate-500"
                />
                <Button
                  size="sm"
                  onClick={handleSaveCurrentRoute}
                  className="h-9 bg-emerald-600 hover:bg-emerald-700 text-xs px-3"
                >
                  <Save className="w-3.5 h-3.5 mr-1" /> Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsSaving(false)}
                  className="h-9 px-2 text-slate-400"
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button
                  onClick={onCalculateRoute}
                  disabled={waypoints.length < 2 || loading}
                  className="flex-1 h-10 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 rounded-xl"
                >
                  {loading ? 'Calculating Route...' : 'Get Route & Directions'}
                </Button>

                {waypoints.length > 0 && (
                  <Button
                    onClick={() => setIsSaving(true)}
                    variant="outline"
                    className="h-10 border-slate-700 bg-slate-800/40 text-slate-300 hover:bg-slate-800 hover:text-white px-3"
                    title="Save planned places"
                  >
                    <Save className="w-4 h-4" />
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab Content: Saved Routes */}
      {activeTab === 'saved' && (
        <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 custom-scrollbar">
          {savedRoutes.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 p-6 text-center border border-dashed border-slate-800 rounded-xl">
              <Bookmark className="w-10 h-10 mb-2 text-slate-600" />
              <p className="text-xs font-medium text-slate-300">No Saved Trips Yet</p>
              <p className="text-[11px] text-slate-500 mt-1">
                Plan a trip and click Save to store it for later access.
              </p>
            </div>
          ) : (
            savedRoutes.map((saved) => (
              <div
                key={saved.id}
                className="p-3 bg-slate-800/40 border border-slate-700/40 rounded-xl hover:border-indigo-500/40 transition-all space-y-2"
              >
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-xs text-indigo-300 truncate">{saved.name}</h4>
                  <button
                    onClick={() => handleDeleteSaved(saved.id)}
                    className="text-slate-500 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-[10px] text-slate-400">
                  {saved.waypoints.length} stops • Saved {saved.createdAt}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onLoadRoute?.(saved as unknown as Route)}
                  className="w-full h-7 text-[11px] border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10"
                >
                  Load onto Map
                </Button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
