import React, { useState, useEffect } from 'react';
import type { Route, Waypoint } from '../../types';
import type { WaypointSlot } from '../../hooks/useRoute';
import { Bookmark, Save, Trash2, Navigation, Plus, GripVertical, AlertTriangle, X, Car, Bike, Footprints, Truck } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { WaypointInput } from './WaypointInput';
import { useAuthStore } from '../../store/authStore';

// DnD Kit imports
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface SortableItemProps {
  id: string;
  index: number;
  children: React.ReactNode;
}

const SortableItem: React.FC<SortableItemProps> = ({ id, index, children }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 1000 : 50 - index,
    opacity: isDragging ? 0.7 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-1 relative">
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-2 text-slate-400 dark:text-slate-500 hover:text-evergreen dark:hover:text-porcelain transition-colors h-10 flex items-center justify-center shrink-0 mt-[1px]"
      >
        <GripVertical className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        {children}
      </div>
    </div>
  );
};

interface WaypointListProps {
  slots: WaypointSlot[];
  addSlot: () => void;
  updateSlot: (id: string, waypoint: Waypoint | null) => void;
  removeSlot: (id: string) => void;
  reorderSlots: (oldIndex: number, newIndex: number) => void;
  loading: boolean;
  currentRoute: Route | null;
  error: string | null;
  costing?: string;
  setCosting?: (mode: string) => void;
  onLoadRoute?: (route: SavedItem) => void;
}

export interface SavedItem {
  id: string;
  name: string;
  slots: WaypointSlot[];
  createdAt: string;
}

export const WaypointList: React.FC<WaypointListProps> = ({
  slots,
  addSlot,
  updateSlot,
  removeSlot,
  reorderSlots,
  loading,
  currentRoute,
  error,
  costing = 'auto',
  setCosting,
  onLoadRoute,
}) => {
  const [activeTab, setActiveTab] = useState<'planner' | 'saved'>('planner');
  const [routeName, setRouteName] = useState('');
  const { isAuthenticated } = useAuthStore();
  const [savedRoutes, setSavedRoutes] = useState<SavedItem[]>(() => {
    if (!isAuthenticated) return [];
    const local = localStorage.getItem('anantyatra_saved_routes');
    return local ? JSON.parse(local) : [];
  });
  const [isSaving, setIsSaving] = useState(false);
  const [showAuthToast, setShowAuthToast] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSavedRoutes([]);
    } else {
      const local = localStorage.getItem('anantyatra_saved_routes');
      setSavedRoutes(local ? JSON.parse(local) : []);
    }
  }, [isAuthenticated]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = slots.findIndex((s) => s.id === active.id);
      const newIndex = slots.findIndex((s) => s.id === over.id);
      reorderSlots(oldIndex, newIndex);
    }
  };

  const handleInitiateSave = () => {
    if (!isAuthenticated) {
      setShowAuthToast(true);
      setTimeout(() => setShowAuthToast(false), 3500);
      return;
    }
    setIsSaving(true);
  };

  const displaySavedRoutes = isAuthenticated ? savedRoutes : [];

  const handleSaveCurrentRoute = () => {
    const validWaypoints = slots.map(s => s.waypoint).filter(Boolean);
    if (validWaypoints.length === 0) return;
    
    const nameToSave =
      routeName.trim() ||
      `Journey (${validWaypoints[0]?.name || 'Origin'} to ${
        validWaypoints[validWaypoints.length - 1]?.name || 'Destination'
      })`;
      
    const newItem: SavedItem = {
      id: Date.now().toString(),
      name: nameToSave,
      slots: [...slots],
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

  const validCount = slots.filter((s) => s.waypoint).length;

  return (
    <div className="flex flex-col h-full min-h-0 text-evergreen dark:text-porcelain transition-colors duration-300">
      {/* Tab Switcher */}
      <div className="flex bg-slate-100/60 dark:bg-midnight-1/60 p-1 rounded-xl mb-4 border border-slate-200/50 dark:border-white/5 shrink-0 transition-colors duration-300">
        <button
          onClick={() => setActiveTab('planner')}
          className={`flex-1 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
            activeTab === 'planner'
              ? 'bg-evergreen dark:bg-grapefruit text-porcelain shadow-md'
              : 'text-slate-500 hover:text-evergreen dark:text-porcelain/50 dark:hover:text-porcelain'
          }`}
        >
          <Navigation className="w-3.5 h-3.5" />
          Route Planner
        </button>
        <button
          onClick={() => setActiveTab('saved')}
          className={`flex-1 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
            activeTab === 'saved'
              ? 'bg-evergreen dark:bg-grapefruit text-porcelain shadow-md'
              : 'text-slate-500 hover:text-evergreen dark:text-porcelain/50 dark:hover:text-porcelain'
          }`}
        >
          <Bookmark className="w-3.5 h-3.5" />
          Saved ({displaySavedRoutes.length})
        </button>
      </div>

      {/* Tab Content: Planner */}
      {activeTab === 'planner' && (
        <div className="flex flex-col flex-1 min-h-0 relative">
          
          {/* Travel Mode Selector (Google Maps style) */}
          <div className="flex items-center justify-between bg-slate-100/90 dark:bg-midnight-1/90 p-1.5 rounded-2xl mb-3 border border-slate-200/80 dark:border-white/10 shrink-0 transition-colors shadow-inner">
            {[
              { 
                id: 'auto', 
                label: 'Drive', 
                icon: (props: { className?: string }) => <Car className={props.className} />
              },
              { 
                id: 'motorcycle', 
                label: 'Two-Wheeler', 
                icon: (props: { className?: string }) => (
                  <svg className={props.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="5.5" cy="17.5" r="3" />
                    <circle cx="18.5" cy="17.5" r="3" />
                    <path d="M15 6h-4.5l-3 5.5h3.5" />
                    <path d="M8.5 11.5L6 17.5" />
                    <path d="M14.5 6l2.5 6h3" />
                  </svg>
                )
              },
              { 
                id: 'bicycle', 
                label: 'Cycle', 
                icon: (props: { className?: string }) => <Bike className={props.className} />
              },
              { 
                id: 'pedestrian', 
                label: 'Walk', 
                icon: (props: { className?: string }) => <Footprints className={props.className} />
              },
              { 
                id: 'truck', 
                label: 'Truck', 
                icon: (props: { className?: string }) => <Truck className={props.className} />
              },
            ].map((mode) => {
              const isSelected = costing === mode.id;
              const Icon = mode.icon;
              return (
                <button
                  key={mode.id}
                  onClick={() => setCosting?.(mode.id)}
                  className={`flex-1 py-1.5 px-1 rounded-xl text-[11px] font-medium flex flex-col items-center justify-center gap-1 transition-all duration-200 ${
                    isSelected
                      ? 'bg-white dark:bg-slate-800 text-evergreen dark:text-grapefruit shadow-md font-semibold scale-[1.02]'
                      : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-porcelain hover:bg-slate-200/50 dark:hover:bg-slate-800/40'
                  }`}
                  title={`Route using ${mode.label}`}
                >
                  <Icon className={`w-4 h-4 transition-colors ${isSelected ? 'text-evergreen dark:text-grapefruit' : 'text-slate-400 dark:text-slate-500'}`} />
                  <span className="text-[10px] leading-none tracking-tight">{mode.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto pr-2 pb-3 custom-scrollbar">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={slots.map((s) => s.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2.5">
                  {slots.map((slot, index) => {
                    const isFirst = index === 0;
                    const isLast = index === slots.length - 1;
                    const placeholder = isFirst
                      ? "Choose starting point..."
                      : isLast
                      ? "Choose destination..."
                      : "Add stop...";

                    return (
                      <SortableItem key={slot.id} id={slot.id} index={index}>
                        <WaypointInput
                          value={slot.waypoint}
                          onChange={(wp) => updateSlot(slot.id, wp)}
                          onRemove={() => removeSlot(slot.id)}
                          placeholder={placeholder}
                          isFirst={isFirst}
                          isLast={isLast}
                        />
                      </SortableItem>
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>

            {/* Add Destination Button */}
            <div className="pl-10 pr-10 mt-2 shrink-0 h-9 flex items-center justify-center">
              {loading ? (
                <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500 text-xs font-medium bg-slate-50 dark:bg-slate-800/50 w-full justify-center h-full rounded-xl border border-dashed border-slate-200 dark:border-slate-700/50">
                  <Navigation className="w-3.5 h-3.5 animate-bounce text-evergreen/60 dark:text-grapefruit/70 mt-1" />
                  <span>Mapping optimal route...</span>
                </div>
              ) : (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={addSlot}
                  className="w-full h-full border border-dashed border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-evergreen dark:hover:text-grapefruit hover:border-evergreen/50 dark:hover:border-grapefruit/50 hover:bg-evergreen/5 dark:hover:bg-grapefruit/10 justify-start rounded-xl transition-colors"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Destination
                </Button>
              )}
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="shrink-0 mb-3 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-300">{error}</p>
            </div>
          )}

          <div className="shrink-0 pt-4 mt-auto border-t border-slate-200 dark:border-slate-800 space-y-3 transition-colors">
            
            {/* Route Stats Block */}
            {currentRoute && !loading && (
              <div className="bg-grapefruit/10 border border-grapefruit/20 rounded-xl p-3 flex justify-between items-center transition-colors">
                <div>
                  <p className="text-sm font-bold text-evergreen dark:text-grapefruit">
                    {currentRoute.duration >= 60 
                      ? `${Math.floor(currentRoute.duration / 60)} hr ${Math.round(currentRoute.duration % 60)} min`
                      : `${Math.round(currentRoute.duration)} min`}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {currentRoute.distance.toFixed(1)} km
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-semibold">Fastest Route</p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500">via Valhalla Engine</p>
                </div>
              </div>
            )}

            {isSaving ? (
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder="Trip Name (optional)..."
                  value={routeName}
                  onChange={(e) => setRouteName(e.target.value)}
                  className="h-9 text-xs bg-white dark:bg-midnight-1/80 border-slate-300 dark:border-slate-700 text-evergreen dark:text-porcelain placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-colors"
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
                  className="h-9 px-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button
                  disabled={true}
                  className="flex-1 h-10 bg-slate-100 dark:bg-midnight-1 text-slate-500 dark:text-porcelain/60 text-xs font-semibold rounded-xl flex items-center justify-center relative overflow-hidden transition-colors"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-evergreen dark:border-grapefruit border-t-transparent rounded-full animate-spin"></div>
                      Calculating Route...
                    </span>
                  ) : (
                    <span>
                      {validCount < 2 
                        ? 'Add points to begin' 
                        : error 
                          ? 'Calculation Failed' 
                          : 'Route up to date'}
                    </span>
                  )}
                  {/* Subtle animated progress bar if loading */}
                  {loading && <div className="absolute bottom-0 left-0 h-0.5 bg-evergreen dark:bg-grapefruit w-full animate-pulse"></div>}
                </Button>

                {validCount >= 2 && (
                  <Button
                    onClick={handleInitiateSave}
                    variant="outline"
                    className="h-10 border-slate-300 dark:border-slate-700 bg-slate-100/40 dark:bg-midnight-1/40 text-slate-500 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/5 hover:text-evergreen dark:hover:text-porcelain px-3 transition-colors"
                    title="Save planned places"
                  >
                    <Save className="w-4 h-4" />
                  </Button>
                )}
              </div>
            )}
          </div>
          
          {/* Auth Toast Notification */}
          {showAuthToast && (
            <div className="absolute bottom-20 left-4 right-4 bg-slate-900 dark:bg-slate-800 text-white dark:text-porcelain text-xs p-3 rounded-lg shadow-xl border border-slate-700 z-50 flex items-center justify-between shadow-[0_0_15px_rgba(0,0,0,0.3)] animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-grapefruit" />
                <span>You must be logged in to save trips.</span>
              </div>
              <button onClick={() => setShowAuthToast(false)} className="text-slate-400 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tab Content: Saved Routes */}
      {activeTab === 'saved' && (
        <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 custom-scrollbar">
          {!isAuthenticated ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 p-6 text-center border border-dashed border-slate-300 dark:border-slate-800 rounded-xl transition-colors">
              <Bookmark className="w-10 h-10 mb-2 text-slate-300 dark:text-slate-600" />
              <p className="text-xs font-semibold text-evergreen dark:text-slate-200">Sign In Required</p>
              <p className="text-[11px] text-slate-500 mt-1">
                Please sign in to save itineraries and access your saved trips.
              </p>
            </div>
          ) : displaySavedRoutes.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 p-6 text-center border border-dashed border-slate-300 dark:border-slate-800 rounded-xl transition-colors">
              <Bookmark className="w-10 h-10 mb-2 text-slate-300 dark:text-slate-600" />
              <p className="text-xs font-medium text-evergreen dark:text-slate-300">No Saved Trips Yet</p>
              <p className="text-[11px] text-slate-500 mt-1">
                Plan a trip and click Save to store it for later access.
              </p>
            </div>
          ) : (
            displaySavedRoutes.map((saved) => {
              const validWps = saved.slots?.filter(s => s.waypoint).length || 0;
              return (
                <div
                  key={saved.id}
                  className="p-3 bg-slate-50 dark:bg-midnight-1/40 border border-slate-200 dark:border-slate-700/40 rounded-xl hover:border-evergreen/40 dark:hover:border-grapefruit/40 transition-all space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-xs text-evergreen dark:text-grapefruit truncate pr-2">{saved.name}</h4>
                    <button
                      onClick={() => handleDeleteSaved(saved.id)}
                      className="text-slate-500 hover:text-red-400 transition-colors shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    {validWps} stops • Saved {saved.createdAt}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      onLoadRoute?.(saved);
                      setActiveTab('planner');
                    }}
                    className="w-full h-7 text-[11px] border-evergreen/30 dark:border-grapefruit/30 text-evergreen dark:text-grapefruit hover:bg-evergreen/5 dark:hover:bg-grapefruit/10 transition-colors"
                  >
                    Load into Planner
                  </Button>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
