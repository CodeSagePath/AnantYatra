import React, { useState, useEffect } from 'react';
import type { Route, Waypoint, Checkin } from '../../types';
import type { WaypointSlot } from '../../hooks/useRoute';
import { Bookmark, Save, Trash2, Navigation, Plus, GripVertical, AlertTriangle, X, Car, Bike, Footprints, Truck, Share2, Download, Check, Loader2, Calendar } from 'lucide-react';
import { Button } from '../ui/button';
import { WaypointInput } from './WaypointInput';
import { useAuthStore } from '../../store/authStore';
import { routeApi } from '../../api/endpoints';
import { SaveModal } from './SaveModal';
import { ExportModal } from '../export/ExportModal';
import { TripScheduleBar } from './TripScheduleBar';
import { DatePropagationModal, type PropagationModalType } from './DatePropagationModal';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';

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
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers';

interface SortableItemProps {
  id: string;
  index: number;
  children: React.ReactNode;
}

const SortableItem: React.FC<SortableItemProps> = ({ id, children }) => {
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
    zIndex: isDragging ? 1000 : 'auto',
    opacity: isDragging ? 0.7 : 1,
    position: 'relative' as const,
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
  checkins?: Checkin[];
  error: string | null;
  costing?: string;
  setCosting?: (mode: string) => void;
  startDate?: string | null;
  endDate?: string | null;
  isEndDateManuallySet?: boolean;
  totalPlannedNights?: number;
  setStartDate?: (date: string | null) => void;
  setEndDate?: (date: string | null) => void;
  clearDates?: () => void;
  recalculateDownstreamDates?: (startIndex: number, baseDate: string) => void;
  clearDownstreamDates?: (startIndex: number) => void;
  onLoadRoute?: (saved: Route) => void;
  onInputFocus?: () => void;
  isMobileFocused?: boolean;
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
  checkins = [],
  error,
  costing = 'auto',
  setCosting,
  startDate = null,
  endDate = null,
  isEndDateManuallySet = false,
  totalPlannedNights = 0,
  setStartDate,
  setEndDate,
  clearDates,
  recalculateDownstreamDates,
  clearDownstreamDates,
  onLoadRoute,
  onInputFocus,
  isMobileFocused,
}) => {
  const [activeTab, setActiveTab] = useState<'planner' | 'saved'>('planner');
  const { isAuthenticated, setShowAuthModal } = useAuthStore();
  const [savedRoutes, setSavedRoutes] = useState<Route[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [listRef] = useAutoAnimate<HTMLDivElement>();
  const [viewMode, setViewMode] = useState<'list' | 'day'>('list');
  const [dismissedPrompts, setDismissedPrompts] = useState<Record<string, boolean>>({});

  const [propModalState, setPropModalState] = useState<{
    isOpen: boolean;
    type: PropagationModalType;
    stopIndex: number;
    stopName: string;
    newDate?: string;
    pendingWp: Waypoint | null;
    slotId: string;
  }>({
    isOpen: false,
    type: 'ripple',
    stopIndex: 0,
    stopName: '',
    pendingWp: null,
    slotId: '',
  });

  const [confirmModalState, setConfirmModalState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    variant?: 'danger' | 'warning';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const handleRemoveSlotRequested = (slot: WaypointSlot) => {
    if (slot.waypoint && slot.waypoint.name) {
      const placeName = slot.waypoint.name.split(',')[0];
      setConfirmModalState({
        isOpen: true,
        title: 'Remove Stop?',
        message: `Are you sure you want to remove "${placeName}" from your trip itinerary?`,
        confirmLabel: 'Remove Stop',
        variant: 'danger',
        onConfirm: () => removeSlot(slot.id),
      });
    } else {
      removeSlot(slot.id);
    }
  };

  const handleDeleteSavedRequested = (routeId: string, routeName: string) => {
    setConfirmModalState({
      isOpen: true,
      title: 'Delete Saved Trip?',
      message: `Are you sure you want to delete "${routeName}"? This action cannot be undone.`,
      confirmLabel: 'Delete Trip',
      variant: 'danger',
      onConfirm: () => handleDeleteSaved(routeId),
    });
  };

  const handleLoadRouteRequested = (saved: Route) => {
    if (validWaypoints.length > 0) {
      setConfirmModalState({
        isOpen: true,
        title: 'Replace Current Itinerary?',
        message: `Loading "${saved.name}" will replace your current trip itinerary.`,
        confirmLabel: 'Load Route',
        variant: 'warning',
        onConfirm: () => {
          if (onLoadRoute) onLoadRoute(saved);
          setActiveTab('planner');
        },
      });
    } else {
      if (onLoadRoute) onLoadRoute(saved);
      setActiveTab('planner');
    }
  };

  const handleWaypointChange = (slotId: string, index: number, oldWp: Waypoint | null, newWp: Waypoint | null) => {
    if (!newWp) {
      if (oldWp && oldWp.name) {
        const placeName = oldWp.name.split(',')[0];
        setConfirmModalState({
          isOpen: true,
          title: 'Clear Place Name?',
          message: `Are you sure you want to clear "${placeName}" from this stop?`,
          confirmLabel: 'Clear Place',
          variant: 'danger',
          onConfirm: () => updateSlot(slotId, null),
        });
        return;
      }
      updateSlot(slotId, null);
      return;
    }

    const dateChanged = oldWp?.date !== newWp.date;
    const stayChanged = oldWp?.stayDuration !== newWp.stayDuration;

    if (dateChanged || stayChanged) {
      const isClearingDate = dateChanged && !newWp.date;
      const isFirstStopDateChange = index === 0 && dateChanged && Boolean(newWp.date);
      const hasSubsequentStops = index < slots.length - 1;

      if (isFirstStopDateChange) {
        setPropModalState({
          isOpen: true,
          type: 'start_date',
          stopIndex: 0,
          stopName: (newWp.name || 'Stop 1').split(',')[0],
          newDate: newWp.date,
          pendingWp: newWp,
          slotId,
        });
        return;
      }

      if (isClearingDate && hasSubsequentStops) {
        setPropModalState({
          isOpen: true,
          type: 'clear',
          stopIndex: index,
          stopName: (newWp.name || `Stop ${index + 1}`).split(',')[0],
          pendingWp: newWp,
          slotId,
        });
        return;
      }

      if (hasSubsequentStops && (newWp.date || startDate)) {
        setPropModalState({
          isOpen: true,
          type: 'ripple',
          stopIndex: index,
          stopName: (newWp.name || `Stop ${index + 1}`).split(',')[0],
          newDate: newWp.date,
          pendingWp: newWp,
          slotId,
        });
        return;
      }
    }

    updateSlot(slotId, newWp);
  };

  const handleConfirmDownstream = () => {
    const { pendingWp, slotId, stopIndex, type, newDate } = propModalState;
    if (!pendingWp) return;

    updateSlot(slotId, pendingWp);

    if (type === 'start_date' && newDate) {
      if (setStartDate) setStartDate(newDate);
      if (recalculateDownstreamDates) recalculateDownstreamDates(0, newDate);
    } else if (type === 'clear') {
      if (clearDownstreamDates) clearDownstreamDates(stopIndex + 1);
    } else if (type === 'ripple') {
      const anchorDate = pendingWp.date || startDate;
      if (anchorDate && recalculateDownstreamDates) {
        recalculateDownstreamDates(stopIndex, anchorDate);
      }
    }
  };

  const handleConfirmSingle = () => {
    const { pendingWp, slotId } = propModalState;
    if (pendingWp) {
      updateSlot(slotId, pendingWp);
    }
  };

  const fetchSavedRoutes = async () => {
    if (!isAuthenticated) {
      setSavedRoutes([]);
      return;
    }
    setLoadingSaved(true);
    try {
      const res = await routeApi.getSavedRoutes();
      setSavedRoutes(res.data);
    } catch {
      // Silently handle error
    } finally {
      setLoadingSaved(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    if (isAuthenticated) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoadingSaved(true);
      routeApi
        .getSavedRoutes()
        .then((res) => {
          if (isMounted) setSavedRoutes(res.data);
        })
        .catch(() => {
          // Silently handle error
        })
        .finally(() => {
          if (isMounted) setLoadingSaved(false);
        });
    }

    return () => {
      isMounted = false;
    };
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

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const handleInitiateSave = () => {
    if (!isAuthenticated) {
      setShowAuthModal(true);
      return;
    }
    setShowSaveModal(true);
  };

  const handleSaveNew = async (name: string): Promise<Route> => {
    const validWaypoints = slots.map(s => s.waypoint).filter(Boolean) as Waypoint[];
    const res = await routeApi.createSavedRoute({
      name,
      waypoints: validWaypoints,
      costing,
      startDate,
      endDate,
    });
    return res.data;
  };

  const handleUpdateExisting = async (id: string, name?: string): Promise<Route> => {
    const validWaypoints = slots.map(s => s.waypoint).filter(Boolean) as Waypoint[];
    const res = await routeApi.updateSavedRoute(id, {
      name,
      waypoints: validWaypoints,
      costing,
      startDate,
      endDate,
    });
    return res.data;
  };

  const handleSaveSuccess = (_savedRoute: Route, isUpdate: boolean) => {
    fetchSavedRoutes();
    showToast(isUpdate ? 'Trip updated successfully!' : 'Trip saved successfully!');
  };

  const handleDeleteSaved = async (id: string) => {
    try {
      await routeApi.deleteSavedRoute(id);
      setSavedRoutes(prev => prev.filter(r => r.id !== id));
      showToast('Trip removed.');
    } catch {
      showToast('Failed to delete trip.');
    }
  };

  const handleCopyShareLink = (shareToken?: string, routeId?: string) => {
    if (!shareToken) return;
    const url = `${window.location.origin}/?trip=${shareToken}`;
    navigator.clipboard.writeText(url);
    if (routeId) {
      setCopiedId(routeId);
      setTimeout(() => setCopiedId(null), 2500);
    } else {
      showToast('Share link copied to clipboard!');
    }
  };

  const validWaypoints = slots.map(s => s.waypoint).filter(Boolean) as Waypoint[];
  const validCount = validWaypoints.length;

  const defaultTripName =
    validWaypoints.length >= 2
      ? `${validWaypoints[0]?.name || 'Origin'} to ${validWaypoints[validWaypoints.length - 1]?.name || 'Destination'}`
      : 'My Journey';

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
      {!isMobileFocused && (
        <div className="flex bg-slate-100/70 dark:bg-slate-800/60 p-1.5 rounded-2xl mb-2.5 border border-slate-200/50 dark:border-white/5 shrink-0">
          {([['planner', Navigation, 'Route Planner'], ['saved', Bookmark, `Saved (${savedRoutes.length})`]] as const).map(([tab, Icon, label]) => (
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
      )}

      {/* ── Route Planner Tab ─────────────────────────────── */}
      {activeTab === 'planner' && (
        <div className="flex flex-col flex-1 min-h-0 relative">

          {/* Top Controls: Travel Mode & View Mode */}
          {!isMobileFocused && (
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-2.5 shrink-0">
              
              {/* Travel Mode Bar */}
              <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto custom-scrollbar bg-slate-100/80 dark:bg-slate-800/60 p-1.5 rounded-2xl">
                {travelModes.map(mode => {
                  const selected = costing === mode.id;
                  const Icon = mode.icon;
                  return (
                    <button
                      key={mode.id}
                      onClick={() => setCosting?.(mode.id)}
                      className={`shrink-0 min-w-[56px] py-2 px-1.5 rounded-xl text-[11px] font-medium flex flex-col items-center gap-1 transition-all duration-200 whitespace-nowrap ${
                        selected
                          ? 'bg-white dark:bg-slate-900 text-evergreen dark:text-grapefruit shadow font-bold'
                          : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-700/40'
                      }`}
                    >
                      <Icon className={`w-4 h-4 ${selected ? 'text-evergreen dark:text-grapefruit' : 'text-slate-400 dark:text-slate-500'}`} />
                      <span className="text-[10px] leading-none">{mode.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* View Toggle */}
              <div className="flex items-center gap-1 bg-slate-100/80 dark:bg-slate-800/60 p-1.5 rounded-2xl shrink-0 self-stretch md:self-auto">
                <button 
                  onClick={() => setViewMode('list')} 
                  className={`flex-1 md:flex-none px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                    viewMode === 'list' 
                      ? 'bg-white dark:bg-slate-800 text-evergreen dark:text-grapefruit shadow-sm' 
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
                >
                  List
                </button>
                <button 
                  onClick={() => setViewMode('day')} 
                  className={`flex-1 md:flex-none px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                    viewMode === 'day' 
                      ? 'bg-white dark:bg-slate-800 text-evergreen dark:text-grapefruit shadow-sm' 
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
                >
                  Day-Wise
                </button>
              </div>
            </div>
          )}

          {/* Trip Schedule Bar */}
          {activeTab === 'planner' && (
            <TripScheduleBar
              startDate={startDate}
              endDate={endDate}
              totalPlannedNights={totalPlannedNights}
              isEndDateManuallySet={isEndDateManuallySet}
              onSetStartDate={(d) => setStartDate && setStartDate(d)}
              onSetEndDate={(d) => setEndDate && setEndDate(d)}
              onClearDates={() => clearDates && clearDates()}
            />
          )}

          {/* Waypoint list — scrollable */}
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pb-2 -mr-1 pr-1">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd} modifiers={[restrictToVerticalAxis, restrictToParentElement]}>
              <SortableContext items={slots.map(s => s.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-0" ref={listRef}>
                  {slots.map((slot, index) => {
                    const isFirst = index === 0;
                    const isLast = index === slots.length - 1;
                    const placeholder = isFirst ? 'Starting point...' : isLast ? 'Destination...' : 'Add stop...';
                    
                    // Day calculation for Day-Wise view
                    const accumulatedNights = slots.slice(0, index).reduce((sum, s) => {
                      const dur = s.waypoint?.stayDuration;
                      if (!dur) return sum;
                      if (dur === '1 Night') return sum + 1;
                      if (dur === '2 Nights') return sum + 2;
                      if (dur === '3 Nights') return sum + 3;
                      if (dur === '4+ Nights') return sum + 4;
                      if (dur === 'Half Day') return sum + 0.5;
                      if (dur === 'Full Day') return sum + 1;
                      return sum;
                    }, 0);

                    const prevAccumulatedNights = index > 0 ? slots.slice(0, index - 1).reduce((sum, s) => {
                      const dur = s.waypoint?.stayDuration;
                      if (!dur) return sum;
                      if (dur === '1 Night') return sum + 1;
                      if (dur === '2 Nights') return sum + 2;
                      if (dur === '3 Nights') return sum + 3;
                      if (dur === '4+ Nights') return sum + 4;
                      if (dur === 'Half Day') return sum + 0.5;
                      if (dur === 'Full Day') return sum + 1;
                      return sum;
                    }, 0) : null;

                    const dayNumber = Math.floor(accumulatedNights) + 1;
                    const prevDayNumber = prevAccumulatedNights !== null ? Math.floor(prevAccumulatedNights) + 1 : null;

                    let dayFormattedText = `Day ${dayNumber}`;
                    if (startDate) {
                      const d = new Date(startDate);
                      d.setDate(d.getDate() + Math.floor(accumulatedNights));
                      if (!isNaN(d.getTime())) {
                        const formattedDateStr = d.toLocaleDateString('en-US', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        });
                        dayFormattedText = `Day ${dayNumber} · ${formattedDateStr}`;
                      }
                    } else if (slot.waypoint?.date) {
                      dayFormattedText = slot.waypoint.date;
                    }

                    const showDayHeader = viewMode === 'day' && (index === 0 || dayNumber !== prevDayNumber || Boolean(slot.waypoint?.date));

                    return (
                      <React.Fragment key={slot.id}>
                        {/* Day-Wise Header */}
                        {showDayHeader && (
                          <div className="ml-[32px] mr-2 my-2.5 pl-3 pr-4 py-1.5 bg-evergreen/5 dark:bg-grapefruit/10 border border-evergreen/20 dark:border-grapefruit/20 rounded-xl flex items-center justify-between shadow-xs">
                            <div className="flex items-center gap-2">
                              <Calendar className="w-3.5 h-3.5 text-evergreen dark:text-grapefruit" />
                              <span className="font-bold text-[12px] text-evergreen dark:text-grapefruit">
                                {dayFormattedText}
                              </span>
                            </div>
                          </div>
                        )}

                        <SortableItem id={slot.id} index={index}>
                          <WaypointInput
                            value={slot.waypoint}
                            onChange={wp => handleWaypointChange(slot.id, index, slot.waypoint, wp)}
                            onRemove={() => handleRemoveSlotRequested(slot)}
                            onFocus={onInputFocus}
                            placeholder={placeholder}
                            isFirst={isFirst}
                            isLast={isLast}
                          />
                        </SortableItem>

                        {/* "Add stop between" — placed ON the connector line, left-aligned to icon center */}
                        {!isLast && insertSlot && (
                          <div className="relative flex items-center justify-between pb-1.5 pt-1.5 pr-3" style={{ paddingLeft: '32px' }}>
                            {/* Connector segment */}
                            <div className="absolute left-[43px] top-0 bottom-0 w-[2px] bg-slate-200 dark:bg-slate-700 z-0" />
                            {/* Contextual "+" Button or Smart Prompt */}
                            {(() => {
                              const legDist = currentRoute?.legDistances?.[index];
                              const isLongLeg = legDist !== undefined && legDist > 150;
                              const isDismissed = dismissedPrompts[slot.id];
                              const showBanner = isLongLeg && !isDismissed;

                              if (showBanner) {
                                return (
                                  <div className="relative z-10 ml-2 my-1 p-3 bg-evergreen/10 dark:bg-grapefruit/10 border border-evergreen/20 dark:border-grapefruit/20 rounded-xl flex flex-col gap-2 max-w-sm">
                                    <div className="flex items-start justify-between gap-2">
                                      <p className="text-[12px] font-semibold text-evergreen dark:text-grapefruit leading-tight">
                                        🚗 Long drive ahead! Halting somewhere in this direction?
                                      </p>
                                      <button 
                                        onClick={() => setDismissedPrompts(prev => ({ ...prev, [slot.id]: true }))}
                                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors shrink-0"
                                      >
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                    <div className="flex items-center gap-2 mt-1">
                                      <button
                                        type="button"
                                        onClick={() => insertSlot(index + 1)}
                                        className="flex-1 py-1.5 px-3 bg-evergreen dark:bg-grapefruit text-white text-[11px] font-bold rounded-lg shadow-sm hover:shadow transition-all"
                                      >
                                        Yes, add stop
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setDismissedPrompts(prev => ({ ...prev, [slot.id]: true }))}
                                        className="flex-1 py-1.5 px-3 bg-white dark:bg-[#1a2030] border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-[11px] font-bold rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                                      >
                                        No, driving straight
                                      </button>
                                    </div>
                                  </div>
                                );
                              }

                              return (
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
                              );
                            })()}

                            {/* Leg Distance Pill */}
                            {(() => {
                              const legDist = currentRoute?.legDistances?.[index];
                              const legDur = currentRoute?.legDurations?.[index];
                              if (legDist !== undefined && legDist !== null && legDist > 0) {
                                return (
                                  <div className="relative z-10 flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full bg-evergreen/10 dark:bg-grapefruit/10 text-evergreen dark:text-grapefruit border border-evergreen/20 dark:border-grapefruit/20">
                                    <span>{legDist >= 10 ? Math.round(legDist) : legDist.toFixed(1)} km</span>
                                    {legDur ? <span className="opacity-75 font-normal">({Math.round(legDur)}m)</span> : null}
                                  </div>
                                );
                              }
                              return null;
                            })()}
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>

            {/* Add Destination */}
            <div className="mt-1.5 ml-[32px] mr-3">
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
          <div className="shrink-0 pt-3 mt-auto border-t border-slate-100 dark:border-slate-800 space-y-2.5">

            {/* Route Stats */}
            {currentRoute && (
              <div className={`bg-evergreen/10 dark:bg-grapefruit/10 border border-evergreen/20 dark:border-grapefruit/20 rounded-2xl px-4 py-3 flex justify-between items-center transition-all duration-300 ${loading ? 'border-dashed border-evergreen/40 dark:border-grapefruit/40' : ''}`}>
                <div>
                  <p className="text-[15px] font-bold text-evergreen dark:text-grapefruit">
                    {loading ? (
                      <span className="animate-pulse opacity-60 font-mono tracking-wider">-- min</span>
                    ) : currentRoute.duration >= 60 ? (
                      `${Math.floor(currentRoute.duration / 60)} hr ${Math.round(currentRoute.duration % 60)} min`
                    ) : (
                      `${Math.round(currentRoute.duration)} min`
                    )}
                  </p>
                  <p className="text-[12px] text-slate-500 dark:text-slate-400">
                    {loading ? (
                      <span className="animate-pulse opacity-60 font-mono">--.- km</span>
                    ) : (
                      `${currentRoute.distance.toFixed(1)} km`
                    )}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-bold">
                    {loading ? <span className="animate-pulse text-evergreen/60 dark:text-grapefruit/70">Updating...</span> : 'Fastest'}
                  </p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500">via Valhalla</p>
                </div>
              </div>
            )}

            {/* Save & Export Action Bar */}
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
                <>
                  {/* Export Button */}
                  <button
                    onClick={() => setShowExportModal(true)}
                    className="w-11 h-11 flex items-center justify-center rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-100/60 dark:bg-slate-800/40 text-slate-500 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-evergreen dark:hover:text-grapefruit transition-colors"
                    title="Export itinerary (PDF / SVG)"
                  >
                    <Download className="w-4 h-4" />
                  </button>

                  {/* Save Button */}
                  <button
                    onClick={handleInitiateSave}
                    className="w-11 h-11 flex items-center justify-center rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-100/60 dark:bg-slate-800/40 text-slate-500 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-evergreen dark:hover:text-grapefruit transition-colors"
                    title="Save or Update trip"
                  >
                    <Save className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Toast Notice */}
          {toastMsg && (
            <div className="absolute bottom-20 left-0 right-0 mx-2 bg-evergreen dark:bg-grapefruit text-white text-xs p-3 rounded-2xl shadow-xl z-50 flex items-center justify-between animate-fade-in">
              <span className="font-bold">{toastMsg}</span>
              <button onClick={() => setToastMsg(null)} className="text-white/80 hover:text-white ml-2">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Saved Routes Tab ──────────────────────────────── */}
      {activeTab === 'saved' && (
        <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar">
          {!isAuthenticated ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
              <Bookmark className="w-12 h-12 mb-3 text-slate-300 dark:text-slate-700" />
              <p className="text-[14px] font-extrabold text-slate-800 dark:text-slate-200">Sign In Required</p>
              <p className="text-[12px] text-slate-400 mt-1 mb-4">Sign in to save and access your trips.</p>
              <Button
                onClick={() => setShowAuthModal(true)}
                className="h-10 px-5 rounded-xl bg-evergreen dark:bg-grapefruit text-white text-[12px] font-bold shadow-md hover:opacity-95 transition-all flex items-center gap-2"
              >
                Sign In / Sign Up
              </Button>
            </div>
          ) : loadingSaved ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center">
              <Loader2 className="w-8 h-8 mb-2 animate-spin text-evergreen dark:text-grapefruit" />
              <p className="text-[12px] text-slate-400">Loading saved trips...</p>
            </div>
          ) : savedRoutes.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
              <Bookmark className="w-12 h-12 mb-3 text-slate-300 dark:text-slate-700" />
              <p className="text-[13px] font-bold text-slate-600 dark:text-slate-300">No Saved Trips</p>
              <p className="text-[12px] text-slate-400 mt-1">Plan a route and save it for later.</p>
            </div>
          ) : (
            savedRoutes.map(saved => {
              const stopCount = saved.waypoints?.length || 0;
              const createdDate = new Date(saved.createdAt).toLocaleDateString();
              const isCopied = copiedId === saved.id;

              return (
                <div
                  key={saved.id}
                  className="p-3.5 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/40 rounded-2xl hover:border-evergreen/40 dark:hover:border-grapefruit/40 transition-all space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-[14px] text-slate-900 dark:text-white truncate pr-2">
                      {saved.name}
                    </h4>
                    <div className="flex items-center gap-1 shrink-0">
                      {/* Share Button */}
                      {saved.shareToken && (
                        <button
                          onClick={() => handleCopyShareLink(saved.shareToken, saved.id)}
                          className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-evergreen dark:hover:text-grapefruit hover:bg-slate-200/60 dark:hover:bg-slate-700/60 rounded-xl transition-colors"
                          title="Copy public share URL"
                        >
                          {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Share2 className="w-3.5 h-3.5" />}
                        </button>
                      )}
                      {/* Delete Button */}
                      <button
                        onClick={() => handleDeleteSavedRequested(saved.id, saved.name)}
                        className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-colors"
                        title="Delete trip"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {saved.startDate && (
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-evergreen dark:text-grapefruit bg-evergreen/10 dark:bg-grapefruit/10 px-2.5 py-1 rounded-lg w-fit">
                      <Calendar className="w-3 h-3 shrink-0" />
                      <span>
                        {saved.startDate} {saved.endDate ? `➔ ${saved.endDate}` : ''}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-3 text-[11px] text-slate-400">
                    <span>{stopCount} stops</span>
                    <span>•</span>
                    <span>{saved.distance >= 10 ? Math.round(saved.distance) : saved.distance.toFixed(1)} km</span>
                    <span>•</span>
                    <span>{createdDate}</span>
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleLoadRouteRequested(saved)}
                    className="w-full h-9 text-[12px] font-bold rounded-xl border-evergreen/30 dark:border-grapefruit/30 text-evergreen dark:text-grapefruit hover:bg-evergreen/5 dark:hover:bg-grapefruit/10"
                  >
                    Load into Planner
                  </Button>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Modals */}
      <SaveModal
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        savedRoutes={savedRoutes}
        waypoints={validWaypoints}
        costing={costing}
        defaultName={defaultTripName}
        onSaveSuccess={handleSaveSuccess}
        onSaveError={(msg) => showToast(msg)}
        onSaveNew={handleSaveNew}
        onUpdateExisting={handleUpdateExisting}
      />

      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        waypoints={validWaypoints}
        currentRoute={currentRoute}
        checkins={checkins}
        tripName={defaultTripName}
        startDate={startDate}
        endDate={endDate}
      />

      <DatePropagationModal
        isOpen={propModalState.isOpen}
        type={propModalState.type}
        stopIndex={propModalState.stopIndex}
        stopName={propModalState.stopName}
        newDate={propModalState.newDate}
        totalStops={slots.length}
        onConfirmDownstream={handleConfirmDownstream}
        onConfirmSingle={handleConfirmSingle}
        onClose={() => setPropModalState(prev => ({ ...prev, isOpen: false }))}
      />

      <ConfirmDeleteModal
        isOpen={confirmModalState.isOpen}
        title={confirmModalState.title}
        message={confirmModalState.message}
        confirmLabel={confirmModalState.confirmLabel}
        variant={confirmModalState.variant}
        onConfirm={confirmModalState.onConfirm}
        onClose={() => setConfirmModalState(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
