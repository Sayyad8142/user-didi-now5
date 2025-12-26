import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useProfile } from '@/contexts/ProfileContext';
import { useToast } from '@/hooks/use-toast';
import { getFcmToken, isFirebaseConfigured, onForegroundMessage, showForegroundNotification } from '@/lib/firebase';
import { isNativeApp, registerNativePush, checkNativePushPermission, setupNativePushListeners } from '@/lib/capacitor-push';

export function useRegisterUserFcmToken() {
  const [isRegistering, setIsRegistering] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const { user } = useAuth();
  const { profile } = useProfile();
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
    // Use profile.id (database UUID) for storing FCM token, not user.id (Firebase UID)
    if (!profile?.id) {
      console.warn('⚠️ No profile loaded');
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

      // Upsert token to database using profile.id (database UUID)
      const { error } = await supabase
        .from('fcm_tokens')
        .upsert(
          {
            user_id: profile.id,
            token: fcmToken,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'user_id',
            ignoreDuplicates: false,
          }
        );

      if (error) {
        console.error('❌ Error saving FCM token:', error);
        
        // Try insert if upsert fails
        const { error: insertError } = await supabase
          .from('fcm_tokens')
          .insert({
            user_id: profile.id,
            token: fcmToken,
            updated_at: new Date().toISOString(),
          });
        
        if (insertError && !insertError.message.includes('duplicate')) {
          if (showToast) {
            toast({
              title: 'Error',
              description: 'Failed to save notification settings',
              variant: 'destructive',
            });
          }
          return false;
        }
      }

      setIsRegistered(true);
      
      if (showToast) {
        toast({
          title: 'Notifications enabled',
          description: "You'll receive updates about your bookings",
        });
      }

      console.log('✅ FCM token registered for profile:', profile.id);
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
  }, [profile?.id, toast]);

  // Check if user already has a token registered
  const checkExistingToken = useCallback(async (): Promise<boolean> => {
    if (!profile?.id) return false;

    try {
      const { data, error } = await supabase
        .from('fcm_tokens')
        .select('token')
        .eq('user_id', profile.id)
        .maybeSingle();

      if (error) {
        console.error('❌ Error checking existing token:', error);
        return false;
      }

      const hasToken = !!data?.token;
      setIsRegistered(hasToken);
      return hasToken;
    } catch (err) {
      console.error('❌ Error in checkExistingToken:', err);
      return false;
    }
  }, [profile?.id]);

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
