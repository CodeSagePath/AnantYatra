import React, { useEffect, useState } from 'react';
import { routeApi } from '../../api/endpoints';
import type { Route } from '../../types';
import { Navigation, Clock, Share2, Compass, AlertCircle, X, Check, Car, Bike, Footprints, Truck, Calendar } from 'lucide-react';
import { Button } from '../ui/button';

interface SharedTripViewProps {
  shareToken: string;
  onClose: () => void;
}

export const SharedTripView: React.FC<SharedTripViewProps> = ({ shareToken, onClose }) => {
  const [route, setRoute] = useState<Route | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let isMounted = true;

    routeApi
      .getSharedRoute(shareToken)
      .then((res) => {
        if (isMounted) {
          setRoute(res.data);
        }
      })
      .catch((err: unknown) => {
        if (isMounted) {
          const errorMsg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
          setError(
            errorMsg ||
              'This shared trip link is invalid or has been removed.'
          );
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [shareToken]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const getModeLabel = (mode?: string) => {
    switch (mode) {
      case 'bicycle':
        return { label: 'Cycling', icon: Bike };
      case 'pedestrian':
        return { label: 'Walking', icon: Footprints };
      case 'truck':
        return { label: 'Trucking', icon: Truck };
      case 'motorcycle':
        return { label: '2-Wheeler', icon: Car };
      default:
        return { label: 'Driving', icon: Car };
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-[2500] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
        <div className="bg-white dark:bg-[#0f172a] rounded-3xl p-8 max-w-sm w-full shadow-2xl flex flex-col items-center text-center space-y-4 border border-slate-200 dark:border-slate-800">
          <div className="w-12 h-12 rounded-full bg-evergreen/10 dark:bg-grapefruit/10 flex items-center justify-center text-evergreen dark:text-grapefruit">
            <Compass className="w-6 h-6 animate-spin" />
          </div>
          <div>
            <h3 className="font-bold text-[16px] text-slate-900 dark:text-white">Loading Shared Trip...</h3>
            <p className="text-[12px] text-slate-400 mt-1">Retrieving itinerary details</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !route) {
    return (
      <div className="fixed inset-0 z-[2500] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
        <div className="bg-white dark:bg-[#0f172a] rounded-3xl p-8 max-w-sm w-full shadow-2xl flex flex-col items-center text-center space-y-4 border border-slate-200 dark:border-slate-800">
          <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-500/10 flex items-center justify-center text-red-500">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-[16px] text-slate-900 dark:text-white">Link Unavailable</h3>
            <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-1">{error || 'Trip not found'}</p>
          </div>
          <Button onClick={onClose} className="w-full h-11 rounded-2xl bg-evergreen dark:bg-grapefruit text-white font-bold">
            Close & Start Planning
          </Button>
        </div>
      </div>
    );
  }

  const modeInfo = getModeLabel(route.costing);
  const ModeIcon = modeInfo.icon;
  const hours = Math.floor((route.duration || 0) / 60);
  const mins = Math.round((route.duration || 0) % 60);
  const timeFormatted = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

  return (
    <div className="fixed inset-0 z-[2000] bg-slate-900/70 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="w-full md:max-w-2xl bg-white dark:bg-[#0f172a] rounded-t-[32px] md:rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-evergreen dark:bg-grapefruit text-white flex items-center justify-center shrink-0 shadow-md">
              <Compass className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-evergreen dark:text-grapefruit">
                Shared Trip Itinerary
              </span>
              <h2 className="font-extrabold text-[18px] md:text-[20px] text-slate-900 dark:text-white truncate">
                {route.name}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleCopyLink}
              className="h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[12px] font-bold flex items-center gap-1.5 transition-all"
              title="Copy share link"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-500" /> Copied!
                </>
              ) : (
                <>
                  <Share2 className="w-3.5 h-3.5" /> Share
                </>
              )}
            </button>
            <button
              onClick={onClose}
              className="w-9 h-9 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Overview Banner */}
        <div className="px-6 py-4 bg-evergreen/5 dark:bg-grapefruit/5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-around text-center">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Distance</p>
            <p className="font-extrabold text-[18px] text-evergreen dark:text-grapefruit">
              {route.distance >= 10 ? Math.round(route.distance) : route.distance.toFixed(1)} km
            </p>
          </div>
          <div className="h-8 w-[1px] bg-slate-200 dark:bg-slate-700" />
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Travel Time</p>
            <p className="font-extrabold text-[18px] text-slate-800 dark:text-slate-100 flex items-center justify-center gap-1">
              <Clock className="w-4 h-4 text-slate-400" />
              {timeFormatted}
            </p>
          </div>
          <div className="h-8 w-[1px] bg-slate-200 dark:bg-slate-700" />
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Mode</p>
            <p className="font-extrabold text-[15px] text-slate-800 dark:text-slate-100 flex items-center justify-center gap-1 capitalize">
              <ModeIcon className="w-4 h-4 text-evergreen dark:text-grapefruit" />
              {modeInfo.label}
            </p>
          </div>
        </div>

        {/* Stops List */}
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-0">
          <p className="text-[12px] font-bold uppercase tracking-wider text-slate-400 mb-3">
            Route Stops ({route.waypoints.length})
          </p>

          {route.waypoints.map((wp, idx) => {
            const isFirst = idx === 0;
            const isLast = idx === route.waypoints.length - 1;
            const legDist = route.legDistances?.[idx];
            const legDur = route.legDurations?.[idx];

            return (
              <React.Fragment key={idx}>
                <div className="flex items-start gap-3 relative py-2">
                  {/* Timeline node */}
                  <div className="flex flex-col items-center shrink-0 w-6 pt-1">
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-extrabold text-white shadow-md ${
                        isFirst
                          ? 'bg-evergreen dark:bg-emerald-500'
                          : isLast
                          ? 'bg-grapefruit'
                          : 'bg-slate-400 dark:bg-slate-600'
                      }`}
                    >
                      {idx + 1}
                    </div>
                  </div>

                  {/* Stop Info */}
                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-[14px] text-slate-900 dark:text-white truncate">
                          {wp.name || `Stop ${idx + 1}`}
                        </p>
                        <p className="text-[11px] text-slate-400 truncate mt-0.5">
                          {wp.lat.toFixed(4)}, {wp.lon.toFixed(4)}
                        </p>
                      </div>
                      {wp.isRestDay && (
                        <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
                          Rest Day
                        </span>
                      )}
                    </div>

                    {/* Schedule Details */}
                    {(wp.date || wp.stayDuration || wp.notes) && (
                      <div className="mt-2.5 space-y-2">
                        {(wp.date || wp.stayDuration) && (
                          <div className="flex flex-wrap items-center gap-2">
                            {wp.date && (
                              <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300">
                                <Calendar className="w-3.5 h-3.5" /> {wp.date}
                              </span>
                            )}
                            {wp.stayDuration && (
                              <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300">
                                <Clock className="w-3.5 h-3.5" /> {wp.stayDuration}
                              </span>
                            )}
                          </div>
                        )}
                        {wp.notes && (
                          <div className="bg-amber-50/50 dark:bg-amber-500/5 px-3 py-2 rounded-lg border border-amber-100 dark:border-amber-500/10">
                            <p className="text-[11px] text-amber-800 dark:text-amber-200/80 leading-relaxed">
                              {wp.notes}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Leg Connector Row */}
                {!isLast && (
                  <div className="ml-3 pl-6 border-l-2 border-dashed border-slate-200 dark:border-slate-700/80 py-2 my-0.5 flex items-center justify-between text-[11px]">
                    <span className="text-slate-400 font-medium">Leg {idx + 1}</span>
                    {legDist ? (
                      <span className="font-bold text-evergreen dark:text-grapefruit bg-evergreen/10 dark:bg-grapefruit/10 px-2.5 py-0.5 rounded-full border border-evergreen/20 dark:border-grapefruit/20">
                        {legDist >= 10 ? Math.round(legDist) : legDist.toFixed(1)} km
                        {legDur ? ` • ${Math.round(legDur)} min` : ''}
                      </span>
                    ) : null}
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Footer CTA */}
        <div className="p-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <p className="text-[12px] text-slate-500 dark:text-slate-400">
            Powered by <strong className="text-slate-800 dark:text-slate-200">AnantYatra</strong>
          </p>
          <Button
            onClick={onClose}
            className="h-10 px-4 rounded-xl bg-evergreen dark:bg-grapefruit text-white font-bold text-[13px] flex items-center gap-1.5 shadow-md"
          >
            <Navigation className="w-4 h-4" /> Plan Your Own Trip
          </Button>
        </div>
      </div>
    </div>
  );
};
