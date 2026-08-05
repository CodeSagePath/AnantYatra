import React from 'react';
import type { Waypoint } from '../../types';
import { MapPin, X, GripVertical } from 'lucide-react';
import { Button } from '../ui/button';

interface WaypointListProps {
  waypoints: Waypoint[];
  onRemove: (index: number) => void;
  onCalculateRoute: () => void;
  loading: boolean;
}

export const WaypointList: React.FC<WaypointListProps> = ({ waypoints, onRemove, onCalculateRoute, loading }) => {
  return (
    <div className="flex flex-col h-full bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl p-6">
      <h3 className="text-xl font-bold text-white mb-6">Your Route</h3>
      
      <div className="flex-1 overflow-y-auto space-y-3 mb-6 pr-2 custom-scrollbar">
        {waypoints.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-indigo-200/60 p-6 text-center">
            <MapPin className="w-12 h-12 mb-3 opacity-50" />
            <p className="text-sm">Search and add places to start building your route.</p>
          </div>
        ) : (
          waypoints.map((wp, index) => (
            <div 
              key={index}
              className="flex items-center gap-3 bg-white/5 border border-indigo-300/20 p-3 rounded-xl group hover:bg-white/10 transition-colors"
            >
              <div className="flex flex-col items-center justify-center cursor-grab active:cursor-grabbing text-indigo-300/50 hover:text-indigo-300 transition-colors">
                <GripVertical className="w-4 h-4" />
              </div>
              
              <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center shrink-0 border border-indigo-500/30">
                <span className="text-sm font-bold text-indigo-200">{index + 1}</span>
              </div>
              
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-white truncate text-sm">
                  {wp.name || `Point ${index + 1}`}
                </p>
                <p className="text-xs text-indigo-300 truncate">
                  {wp.lat.toFixed(4)}, {wp.lon.toFixed(4)}
                </p>
              </div>
              
              <button 
                onClick={() => onRemove(index)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-red-400 hover:text-white hover:bg-red-500 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>

      <Button
        onClick={onCalculateRoute}
        disabled={waypoints.length < 2 || loading}
        className="w-full h-12 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white shadow-lg shadow-indigo-500/30 rounded-xl"
      >
        {loading ? (
          <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        ) : (
          'Calculate Route'
        )}
      </Button>
    </div>
  );
};
