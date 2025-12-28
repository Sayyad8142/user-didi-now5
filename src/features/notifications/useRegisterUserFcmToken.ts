import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useToast } from '@/hooks/use-toast';
import {
  getFcmToken,
  getFirebaseIdToken,
  isFirebaseConfigured,
  onForegroundMessage,
  showForegroundNotification,
} from '@/lib/firebase';
import { isNativeApp, registerNativePush, checkNativePushPermission, setupNativePushListeners } from '@/lib/capacitor-push';

export function useRegisterUserFcmToken() {
  const [isRegistering, setIsRegistering] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  // Set up notification listeners based on platform
  useEffect(() => {
    if (isNativeApp()) {
      // Native push notification listeners
      const cleanup = setupNativePushListeners(
        (notification) => {
          console.log('📩 Native notification received:', notification);
          toast({
            title: notification.title || 'Notification',
            description: notification.body || '',
          });
        },
        (action) => {
          console.log('📩 Native notification tapped:', action);
          // Handle notification tap - could navigate to relevant screen
          const data = action.notification.data;
          if (data?.booking_id) {
            window.location.href = `/bookings?id=${data.booking_id}`;
          }
        }
      );
      return cleanup;
    } else {
      // Web foreground message listener
      if (!isFirebaseConfigured()) return;

      const unsubscribe = onForegroundMessage((payload) => {
        console.log('📩 Foreground notification:', payload);
        
        const title = payload.data?.title || payload.notification?.title || 'Notification';
        const body = payload.data?.body || payload.notification?.body || '';
        
        toast({
          title,
          description: body,
        });

        showForegroundNotification(payload);
      });

      return unsubscribe;
    }
  }, [toast]);

  const registerToken = useCallback(async (showToast = true): Promise<boolean> => {
    // Use user.id (auth.uid()) for storing FCM token - this must match auth.uid() for RLS policies
    if (!user?.id) {
      console.warn('⚠️ No authenticated user');
      return false;
    }

    setIsRegistering(true);

    try {
      let fcmToken: string | null = null;

      if (isNativeApp()) {
        // Native app - use Capacitor Push Notifications
        console.log('📱 Registering native push notifications...');
        const result = await registerNativePush();

        if (!result || !result.ok) {
          if (showToast) {
            if (result && result.ok === false && result.reason === 'permission_denied') {
              toast({
                title: 'Permission denied',
                description: 'Please enable notifications in your device settings',
                variant: 'destructive',
              });
            } else if (result && result.ok === false && result.reason === 'timeout') {
              toast({
                title: 'Could not get device token',
                description:
                  'Please reinstall the latest app build (with Firebase config) and ensure Google Play services is enabled.',
                variant: 'destructive',
              });
            } else {
              toast({
                title: 'Error',
                description:
                  'Push setup failed. Please reinstall the latest app build and try again.',
                variant: 'destructive',
              });
            }
          }
          return false;
        }

        fcmToken = result.token;
      } else {
        // Web app - use Firebase Web Push
        if (!isFirebaseConfigured()) {
          console.warn('⚠️ Firebase not configured');
          if (showToast) {
            toast({
              title: 'Notifications unavailable',
              description: 'Push notifications are not configured yet',
              variant: 'destructive',
            });
          }
          return false;
        }

        // Check if notifications are supported in browser
        if (!('Notification' in window)) {
          if (showToast) {
            toast({
              title: 'Not supported',
              description: 'Push notifications are not supported in this browser',
              variant: 'destructive',
            });
          }
          return false;
        }

        // Request permission
        const permission = await Notification.requestPermission();
        
        if (permission !== 'granted') {
          if (showToast) {
            toast({
              title: 'Permission denied',
              description: 'Please enable notifications in your browser settings',
              variant: 'destructive',
            });
          }
          return false;
        }

        // Get FCM token
        fcmToken = await getFcmToken();
      }
      
      if (!fcmToken) {
        if (showToast) {
          toast({
            title: 'Error',
            description: 'Failed to get notification token. Try again.',
            variant: 'destructive',
          });
        }
        return false;
      }

      // Save token securely via Edge Function (Firebase auth → verified server-side)
      const firebaseIdToken = await getFirebaseIdToken();
      if (!firebaseIdToken) {
        console.warn('⚠️ Missing Firebase ID token');
        if (showToast) {
          toast({
            title: 'Error',
            description: 'Please sign in again and retry',
            variant: 'destructive',
          });
        }
        return false;
      }

      const { error: fnError, data: fnData } = await supabase.functions.invoke('register-fcm-token', {
        body: {
          action: 'upsert',
          firebase_id_token: firebaseIdToken,
          fcm_token: fcmToken,
          device_info: isNativeApp() ? navigator.userAgent : 'web',
        },
      });

      if (fnError || !fnData?.ok) {
        console.error('❌ Error saving FCM token (edge):', fnError, fnData);
        if (showToast) {
          toast({
            title: 'Error',
            description: 'Failed to save notification settings',
            variant: 'destructive',
          });
        }
        return false;
      }

      setIsRegistered(true);
      
      if (showToast) {
        toast({
          title: 'Notifications enabled',
          description: "You'll receive updates about your bookings",
        });
      }

      console.log('✅ FCM token registered for user:', user.id);
      return true;

    } catch (error) {
      console.error('❌ Error registering FCM token:', error);
      if (showToast) {
        toast({
          title: 'Error',
          description: 'Failed to enable notifications',
          variant: 'destructive',
        });
      }
      return false;
    } finally {
      setIsRegistering(false);
    }
  }, [user?.id, toast]);

  // Check if user already has a token registered
  const checkExistingToken = useCallback(async (): Promise<boolean> => {
    if (!user?.id) return false;

    try {
      const firebaseIdToken = await getFirebaseIdToken();
      if (!firebaseIdToken) return false;

      const { data: fnData, error: fnError } = await supabase.functions.invoke('register-fcm-token', {
        body: {
          action: 'exists',
          firebase_id_token: firebaseIdToken,
        },
      });

      if (fnError || !fnData?.ok) {
        console.error('❌ Error checking existing token (edge):', fnError, fnData);
        return false;
      }

      const hasToken = !!fnData?.has_token;
      setIsRegistered(hasToken);
      return hasToken;
    } catch (err) {
      console.error('❌ Error in checkExistingToken:', err);
      return false;
    }
  }, [user?.id]);

  // Determine if notifications are supported on this platform
  const isSupported = isNativeApp() || (typeof window !== 'undefined' && 'Notification' in window && isFirebaseConfigured());

  return {
    registerToken,
    checkExistingToken,
    isRegistering,
    isRegistered,
    isSupported,
  };
}
