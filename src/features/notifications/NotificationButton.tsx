import React, { useEffect, useState } from 'react';
import { Bell, BellOff, Loader2 } from 'lucide-react';
import { useRegisterUserFcmToken } from './useRegisterUserFcmToken';
import { isNativeApp, checkNativePushPermission } from '@/lib/capacitor-push';
import { isFirebaseConfigured } from '@/lib/firebase';

export function NotificationButton() {
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

  // Show button for native apps or web with Firebase configured
  if (!isSupported) {
    return null;
  }

  const handleClick = async () => {
    await registerToken(true);
    
    // Update permission state after request
    if (isNativeApp()) {
      const permission = await checkNativePushPermission();
      setPermissionState(permission);
    } else if ('Notification' in window) {
      setPermissionState(Notification.permission as 'granted' | 'denied' | 'prompt');
    }
  };

  const isEnabled = isRegistered && permissionState === 'granted';
  const isDenied = permissionState === 'denied';

  return (
    <button
      onClick={handleClick}
      disabled={isRegistering || isDenied}
      className={`flex items-center justify-between h-14 px-4 rounded-2xl border transition-spring hover:scale-[0.98] shadow-input w-full ${
        isEnabled
          ? 'bg-green-50 border-green-200 hover:bg-green-100'
          : isDenied
          ? 'bg-gray-100 border-gray-200 cursor-not-allowed opacity-60'
          : 'bg-white/80 border-gray-100 hover:bg-white'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${
          isEnabled ? 'bg-green-200' : isDenied ? 'bg-gray-200' : 'bg-amber-100'
        }`}>
          {isRegistering ? (
            <Loader2 className="w-5 h-5 text-amber-600 animate-spin" />
          ) : isDenied ? (
            <BellOff className="w-5 h-5 text-gray-500" />
          ) : (
            <Bell className={`w-5 h-5 ${isEnabled ? 'text-green-600' : 'text-amber-600'}`} />
          )}
        </div>
        <div className="text-left">
          <span className="font-medium text-gray-700 block">
            {isDenied 
              ? 'Notifications Blocked' 
              : isEnabled 
              ? 'Notifications Enabled' 
              : 'Enable Notifications'}
          </span>
          {isDenied && (
            <span className="text-xs text-gray-500">
              Enable in {isNativeApp() ? 'device' : 'browser'} settings
            </span>
          )}
        </div>
      </div>
      {!isDenied && (
        <div className="text-gray-400">
          {isEnabled ? '✓' : '›'}
        </div>
      )}
    </button>
  );
}
