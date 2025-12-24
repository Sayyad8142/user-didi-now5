import React, { useEffect, useState } from 'react';
import { Bell, BellOff, Loader2 } from 'lucide-react';
import { useRegisterUserFcmToken } from './useRegisterUserFcmToken';
import { isNativeApp, checkNativePushPermission } from '@/lib/capacitor-push';
import { isFirebaseConfigured } from '@/lib/firebase';

export function NotificationButtonCompact() {
  const { 
    registerToken, 
    checkExistingToken, 
    isRegistering, 
    isRegistered, 
    isSupported 
  } = useRegisterUserFcmToken();
  
  const [permissionState, setPermissionState] = useState<'granted' | 'denied' | 'prompt'>('prompt');

  useEffect(() => {
    const checkPermission = async () => {
      if (isNativeApp()) {
        const permission = await checkNativePushPermission();
        setPermissionState(permission);
      } else if ('Notification' in window) {
        setPermissionState(Notification.permission as 'granted' | 'denied' | 'prompt');
      }
    };
    
    checkPermission();
    checkExistingToken();
  }, [checkExistingToken]);

  // Don't show if not supported
  if (!isSupported) {
    return null;
  }

  const handleClick = async () => {
    await registerToken(true);
    
    if (isNativeApp()) {
      const permission = await checkNativePushPermission();
      setPermissionState(permission);
    } else if ('Notification' in window) {
      setPermissionState(Notification.permission as 'granted' | 'denied' | 'prompt');
    }
  };

  const isEnabled = isRegistered && permissionState === 'granted';
  const isDenied = permissionState === 'denied';

  // Don't show if already enabled
  if (isEnabled) return null;

  return (
    <button
      onClick={handleClick}
      disabled={isRegistering || isDenied}
      className={`flex items-center gap-3 w-full p-4 rounded-2xl border transition-spring hover:scale-[0.98] ${
        isDenied
          ? 'bg-gray-100 border-gray-200 cursor-not-allowed opacity-60'
          : 'bg-white border-gray-100 hover:bg-amber-50 hover:border-amber-200'
      }`}
    >
      <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
        isDenied ? 'bg-gray-200' : 'bg-amber-100'
      }`}>
        {isRegistering ? (
          <Loader2 className="w-5 h-5 text-amber-600 animate-spin" />
        ) : isDenied ? (
          <BellOff className="w-5 h-5 text-gray-500" />
        ) : (
          <Bell className="w-5 h-5 text-amber-600" />
        )}
      </div>
      <div className="flex-1 text-left">
        <span className="font-medium text-gray-800 text-sm block">
          {isDenied ? 'Notifications Blocked' : 'Enable Notifications'}
        </span>
        <span className="text-xs text-gray-500">
          {isDenied 
            ? `Enable in ${isNativeApp() ? 'device' : 'browser'} settings` 
            : 'Get updates on your bookings'}
        </span>
      </div>
      {!isDenied && (
        <div className="text-amber-500 font-medium text-sm">
          Enable →
        </div>
      )}
    </button>
  );
}
