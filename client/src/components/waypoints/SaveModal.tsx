import React, { useState } from 'react';
import { X, Plus, RefreshCw, BookmarkCheck, MapPin, Calendar, Loader2 } from 'lucide-react';
import type { Route, Waypoint } from '../../types';

interface SaveModalProps {
  isOpen: boolean;
  onClose: () => void;
  savedRoutes: Route[];
  waypoints: Waypoint[];
  costing: string;
  defaultName: string;
  onSaveSuccess: (route: Route, isUpdate: boolean) => void;
  onSaveNew: (name: string) => Promise<Route>;
  onUpdateExisting: (id: string, name?: string) => Promise<Route>;
}

export const SaveModal: React.FC<SaveModalProps> = ({
  isOpen,
  onClose,
  savedRoutes,
  waypoints,
  defaultName,
  onSaveSuccess,
  onSaveNew,
  onUpdateExisting,
}) => {
  const [mode, setMode] = useState<'choice' | 'new' | 'update'>(() =>
    savedRoutes.length > 0 ? 'choice' : 'new'
  );
  const [tripName, setTripName] = useState(defaultName);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCreateNew = async () => {
    setLocalError(null);
    const finalName = tripName.trim() || defaultName;
    setIsSubmitting(true);
    try {
      const created = await onSaveNew(finalName);
      onSaveSuccess(created, false);
      onClose();
    } catch (err: unknown) {
      const errorMsg = (err as { response?: { data?: { error?: string } }; message?: string })?.response?.data?.error || (err as Error).message || 'Failed to save trip';
      setLocalError(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async () => {
    setLocalError(null);
    if (!selectedRouteId) return;
    setIsSubmitting(true);
    try {
      const selectedRoute = savedRoutes.find((r) => r.id === selectedRouteId);
      const updated = await onUpdateExisting(selectedRouteId, selectedRoute?.name);
      onSaveSuccess(updated, true);
      onClose();
    } catch (err: unknown) {
      const errorMsg = (err as { response?: { data?: { error?: string } }; message?: string })?.response?.data?.error || (err as Error).message || 'Failed to update trip';
      setLocalError(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md bg-white dark:bg-[#0f172a] rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-evergreen/10 dark:bg-grapefruit/10 flex items-center justify-center text-evergreen dark:text-grapefruit">
              <BookmarkCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-[17px] text-slate-900 dark:text-white">Save Your Trip</h3>
              <p className="text-[12px] text-slate-500 dark:text-slate-400">
                {waypoints.length} stops in this itinerary
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-4">
          {/* Choice Mode */}
          {mode === 'choice' && (
            <div className="space-y-3">
              <p className="text-[13px] font-medium text-slate-600 dark:text-slate-300">
                How would you like to save this trip?
              </p>

              {/* Card 1: Create New */}
              <button
                onClick={() => setMode('new')}
                className="w-full p-4 rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-800/40 hover:border-evergreen dark:hover:border-grapefruit hover:bg-evergreen/5 dark:hover:bg-grapefruit/5 transition-all text-left group flex items-start gap-3.5"
              >
                <div className="w-10 h-10 rounded-xl bg-evergreen dark:bg-grapefruit text-white flex items-center justify-center shrink-0 shadow-md group-hover:scale-105 transition-transform">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-[15px] text-slate-900 dark:text-white">Create New Trip</h4>
                  <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Save this itinerary as a brand new trip in your library
                  </p>
                </div>
              </button>

              {/* Card 2: Update Existing */}
              <button
                onClick={() => setMode('update')}
                className="w-full p-4 rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-800/40 hover:border-evergreen dark:hover:border-grapefruit hover:bg-evergreen/5 dark:hover:bg-grapefruit/5 transition-all text-left group flex items-start gap-3.5"
              >
                <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition-transform">
                  <RefreshCw className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-[15px] text-slate-900 dark:text-white">Update Existing Trip</h4>
                  <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Replace stops in one of your saved trips with this itinerary
                  </p>
                </div>
              </button>
            </div>
          )}

          {/* New Trip Mode */}
          {mode === 'new' && (
            <div className="space-y-4">
              {savedRoutes.length > 0 && (
                <button
                  onClick={() => setMode('choice')}
                  className="text-[12px] text-evergreen dark:text-grapefruit font-semibold hover:underline"
                >
                  ← Back to options
                </button>
              )}
              <div>
                <label className="block text-[13px] font-bold text-slate-700 dark:text-slate-200 mb-2">
                  Trip Name
                </label>
                <input
                  type="text"
                  value={tripName}
                  onChange={(e) => setTripName(e.target.value)}
                  placeholder="e.g. Goa Weekend Trip"
                  className="w-full h-12 px-4 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-transparent focus:border-evergreen dark:focus:border-grapefruit text-slate-900 dark:text-white text-[14px] outline-none transition-all"
                  autoFocus
                />
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 space-y-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Stops preview
                </span>
                <div className="space-y-1">
                  {waypoints.map((wp, i) => (
                    <div key={i} className="flex items-center gap-2 text-[12px] text-slate-600 dark:text-slate-300">
                      <MapPin className="w-3.5 h-3.5 text-evergreen dark:text-grapefruit shrink-0" />
                      <span className="truncate">{wp.name || `${wp.lat.toFixed(3)}, ${wp.lon.toFixed(3)}`}</span>
                    </div>
                  ))}
                </div>
              </div>

              {localError && (
                <div className="p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl">
                  <p className="text-xs text-red-600 dark:text-red-400 text-center font-bold">{localError}</p>
                </div>
              )}

              <button
                onClick={handleCreateNew}
                disabled={isSubmitting}
                className="w-full h-12 rounded-2xl bg-evergreen hover:bg-evergreen-dark dark:bg-grapefruit dark:hover:bg-grapefruit/90 text-white font-bold text-[14px] flex items-center justify-center gap-2 shadow-lg transition-all disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Saving...
                  </>
                ) : (
                  'Save as New Trip'
                )}
              </button>
            </div>
          )}

          {/* Update Mode */}
          {mode === 'update' && (
            <div className="space-y-4">
              <button
                onClick={() => setMode('choice')}
                className="text-[12px] text-evergreen dark:text-grapefruit font-semibold hover:underline"
              >
                ← Back to options
              </button>

              <p className="text-[13px] font-medium text-slate-600 dark:text-slate-300">
                Select the saved trip you want to overwrite:
              </p>

              <div className="space-y-2 max-h-[220px] overflow-y-auto custom-scrollbar pr-1">
                {savedRoutes.map((route) => {
                  const isSelected = selectedRouteId === route.id;
                  return (
                    <div
                      key={route.id}
                      onClick={() => setSelectedRouteId(route.id)}
                      className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                        isSelected
                          ? 'border-evergreen dark:border-grapefruit bg-evergreen/10 dark:bg-grapefruit/10 shadow-sm'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      <div className="min-w-0 pr-3">
                        <p className="font-bold text-[14px] text-slate-900 dark:text-white truncate">
                          {route.name}
                        </p>
                        <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-1">
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {route.waypoints?.length || 0} stops
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(route.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>

                      <div
                        className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                          isSelected
                            ? 'border-evergreen dark:border-grapefruit bg-evergreen dark:bg-grapefruit text-white'
                            : 'border-slate-300 dark:border-slate-600'
                        }`}
                      >
                        {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                      </div>
                    </div>
                  );
                })}
              </div>

              {selectedRouteId && (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-[12px] text-amber-700 dark:text-amber-300">
                  ⚠️ This trip's existing stops will be replaced with your current itinerary.
                </div>
              )}

              {localError && (
                <div className="p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl">
                  <p className="text-xs text-red-600 dark:text-red-400 text-center font-bold">{localError}</p>
                </div>
              )}

              <button
                onClick={handleUpdate}
                disabled={!selectedRouteId || isSubmitting}
                className="w-full h-12 rounded-2xl bg-evergreen hover:bg-evergreen-dark dark:bg-grapefruit dark:hover:bg-grapefruit/90 text-white font-bold text-[14px] flex items-center justify-center gap-2 shadow-lg transition-all disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Updating...
                  </>
                ) : (
                  'Overwrite Selected Trip'
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
