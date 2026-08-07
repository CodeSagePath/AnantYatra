import React, { useState } from 'react';
import { checkinApi } from '../../api/endpoints';
import type { Checkin } from '../../types';
import { Car, MapPin, Copy, Check, X, Loader2, Navigation, Clock, Share2 } from 'lucide-react';
import { Button } from '../ui/button';

interface CheckinModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CheckinModal: React.FC<CheckinModalProps> = ({ isOpen, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkinData, setCheckinData] = useState<Checkin | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handlePerformCheckin = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      return;
    }

    setLoading(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;

        try {
          const response = await checkinApi.createCheckin({ latitude, longitude });
          setCheckinData(response.data);
        } catch (err: unknown) {
          const errorObj = err as { response?: { data?: { error?: string } }; customMessage?: string; message?: string };
          setError(errorObj?.response?.data?.error || errorObj?.customMessage || errorObj?.message || 'Failed to submit location check-in.');
        } finally {
          setLoading(false);
        }
      },
      (geoErr) => {
        setLoading(false);
        setError(`Location access denied or unavailable: ${geoErr.message}`);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const getShareableUrl = () => {
    if (!checkinData) return '';
    return `${window.location.origin}/?checkin=${checkinData.shareToken}`;
  };

  const handleCopyLink = () => {
    const url = getShareableUrl();
    if (url) {
      navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md bg-white dark:bg-midnight-2 border border-slate-200 dark:border-white/10 rounded-2xl p-6 shadow-2xl space-y-4">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 border-b border-slate-100 dark:border-white/10 pb-3">
          <div className="w-10 h-10 rounded-full bg-evergreen/10 dark:bg-grapefruit/10 flex items-center justify-center text-evergreen dark:text-grapefruit">
            <Navigation className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-porcelain">Location Check-In</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Share your current live location & timestamp</p>
          </div>
        </div>

        {/* Initial Check-in Trigger state */}
        {!checkinData && (
          <div className="space-y-4 text-center py-2">
            <div className="w-16 h-16 mx-auto rounded-full bg-slate-100 dark:bg-midnight-1 flex items-center justify-center text-evergreen dark:text-grapefruit border border-slate-200 dark:border-white/10">
              <Car className="w-8 h-8" />
            </div>

            {error && (
              <div className="p-3 text-xs bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 rounded-xl border border-red-200 dark:border-red-800/40">
                {error}
              </div>
            )}

            <Button
              onClick={handlePerformCheckin}
              disabled={loading}
              className="w-full bg-evergreen hover:bg-evergreen/90 dark:bg-grapefruit dark:hover:bg-grapefruit/90 text-white font-semibold py-2.5 rounded-xl flex items-center justify-center gap-2 shadow-md transition-all"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Fetching Location GPS...</span>
                </>
              ) : (
                <>
                  <Navigation className="w-4 h-4" />
                  <span>Check In Current Location</span>
                </>
              )}
            </Button>
          </div>
        )}

        {/* Result state after successful Check-in */}
        {checkinData && (
          <div className="space-y-4">
            <div className="p-4 bg-slate-50 dark:bg-midnight-1 rounded-xl border border-slate-200 dark:border-white/10 space-y-2.5">
              <div className="flex items-center justify-between text-xs font-semibold text-evergreen dark:text-grapefruit">
                <span className="flex items-center gap-1.5">
                  <Car className="w-4 h-4" />
                  Live Geocode Tracked
                </span>
                <span className="text-[10px] text-slate-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {new Date(checkinData.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              <div className="text-xs text-slate-700 dark:text-slate-300 flex items-start gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-grapefruit shrink-0 mt-0.5" />
                <span>{checkinData.address || `${checkinData.latitude.toFixed(5)}, ${checkinData.longitude.toFixed(5)}`}</span>
              </div>

              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono bg-white dark:bg-slate-900/60 p-2 rounded-lg border border-slate-200 dark:border-white/5">
                Lat: {checkinData.latitude.toFixed(6)} | Lng: {checkinData.longitude.toFixed(6)}
              </div>
            </div>

            {/* Shareable Link Box */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <Share2 className="w-3 h-3 text-grapefruit" />
                Sharable Callback Link
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={getShareableUrl()}
                  className="flex-1 text-xs bg-slate-100 dark:bg-midnight-1 text-slate-800 dark:text-slate-200 p-2.5 rounded-xl border border-slate-200 dark:border-white/10 outline-none select-all font-mono"
                />
                <Button
                  onClick={handleCopyLink}
                  className="bg-evergreen dark:bg-grapefruit text-white text-xs px-3 py-2.5 rounded-xl flex items-center gap-1 shrink-0"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </Button>
              </div>
            </div>

            <Button
              onClick={onClose}
              variant="outline"
              className="w-full text-xs text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/10 rounded-xl"
            >
              Done
            </Button>
          </div>
        )}

      </div>
    </div>
  );
};
