import React, { useState } from 'react';
import { X, Settings, ShieldAlert, CheckCircle2, MapPin } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { Button } from '../ui/button';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { autoCheckinEnabled, setAutoCheckinEnabled } = useAuthStore();
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md bg-white dark:bg-midnight-2 border border-slate-200 dark:border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 md:p-5 border-b border-slate-100 dark:border-white/5 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-evergreen/10 dark:bg-grapefruit/10 flex items-center justify-center">
              <Settings className="w-4 h-4 text-evergreen dark:text-grapefruit" />
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-slate-800 dark:text-porcelain">App Settings</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 dark:bg-midnight-1 text-slate-500 hover:text-slate-700 dark:hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-6">
          
          {/* Location Tracking Setting */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Privacy & Location</h3>
            
            <div className="flex items-start gap-3 p-4 rounded-2xl bg-slate-50 dark:bg-midnight-1 border border-slate-200/60 dark:border-white/5">
              <div className="mt-0.5">
                <MapPin className="w-5 h-5 text-evergreen dark:text-grapefruit" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <h4 className="text-[13px] font-bold text-slate-800 dark:text-slate-200">Auto-share Location</h4>
                  
                  {/* Custom Toggle Switch */}
                  <button 
                    onClick={() => setAutoCheckinEnabled(!autoCheckinEnabled)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${autoCheckinEnabled ? 'bg-evergreen dark:bg-grapefruit' : 'bg-slate-300 dark:bg-slate-600'}`}
                  >
                    <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${autoCheckinEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Automatically save and share your timestamped location when you open the app. This helps map your infinite journeys seamlessly.
                </p>
                <button 
                  onClick={() => setShowPrivacyPolicy(!showPrivacyPolicy)}
                  className="mt-2 text-[11px] font-semibold text-evergreen dark:text-grapefruit hover:underline"
                >
                  {showPrivacyPolicy ? 'Hide Privacy Policy' : 'View Privacy Policy & Terms'}
                </button>
              </div>
            </div>

            {/* Expandable Privacy Policy */}
            {showPrivacyPolicy && (
              <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200/50 dark:border-amber-700/30 text-[11px] text-amber-800 dark:text-amber-200/70 space-y-2">
                <div className="flex items-center gap-1.5 mb-2 font-bold text-amber-900 dark:text-amber-400">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  Privacy & Data Collection
                </div>
                <p>
                  <strong>1. Data Collection:</strong> When "Auto-share Location" is enabled, AnantYatra automatically collects your device's GPS coordinates and timestamp each time you launch or log into the application.
                </p>
                <p>
                  <strong>2. Purpose:</strong> This data is used solely to provide real-time location tracking features and historical check-in visualization.
                </p>
                <p>
                  <strong>3. Storage & Security:</strong> Your location data is stored securely on our servers and is associated with your account. It will not be sold to third-party advertisers.
                </p>
                <p>
                  <strong>4. User Rights:</strong> You may toggle this feature off at any time. When disabled, your location will only be updated if you manually perform a "Check In".
                </p>
                <p className="pt-1 flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                  <CheckCircle2 className="w-3 h-3" /> You are in control of your data.
                </p>
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 md:p-5 border-t border-slate-100 dark:border-white/5 shrink-0">
          <Button onClick={onClose} className="w-full bg-slate-800 hover:bg-slate-900 dark:bg-white dark:text-slate-900 h-11 rounded-xl font-bold">
            Done
          </Button>
        </div>
      </div>
    </div>
  );
};
