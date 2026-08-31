import React from 'react';
import { Calendar, AlertCircle, X, RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';

export type PropagationModalType = 'ripple' | 'start_date' | 'clear';

export interface DatePropagationModalProps {
  isOpen: boolean;
  type: PropagationModalType;
  stopIndex: number;
  stopName: string;
  newDate?: string;
  totalStops: number;
  onConfirmDownstream: () => void;
  onConfirmSingle: () => void;
  onClose: () => void;
}

export const DatePropagationModal: React.FC<DatePropagationModalProps> = ({
  isOpen,
  type,
  stopIndex,
  stopName,
  newDate,
  totalStops,
  onConfirmDownstream,
  onConfirmSingle,
  onClose,
}) => {
  if (!isOpen) return null;

  const stopNumber = stopIndex + 1;
  const hasSubsequent = stopIndex < totalStops - 1;
  const subsequentRange = hasSubsequent ? `Stops ${stopNumber + 1} to ${totalStops}` : '';

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md bg-white dark:bg-[#0f172a] rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-evergreen/10 dark:bg-grapefruit/10 flex items-center justify-center text-evergreen dark:text-grapefruit shrink-0">
              {type === 'clear' ? (
                <AlertCircle className="w-5 h-5 text-amber-500" />
              ) : (
                <Calendar className="w-5 h-5" />
              )}
            </div>
            <div>
              <h3 className="font-bold text-[16px] text-slate-900 dark:text-white">
                {type === 'start_date' && 'Sync Trip Start Date?'}
                {type === 'ripple' && 'Update Subsequent Stop Dates?'}
                {type === 'clear' && 'Clear Downstream Dates?'}
              </h3>
              <p className="text-[12px] text-slate-500 dark:text-slate-400">
                Stop {stopNumber}: <span className="font-semibold text-slate-700 dark:text-slate-200">{stopName}</span>
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

        {/* Modal Content */}
        <div className="p-6 space-y-4">
          <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700/50 text-[13px] text-slate-600 dark:text-slate-300 leading-relaxed">
            {type === 'start_date' && (
              <p>
                You changed the date for <strong className="text-slate-900 dark:text-white">Stop 1 ({stopName})</strong> to <span className="text-evergreen dark:text-grapefruit font-bold">{newDate}</span>. Would you like to set this as your overall <strong>Trip Start Date</strong> and recalculate downstream stops?
              </p>
            )}
            {type === 'ripple' && (
              <p>
                Updating <strong className="text-slate-900 dark:text-white">Stop {stopNumber}</strong> can automatically adjust arrival dates for all subsequent stops ({subsequentRange}) in a smooth chain reaction.
              </p>
            )}
            {type === 'clear' && (
              <p>
                You cleared the date for <strong className="text-slate-900 dark:text-white">Stop {stopNumber}</strong>. Would you like to clear dates for subsequent stops ({subsequentRange}) as well?
              </p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-2 pt-1">
            <Button
              onClick={() => {
                onConfirmDownstream();
                onClose();
              }}
              className="w-full h-11 text-[13px] font-bold rounded-2xl bg-evergreen hover:bg-evergreen/90 dark:bg-grapefruit dark:hover:bg-grapefruit/90 text-white shadow-md flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4 shrink-0" />
              <span>
                {type === 'start_date' && 'Sync Trip Start Date & Ripple All Stops'}
                {type === 'ripple' && `Update Dates for ${subsequentRange || 'Subsequent Stops'}`}
                {type === 'clear' && `Clear Dates for ${subsequentRange || 'Subsequent Stops'}`}
              </span>
            </Button>

            <Button
              variant="outline"
              onClick={() => {
                onConfirmSingle();
                onClose();
              }}
              className="w-full h-11 text-[13px] font-semibold rounded-2xl border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <span>
                {type === 'start_date' && 'Update Stop 1 Only'}
                {type === 'ripple' && `Update Stop ${stopNumber} Only`}
                {type === 'clear' && `Clear Stop ${stopNumber} Only`}
              </span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
