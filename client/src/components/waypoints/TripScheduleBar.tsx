import React from 'react';
import { Calendar, X, Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface TripScheduleBarProps {
  startDate: string | null;
  endDate: string | null;
  totalPlannedNights: number;
  isEndDateManuallySet: boolean;
  onSetStartDate: (date: string | null) => void;
  onSetEndDate: (date: string | null) => void;
  onClearDates: () => void;
}

export const TripScheduleBar: React.FC<TripScheduleBarProps> = ({
  startDate,
  endDate,
  totalPlannedNights,
  isEndDateManuallySet,
  onSetStartDate,
  onSetEndDate,
  onClearDates,
}) => {
  const handleSetToday = () => {
    const today = new Date().toISOString().split('T')[0];
    onSetStartDate(today);
  };

  // Calculate day difference if both dates are set
  let daysWindow: number | null = null;
  if (startDate && endDate) {
    const startMs = new Date(startDate).getTime();
    const endMs = new Date(endDate).getTime();
    if (!isNaN(startMs) && !isNaN(endMs) && endMs >= startMs) {
      daysWindow = Math.round((endMs - startMs) / (1000 * 60 * 60 * 24));
    }
  }

  const hasDates = Boolean(startDate || endDate);

  return (
    <div className="bg-slate-100/80 dark:bg-slate-800/50 backdrop-blur-sm border border-slate-200/80 dark:border-slate-700/60 rounded-2xl p-3 mb-3 text-xs shadow-sm transition-all">
      {/* Top Header Row */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-200 text-[12px]">
          <Calendar className="w-3.5 h-3.5 text-evergreen dark:text-grapefruit" />
          <span>Trip Schedule</span>
        </div>
        
        <div className="flex items-center gap-2">
          {!startDate && (
            <button
              type="button"
              onClick={handleSetToday}
              className="text-[11px] font-semibold text-evergreen dark:text-grapefruit hover:underline px-2 py-0.5 rounded-md bg-evergreen/10 dark:bg-grapefruit/10 transition-colors"
            >
              Set Today
            </button>
          )}
          {hasDates && (
            <button
              type="button"
              onClick={onClearDates}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              title="Clear Schedule"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Date Pickers Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-center">
        {/* Start Date */}
        <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 px-2.5 py-1.5 rounded-xl focus-within:border-evergreen dark:focus-within:border-grapefruit transition-colors">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider min-w-[32px]">Start</span>
          <input
            type="date"
            value={startDate || ''}
            onChange={(e) => onSetStartDate(e.target.value || null)}
            className="bg-transparent outline-none w-full text-slate-700 dark:text-slate-200 text-[12px] font-medium"
            title="Journey Start Date"
          />
        </div>

        {/* End Date */}
        <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 px-2.5 py-1.5 rounded-xl focus-within:border-evergreen dark:focus-within:border-grapefruit transition-colors">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider min-w-[32px]">End</span>
          <input
            type="date"
            value={endDate || ''}
            min={startDate || undefined}
            onChange={(e) => onSetEndDate(e.target.value || null)}
            className="bg-transparent outline-none w-full text-slate-700 dark:text-slate-200 text-[12px] font-medium"
            title="Journey End Date"
          />
        </div>
      </div>

      {/* Status / Insight Pill */}
      {hasDates && (
        <div className="mt-2.5 pt-2 border-t border-slate-200/60 dark:border-slate-700/40 flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <div className="flex items-center gap-1.5 font-medium">
            {daysWindow !== null ? (
              isEndDateManuallySet && totalPlannedNights > daysWindow ? (
                <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1 font-semibold">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  Tight: {totalPlannedNights}d planned in {daysWindow}d window
                </span>
              ) : (
                <span className="text-emerald-700 dark:text-emerald-400 flex items-center gap-1 font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  {daysWindow} Days Trip {totalPlannedNights > 0 ? `(${totalPlannedNights}d stays)` : ''}
                </span>
              )
            ) : (
              <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                Select both dates for trip duration
              </span>
            )}
          </div>

          {!isEndDateManuallySet && startDate && (
            <span className="text-[10px] text-slate-400 italic">
              (End date auto-calculated)
            </span>
          )}
        </div>
      )}
    </div>
  );
};
