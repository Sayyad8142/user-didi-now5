import { useEffect, useRef, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

/**
 * Hook that detects when the app resumes (returns from another app)
 * Uses Capacitor App plugin on native, visibility change on web
 */
export function useAppResume(onResume: () => void) {
  const pendingRef = useRef(false);
  const callbackRef = useRef(onResume);
  
  // Keep callback ref updated
  useEffect(() => {
    callbackRef.current = onResume;
  }, [onResume]);

  const setPending = useCallback(() => {
    pendingRef.current = true;
  }, []);

  useEffect(() => {
    const platform = Capacitor.getPlatform();

    if (platform === 'android' || platform === 'ios') {
      // Native: use Capacitor App plugin
      const listener = App.addListener('appStateChange', ({ isActive }) => {
        if (isActive && pendingRef.current) {
          pendingRef.current = false;
          // Small delay to ensure the app is fully resumed
          setTimeout(() => {
            callbackRef.current();
          }, 300);
        }
      });

      return () => {
        listener.then(l => l.remove());
      };
    } else {
      // Web: use visibility change
      const handleVisibility = () => {
        if (document.visibilityState === 'visible' && pendingRef.current) {
          pendingRef.current = false;
          setTimeout(() => {
            callbackRef.current();
          }, 300);
        }
      };

      document.addEventListener('visibilitychange', handleVisibility);
      return () => {
        document.removeEventListener('visibilitychange', handleVisibility);
      };
    }
  }, []);

  return { setPending };
}
