import React, { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRegisterUserFcmToken } from './useRegisterUserFcmToken';
import { isNativeApp, checkNativePushPermission } from '@/lib/capacitor-push';
import { isFirebaseConfigured } from '@/lib/firebase';

const BANNER_DISMISSED_KEY = 'notification_banner_dismissed';

export function NotificationBanner() {
  const [showBanner, setShowBanner] = useState(false);
  const { registerToken, isRegistering, isRegistered, isSupported } = useRegisterUserFcmToken();

  useEffect(() => {
    const checkAndShowBanner = async () => {
      // Don't show if not supported
      if (!isSupported) return;

      // Don't show if already dismissed
      const dismissed = localStorage.getItem(BANNER_DISMISSED_KEY);
      if (dismissed) return;

      if (isNativeApp()) {
        // Native app - check Capacitor push permission
        const permission = await checkNativePushPermission();
        if (permission === 'granted' || permission === 'denied') return;
      } else {
        // Web - check browser notification permission
        if (!isFirebaseConfigured()) return;
        if ('Notification' in window && Notification.permission !== 'default') return;
      }

      // Show banner for first-time users
      setShowBanner(true);
    };

    checkAndShowBanner();
  }, [isSupported]);

  const handleEnable = async () => {
    await registerToken(true);
    setShowBanner(false);
    localStorage.setItem(BANNER_DISMISSED_KEY, 'true');
  };

  const handleDismiss = () => {
    setShowBanner(false);
    localStorage.setItem(BANNER_DISMISSED_KEY, 'true');
  };

  if (!showBanner || isRegistered) return null;

  return (
    <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
          <Bell className="w-5 h-5 text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-800 text-sm">Stay Updated!</h3>
          <p className="text-xs text-gray-600 mt-0.5">
            Get notified when your worker is assigned or on the way.
          </p>
          <div className="flex gap-2 mt-3">
            <Button 
              size="sm" 
              onClick={handleEnable}
              disabled={isRegistering}
              className="h-8 px-4 rounded-full bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium"
            >
              {isRegistering ? 'Enabling...' : 'Enable Notifications'}
            </Button>
            <Button 
              size="sm" 
              variant="ghost"
              onClick={handleDismiss}
              className="h-8 px-3 rounded-full text-gray-500 hover:text-gray-700 text-xs"
            >
              Not Now
            </Button>
          </div>
        </div>
        <button 
          onClick={handleDismiss}
          className="text-gray-400 hover:text-gray-600 p-1"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
