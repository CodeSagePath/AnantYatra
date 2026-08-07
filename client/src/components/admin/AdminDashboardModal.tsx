import React, { useEffect, useState } from 'react';
import { checkinApi } from '../../api/endpoints';
import type { Checkin } from '../../types';
import { Car, Clock, MapPin, X, RefreshCw, ShieldAlert, Navigation } from 'lucide-react';
import { Button } from '../ui/button';

interface AdminDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCheckinOnMap?: (checkin: Checkin) => void;
}

function getRelativeTimeString(dateString: string): string {
  if (!dateString) return 'Recently';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'Recently';
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} mins ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hrs ago`;
  return `${Math.floor(diffInSeconds / 86400)} days ago`;
}

export const AdminDashboardModal: React.FC<AdminDashboardModalProps> = ({
  isOpen,
  onClose,
  onSelectCheckinOnMap,
}) => {
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAdminCheckins = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await checkinApi.getAdminCheckins();
      setCheckins(response.data);
    } catch (err: unknown) {
      const errorObj = err as { response?: { data?: { error?: string } }; customMessage?: string; message?: string };
      setError(errorObj?.response?.data?.error || errorObj?.customMessage || errorObj?.message || 'Failed to load admin location check-ins');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;

    checkinApi
      .getAdminCheckins()
      .then((res) => {
        if (active) {
          setCheckins(res.data);
        }
      })
      .catch((err: unknown) => {
        if (active) {
          const errorObj = err as { response?: { data?: { error?: string } }; customMessage?: string; message?: string };
          setError(errorObj?.response?.data?.error || errorObj?.customMessage || errorObj?.message || 'Failed to load admin location check-ins');
        }
      });

    return () => {
      active = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 md:p-6">
      <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col bg-white dark:bg-midnight-2 border border-slate-200 dark:border-white/10 rounded-3xl shadow-2xl overflow-hidden">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-evergreen/10 dark:bg-grapefruit/10 flex items-center justify-center text-evergreen dark:text-grapefruit">
              <Car className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base md:text-lg font-extrabold text-slate-900 dark:text-porcelain">
                Admin Location Tracking Dashboard
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Real-time user GPS check-ins, timestamps, and last seen indicators
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchAdminCheckins}
              disabled={loading}
              className="text-xs h-8 rounded-full border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/10 flex items-center justify-center text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 custom-scrollbar">
          {error && (
            <div className="p-3.5 text-xs bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 rounded-2xl border border-red-200 dark:border-red-800/40 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading && checkins.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-grapefruit" />
              <span>Loading latest user location logs...</span>
            </div>
          ) : checkins.length === 0 ? (
            <div className="p-12 text-center text-slate-400 dark:text-slate-500 text-xs border border-dashed border-slate-200 dark:border-white/10 rounded-2xl">
              <MapPin className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="font-semibold text-slate-700 dark:text-slate-300">No Check-in Activity Yet</p>
              <p className="text-[11px] text-slate-400 mt-1">Users will appear here when they perform a location check-in.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-white/10">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-midnight-1 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200 dark:border-white/10">
                  <tr>
                    <th className="py-3 px-4">User</th>
                    <th className="py-3 px-4">Location / Address</th>
                    <th className="py-3 px-4">Coordinates (Lat, Lng)</th>
                    <th className="py-3 px-4">Last Seen</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5 text-slate-700 dark:text-slate-300 font-medium">
                  {checkins.map((checkin) => (
                    <tr key={checkin.id} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors">
                      
                      {/* User Email */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-evergreen/10 dark:bg-grapefruit/10 flex items-center justify-center text-evergreen dark:text-grapefruit font-bold text-[11px]">
                            {checkin.user?.email?.[0]?.toUpperCase() || 'U'}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900 dark:text-porcelain truncate max-w-[160px]">
                              {checkin.user?.email || 'Unknown User'}
                            </p>
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-400">
                              {checkin.user?.role || 'USER'}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Location Address */}
                      <td className="py-3 px-4 max-w-[220px]">
                        <p className="truncate text-slate-800 dark:text-slate-200" title={checkin.address || 'GPS Location'}>
                          {checkin.address || 'GPS Coordinates Recorded'}
                        </p>
                      </td>

                      {/* Coordinates */}
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        {checkin.latitude.toFixed(5)}, {checkin.longitude.toFixed(5)}
                      </td>

                      {/* Last Seen Timestamp */}
                      <td className="py-3 px-4">
                        <div className="flex flex-col">
                          <span className="font-semibold text-evergreen dark:text-grapefruit text-[11px]">
                            {getRelativeTimeString(checkin.createdAt)}
                          </span>
                          <span className="text-[10px] text-slate-400 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(checkin.createdAt).toLocaleString()}
                          </span>
                        </div>
                      </td>

                      {/* Action: Focus Map */}
                      <td className="py-3 px-4 text-right">
                        <Button
                          size="sm"
                          onClick={() => {
                            if (onSelectCheckinOnMap) {
                              onSelectCheckinOnMap(checkin);
                            }
                            onClose();
                          }}
                          className="bg-evergreen/10 hover:bg-evergreen/20 dark:bg-grapefruit/10 dark:hover:bg-grapefruit/20 text-evergreen dark:text-grapefruit border border-evergreen/20 dark:border-grapefruit/20 text-[11px] h-7 rounded-full px-2.5"
                        >
                          <Navigation className="w-3 h-3 mr-1" />
                          View Map
                        </Button>
                      </td>

                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
