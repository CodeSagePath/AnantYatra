import React, { useState, useEffect } from 'react';
import { X, Download } from 'lucide-react';
import { Button } from '../ui/button';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed', platform: string }>;
}

export const InstallAppBanner: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check if the app is already installed or if the user previously dismissed the prompt
    const isDismissed = localStorage.getItem('anantyatra_pwa_dismissed');
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;

    if (isStandalone || isDismissed) {
      return;
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Update UI notify the user they can install the PWA
      setIsVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    const handleAppInstalled = () => {
      setIsVisible(false);
      setDeferredPrompt(null);
      console.log('PWA was installed');
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    
    // Show the install prompt
    deferredPrompt.prompt();
    
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setIsVisible(false);
    }
    
    // We've used the prompt, and can't use it again, throw it away
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem('anantyatra_pwa_dismissed', 'true');
  };

  if (!isVisible) return null;

  return (
    <div className="fixed top-2 md:top-4 left-1/2 -translate-x-1/2 w-[calc(100%-16px)] md:w-auto max-w-md z-[4000] animate-in slide-in-from-top-4 fade-in duration-300">
      <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-700 shadow-xl rounded-2xl p-3 md:p-4 flex items-center justify-between gap-4">
        
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 md:w-12 md:h-12 bg-evergreen dark:bg-grapefruit rounded-xl shadow-inner flex items-center justify-center shrink-0">
            <Download className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col min-w-0">
            <p className="text-[13px] md:text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
              Install AnantYatra
            </p>
            <p className="text-[11px] md:text-xs text-slate-500 dark:text-slate-400 leading-tight line-clamp-2">
              Add to Home Screen for faster access and background location tracking.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button 
            size="sm" 
            onClick={handleInstallClick}
            className="bg-evergreen hover:bg-evergreen/90 dark:bg-grapefruit dark:hover:bg-grapefruit/90 text-white rounded-xl text-xs h-8 md:h-9 px-3 md:px-4"
          >
            Install
          </Button>
          <button 
            onClick={handleDismiss}
            className="w-8 h-8 md:w-9 md:h-9 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4 md:w-4 md:h-4" />
          </button>
        </div>
        
      </div>
    </div>
  );
};
