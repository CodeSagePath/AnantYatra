import React, { useState, useEffect, useMemo } from 'react';
import { X, Download, Table, Sparkles, Map, Loader2 } from 'lucide-react';
import type { Waypoint, Route } from '../../types';
import { exportToPDF, exportToSVG, exportDayToDayPDF, exportDayToDaySVG, exportStateWiseSVG, exportStateWisePDF } from '../../utils/exportUtils';
import { batchGetStatesForWaypoints } from '../../utils/location';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  waypoints: Waypoint[];
  currentRoute: Route | null;
  tripName?: string;
  startDate?: string | null;
  endDate?: string | null;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  waypoints,
  currentRoute,
  tripName = 'My Journey',
  startDate,
  endDate,
}) => {
  const [isAnalyzingStates, setIsAnalyzingStates] = useState(false);
  const [availableStates, setAvailableStates] = useState<string[]>([]);
  const [selectedState, setSelectedState] = useState<string>('');

  const validWaypoints = useMemo(() => waypoints.filter(Boolean), [waypoints]);

  const activeStartDate = startDate || currentRoute?.startDate;
  const activeEndDate = endDate || currentRoute?.endDate;

  useEffect(() => {
    if (!isOpen || validWaypoints.length === 0) return;

    let isMounted = true;
    queueMicrotask(() => {
      if (isMounted) setIsAnalyzingStates(true);
    });

    batchGetStatesForWaypoints(validWaypoints)
      .then(stateMap => {
        if (!isMounted) return;
        const uniqueStates = Array.from(new Set(Object.values(stateMap))).filter(Boolean);
        setAvailableStates(uniqueStates);
        if (uniqueStates.length > 0) {
          setSelectedState(uniqueStates[0]);
        } else {
          setAvailableStates([]);
          setSelectedState('');
        }
      })
      .catch(err => {
        console.error("Failed to analyze states:", err);
      })
      .finally(() => {
        if (isMounted) setIsAnalyzingStates(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, validWaypoints]);

  if (!isOpen) return null;

  const handleExportPDF = () => {
    exportToPDF(
      tripName,
      validWaypoints,
      currentRoute?.legDistances,
      currentRoute?.legDurations,
      currentRoute?.distance,
      currentRoute?.duration,
      activeStartDate,
      activeEndDate
    );
    onClose();
  };

  const handleExportSVGWithMap = () => {
    exportToSVG(
      tripName,
      validWaypoints,
      currentRoute?.legDistances,
      currentRoute?.legDurations,
      currentRoute?.distance,
      currentRoute?.duration,
      currentRoute?.polyline,
      true
    );
    onClose();
  };

  const handleExportSVGRouteOnly = () => {
    exportToSVG(
      tripName,
      validWaypoints,
      currentRoute?.legDistances,
      currentRoute?.legDurations,
      currentRoute?.distance,
      currentRoute?.duration,
      currentRoute?.polyline,
      false
    );
    onClose();
  };

  const handleExportDayToDayPDF = () => {
    exportDayToDayPDF(
      tripName,
      validWaypoints,
      currentRoute?.legDistances,
      currentRoute?.legDurations
    );
    onClose();
  };

  const handleExportDayToDaySVG = () => {
    exportDayToDaySVG(
      tripName,
      validWaypoints,
      currentRoute?.legDistances,
      currentRoute?.legDurations,
      currentRoute?.distance,
      currentRoute?.duration,
      currentRoute?.polyline,
      true
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md bg-white dark:bg-[#0f172a] rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-evergreen/10 dark:bg-grapefruit/10 flex items-center justify-center text-evergreen dark:text-grapefruit">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-[17px] text-slate-900 dark:text-white">Export Itinerary</h3>
              <p className="text-[12px] text-slate-500 dark:text-slate-400">
                Choose format ({validWaypoints.length} stops)
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

        {/* Content */}
        <div className="p-6 space-y-4">
          <p className="text-[13px] font-medium text-slate-600 dark:text-slate-300">
            How would you like to export your trip plan?
          </p>

          {/* Option 1: PDF */}
          <button
            onClick={handleExportPDF}
            className="w-full p-4 rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-800/40 hover:border-evergreen dark:hover:border-grapefruit hover:bg-evergreen/5 dark:hover:bg-grapefruit/5 transition-all text-left group flex items-start gap-3.5"
          >
            <div className="w-10 h-10 rounded-xl bg-red-500 text-white flex items-center justify-center shrink-0 shadow-md group-hover:scale-105 transition-transform">
              <Table className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-[15px] text-slate-900 dark:text-white">PDF Document</h4>
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400">
                  Tabular A4
                </span>
              </div>
              <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">
                Print-ready tabular report with stops, distances, travel times, and grand totals.
              </p>
            </div>
          </button>

          {/* Option 2: SVG with Map */}
          <button
            onClick={handleExportSVGWithMap}
            className="w-full p-4 rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-800/40 hover:border-evergreen dark:hover:border-grapefruit hover:bg-evergreen/5 dark:hover:bg-grapefruit/5 transition-all text-left group flex items-start gap-3.5"
          >
            <div className="w-10 h-10 rounded-xl bg-evergreen dark:bg-grapefruit text-white flex items-center justify-center shrink-0 shadow-md group-hover:scale-105 transition-transform">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-[15px] text-slate-900 dark:text-white">SVG Map of India</h4>
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-evergreen/10 dark:bg-grapefruit/20 text-evergreen dark:text-grapefruit">
                  Detailed
                </span>
              </div>
              <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">
                Exact driving route overlaid on a stylized country map of India.
              </p>
            </div>
          </button>

          {/* Option 3: Clean Route SVG */}
          <button
            onClick={handleExportSVGRouteOnly}
            className="w-full p-4 rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-800/40 hover:border-blue-500 hover:bg-blue-500/5 transition-all text-left group flex items-start gap-3.5"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-500 text-white flex items-center justify-center shrink-0 shadow-md group-hover:scale-105 transition-transform">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-[15px] text-slate-900 dark:text-white">Clean Route SVG</h4>
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  Minimalist
                </span>
              </div>
              <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">
                A clean, abstract rendering of your driving route without country borders.
              </p>
            </div>
          </button>

          {/* Option 4: Day-to-Day PDF */}
          <button
            onClick={handleExportDayToDayPDF}
            className="w-full p-4 rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-800/40 hover:border-amber-500 hover:bg-amber-500/5 transition-all text-left group flex items-start gap-3.5"
          >
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-md group-hover:scale-105 transition-transform">
              <Table className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-[15px] text-slate-900 dark:text-white">Day-to-day PDF</h4>
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  Organized
                </span>
              </div>
              <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">
                Your itinerary categorized by day, including custom notes.
              </p>
            </div>
          </button>

          {/* Option 5: Day-to-Day SVG */}
          <button
            onClick={handleExportDayToDaySVG}
            className="w-full p-4 rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-800/40 hover:border-fuchsia-500 hover:bg-fuchsia-500/5 transition-all text-left group flex items-start gap-3.5"
          >
            <div className="w-10 h-10 rounded-xl bg-fuchsia-500 text-white flex items-center justify-center shrink-0 shadow-md group-hover:scale-105 transition-transform">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-[15px] text-slate-900 dark:text-white">Day-to-day SVG Map</h4>
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400">
                  Visual
                </span>
              </div>
              <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">
                Map colored and grouped visually by travel day.
              </p>
            </div>
          </button>
          
          <hr className="border-slate-100 dark:border-slate-800 my-2" />
          
          {/* Option 6: State-Wise Maps */}
          <div className="w-full p-4 rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-800/40">
            <div className="flex items-start gap-3.5 mb-3">
              <div className="w-10 h-10 rounded-xl bg-purple-500 text-white flex items-center justify-center shrink-0 shadow-md">
                {isAnalyzingStates ? <Loader2 className="w-5 h-5 animate-spin" /> : <Map className="w-5 h-5" />}
              </div>
              <div>
                <h4 className="font-bold text-[15px] text-slate-900 dark:text-white">State-Wise Map</h4>
                <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Export an auto-zoomed map of a specific Indian state.
                </p>
              </div>
            </div>
            
            {isAnalyzingStates ? (
              <div className="text-[13px] text-slate-500 dark:text-slate-400 flex items-center gap-2 pl-[54px]">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Analyzing route states...
              </div>
            ) : availableStates.length > 0 ? (
              <div className="flex flex-col sm:flex-row items-center gap-2 pl-0 sm:pl-[54px] mt-2">
                <select 
                  value={selectedState} 
                  onChange={(e) => setSelectedState(e.target.value)}
                  className="w-full sm:flex-1 h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 px-3 text-[13px] outline-none focus:border-purple-500 transition-colors"
                >
                  {availableStates.map(state => (
                    <option key={state} value={state} className="bg-white dark:bg-[#1e2532] text-slate-800 dark:text-slate-100">{state}</option>
                  ))}
                </select>
                <div className="flex gap-2 w-full sm:w-auto">
                  <button 
                    onClick={() => {
                      exportStateWiseSVG(selectedState, validWaypoints, currentRoute?.polyline);
                      onClose();
                    }}
                    className="flex-1 sm:flex-none px-3 h-9 bg-purple-100 hover:bg-purple-200 dark:bg-purple-500/20 dark:hover:bg-purple-500/30 text-purple-700 dark:text-purple-400 rounded-lg text-[12px] font-bold transition-colors"
                  >
                    SVG
                  </button>
                  <button 
                    onClick={() => {
                      exportStateWisePDF(selectedState, validWaypoints, currentRoute?.polyline);
                      onClose();
                    }}
                    className="flex-1 sm:flex-none px-3 h-9 bg-purple-100 hover:bg-purple-200 dark:bg-purple-500/20 dark:hover:bg-purple-500/30 text-purple-700 dark:text-purple-400 rounded-lg text-[12px] font-bold transition-colors"
                  >
                    PDF
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-[13px] text-slate-500 dark:text-slate-400 pl-[54px]">
                No specific Indian states found for your waypoints.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
