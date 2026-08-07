import React, { useState, useEffect } from 'react';
import type { Route, Waypoint } from '../../types';
import type { WaypointSlot } from '../../hooks/useRoute';
import { Bookmark, Save, Trash2, Navigation, Plus, GripVertical, AlertTriangle, X, Car, Bike, Footprints, Truck } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { WaypointInput } from './WaypointInput';
import { useAuthStore } from '../../store/authStore';

import { useAutoAnimate } from '@formkit/auto-animate/react';
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
    <div ref={setNodeRef} style={style} className="flex items-start md:items-center relative">
      {/* Drag handle — exactly 32px width (w-8) */}
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing w-[32px] h-[48px] md:h-[52px] flex items-center justify-center text-slate-300 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-400 transition-colors shrink-0 z-10"
      >
        <GripVertical className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0 pb-1">
        {children}
      </div>
    </div>
  );
};

interface WaypointListProps {
  slots: WaypointSlot[];
  addSlot: () => void;
  insertSlot?: (index: number) => void;
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
  insertSlot,
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
  const [listRef] = useAutoAnimate<HTMLDivElement>();

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
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = slots.findIndex(s => s.id === active.id);
      const newIndex = slots.findIndex(s => s.id === over.id);
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
      `Journey (${validWaypoints[0]?.name || 'Origin'} to ${validWaypoints[validWaypoints.length - 1]?.name || 'Destination'})`;
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
    const updated = savedRoutes.filter(r => r.id !== id);
    setSavedRoutes(updated);
    localStorage.setItem('anantyatra_saved_routes', JSON.stringify(updated));
  };

  const validCount = slots.filter(s => s.waypoint).length;

  const travelModes = [
    { id: 'auto', label: 'Drive', icon: (p: { className?: string }) => <Car className={p.className} /> },
    {
      id: 'motorcycle', label: '2-Wheeler',
      icon: (p: { className?: string }) => (
        <svg className={p.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="5.5" cy="17.5" r="3" /><circle cx="18.5" cy="17.5" r="3" />
          <path d="M15 6h-4.5l-3 5.5h3.5" /><path d="M8.5 11.5L6 17.5" /><path d="M14.5 6l2.5 6h3" />
        </svg>
      ),
    },
    { id: 'bicycle', label: 'Cycle', icon: (p: { className?: string }) => <Bike className={p.className} /> },
    { id: 'pedestrian', label: 'Walk', icon: (p: { className?: string }) => <Footprints className={p.className} /> },
    { id: 'truck', label: 'Truck', icon: (p: { className?: string }) => <Truck className={p.className} /> },
  ];

  return (
    <div className="flex flex-col h-full min-h-0 text-slate-800 dark:text-slate-100 transition-colors duration-300">

      {/* ── Tab Bar ───────────────────────────────────────── */}
      <div className="flex bg-slate-100/70 dark:bg-slate-800/60 p-1 rounded-2xl mb-3 border border-slate-200/50 dark:border-white/5 shrink-0">
        {([['planner', Navigation, 'Route Planner'], ['saved', Bookmark, `Saved (${displaySavedRoutes.length})`]] as const).map(([tab, Icon, label]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2.5 rounded-xl text-[12px] font-semibold flex items-center justify-center gap-1.5 transition-all ${
              activeTab === tab
                ? 'bg-evergreen dark:bg-grapefruit text-white shadow-md'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Route Planner Tab ─────────────────────────────── */}
      {activeTab === 'planner' && (
        <div className="flex flex-col flex-1 min-h-0 relative">

          {/* Travel Mode Bar — horizontal scroll on very small screens */}
          <div className="flex items-center justify-between gap-1 bg-slate-100/80 dark:bg-slate-800/60 p-1 rounded-2xl mb-3 shrink-0 overflow-x-auto no-scrollbar">
            {travelModes.map(mode => {
              const selected = costing === mode.id;
              const Icon = mode.icon;
              return (
                <button
                  key={mode.id}
                  onClick={() => setCosting?.(mode.id)}
                  className={`flex-1 min-w-[52px] py-2 px-1 rounded-xl text-[11px] font-medium flex flex-col items-center gap-1 transition-all duration-200 whitespace-nowrap ${
                    selected
                      ? 'bg-white dark:bg-slate-900 text-evergreen dark:text-grapefruit shadow font-bold'
                      : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-700/40'
                  }`}
                >
                  <Icon className={`w-5 h-5 ${selected ? 'text-evergreen dark:text-grapefruit' : 'text-slate-400 dark:text-slate-500'}`} />
                  <span className="text-[10px] leading-none">{mode.label}</span>
                </button>
              );
            })}
          </div>

          {/* Waypoint list — scrollable */}
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pb-2 -mr-1 pr-1">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={slots.map(s => s.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-0" ref={listRef}>
                  {slots.map((slot, index) => {
                    const isFirst = index === 0;
                    const isLast = index === slots.length - 1;
                    const placeholder = isFirst ? 'Starting point...' : isLast ? 'Destination...' : 'Add stop...';

                    return (
                      <React.Fragment key={slot.id}>
                        <SortableItem id={slot.id} index={index}>
                          <WaypointInput
                            value={slot.waypoint}
                            onChange={wp => updateSlot(slot.id, wp)}
                            onRemove={() => removeSlot(slot.id)}
                            placeholder={placeholder}
                            isFirst={isFirst}
                            isLast={isLast}
                          />
                        </SortableItem>

                        {/* "Add stop between" — placed ON the connector line, left-aligned to icon center */}
                        {!isLast && insertSlot && (
                          <div className="relative flex items-center justify-start pb-1 pt-1" style={{ paddingLeft: '32px' }}>
                            {/* Connector segment */}
                            <div className="absolute left-[43px] top-0 bottom-0 w-[2px] bg-slate-200 dark:bg-slate-700 z-0" />
                            {/* "+" Button */}
                            <button
                              type="button"
                              onClick={() => insertSlot(index + 1)}
                              className="
                                group relative z-10
                                flex items-center gap-2
                                h-8 px-2 md:px-3 ml-2
                                rounded-xl
                                bg-slate-50 dark:bg-[#1a2030]
                                border border-slate-200 dark:border-slate-700
                                hover:border-evergreen dark:hover:border-grapefruit
                                text-slate-500 hover:text-evergreen dark:text-slate-400 dark:hover:text-grapefruit
                                shadow-sm hover:shadow-md
                                transition-all duration-200
                                cursor-pointer
                                text-[12px] font-semibold
                              "
                              title="Add a stop here"
                            >
                              <div className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center group-hover:bg-evergreen group-hover:text-white dark:group-hover:bg-grapefruit transition-colors">
                                <Plus className="w-3.5 h-3.5 transition-transform duration-200 group-hover:rotate-90" />
                              </div>
                              <span>Add stop here</span>
                            </button>
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>

            {/* Add Destination */}
            <div className="mt-1 ml-[32px] mr-2">
              {loading ? (
                <div className="h-12 flex items-center justify-center gap-2 rounded-2xl bg-slate-100 dark:bg-slate-800/60 border border-dashed border-slate-300 dark:border-slate-600 text-slate-400 text-[13px]">
                  <Navigation className="w-4 h-4 animate-bounce text-evergreen/60 dark:text-grapefruit/70" />
                  Mapping optimal route...
                </div>
              ) : (
                <button
                  onClick={addSlot}
                  className="w-full h-12 flex items-center gap-2 px-4 rounded-2xl bg-slate-100/80 dark:bg-slate-800/50 border border-dashed border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:text-evergreen dark:hover:text-grapefruit hover:border-evergreen/60 dark:hover:border-grapefruit/60 hover:bg-evergreen/5 dark:hover:bg-grapefruit/10 text-[14px] md:text-[13px] font-semibold transition-all"
                >
                  <Plus className="w-4 h-4" />
                  Add destination
                </button>
              )}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="shrink-0 mt-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-300">{error}</p>
            </div>
          )}

          {/* ── Bottom Actions ─────────────────────────────── */}
          <div className="shrink-0 pt-3 mt-auto border-t border-slate-100 dark:border-slate-800 space-y-2">

            {/* Route Stats */}
            {currentRoute && (
              <div className={`bg-evergreen/10 dark:bg-grapefruit/10 border border-evergreen/20 dark:border-grapefruit/20 rounded-2xl px-4 py-3 flex justify-between items-center transition-all duration-300 ${loading ? 'opacity-40 grayscale pointer-events-none' : 'opacity-100'}`}>
                <div>
                  <p className="text-[15px] font-bold text-evergreen dark:text-grapefruit">
                    {currentRoute.duration >= 60
                      ? `${Math.floor(currentRoute.duration / 60)} hr ${Math.round(currentRoute.duration % 60)} min`
                      : `${Math.round(currentRoute.duration)} min`}
                  </p>
                  <p className="text-[12px] text-slate-500 dark:text-slate-400">{currentRoute.distance.toFixed(1)} km</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-bold">Fastest</p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500">via Valhalla</p>
                </div>
              </div>
            )}

            {/* Save Row */}
            {isSaving ? (
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder="Trip name (optional)..."
                  value={routeName}
                  onChange={e => setRouteName(e.target.value)}
                  className="h-11 text-[13px] bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-xl"
                />
                <Button size="sm" onClick={handleSaveCurrentRoute} className="h-11 bg-emerald-600 hover:bg-emerald-700 px-3 rounded-xl">
                  <Save className="w-4 h-4 mr-1" /> Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setIsSaving(false)} className="h-11 px-3 rounded-xl">
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <div className="flex-1 h-11 bg-slate-100 dark:bg-slate-800/60 rounded-2xl flex items-center justify-center text-[12px] font-semibold text-slate-500 dark:text-slate-400 relative overflow-hidden">
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-evergreen dark:border-grapefruit border-t-transparent rounded-full animate-spin" />
                      Calculating...
                    </span>
                  ) : (
                    <span>
                      {validCount < 2 ? 'Add 2+ stops to route' : error ? 'Calculation failed' : 'Route is up to date'}
                    </span>
                  )}
                  {loading && <div className="absolute bottom-0 left-0 h-0.5 bg-evergreen dark:bg-grapefruit w-full animate-pulse" />}
                </div>
                {validCount >= 2 && (
                  <button
                    onClick={handleInitiateSave}
                    className="w-11 h-11 flex items-center justify-center rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-100/60 dark:bg-slate-800/40 text-slate-500 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-evergreen dark:hover:text-porcelain transition-colors"
                    title="Save route"
                  >
                    <Save className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Auth Toast */}
          {showAuthToast && (
            <div className="absolute bottom-20 left-0 right-0 mx-2 bg-slate-900 text-white text-xs p-3 rounded-2xl shadow-xl border border-slate-700 z-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-grapefruit" />
                <span>Sign in to save trips.</span>
              </div>
              <button onClick={() => setShowAuthToast(false)} className="text-slate-400 hover:text-white transition-colors ml-3">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Saved Routes Tab ──────────────────────────────── */}
      {activeTab === 'saved' && (
        <div className="flex-1 overflow-y-auto space-y-2">
          {!isAuthenticated ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
              <Bookmark className="w-12 h-12 mb-3 text-slate-300 dark:text-slate-700" />
              <p className="text-[13px] font-bold text-slate-600 dark:text-slate-300">Sign In Required</p>
              <p className="text-[12px] text-slate-400 mt-1">Sign in to save and access your trips.</p>
            </div>
          ) : displaySavedRoutes.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
              <Bookmark className="w-12 h-12 mb-3 text-slate-300 dark:text-slate-700" />
              <p className="text-[13px] font-bold text-slate-600 dark:text-slate-300">No Saved Trips</p>
              <p className="text-[12px] text-slate-400 mt-1">Plan a route and save it for later.</p>
            </div>
          ) : (
            displaySavedRoutes.map(saved => {
              const validWps = saved.slots?.filter(s => s.waypoint).length || 0;
              return (
                <div
                  key={saved.id}
                  className="p-3 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/40 rounded-2xl hover:border-evergreen/40 dark:hover:border-grapefruit/40 transition-all space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-[13px] text-evergreen dark:text-grapefruit truncate pr-2">{saved.name}</h4>
                    <button
                      onClick={() => handleDeleteSaved(saved.id)}
                      className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-colors shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400">{validWps} stops • {saved.createdAt}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { onLoadRoute?.(saved); setActiveTab('planner'); }}
                    className="w-full h-9 text-[12px] rounded-xl border-evergreen/30 dark:border-grapefruit/30 text-evergreen dark:text-grapefruit hover:bg-evergreen/5 dark:hover:bg-grapefruit/10"
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
