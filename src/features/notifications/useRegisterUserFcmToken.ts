import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useToast } from '@/hooks/use-toast';
import { getFcmToken, isFirebaseConfigured, onForegroundMessage, showForegroundNotification } from '@/lib/firebase';

export function useRegisterUserFcmToken() {
  const [isRegistering, setIsRegistering] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  // Set up foreground message listener
  useEffect(() => {
    if (!isFirebaseConfigured()) return;

    const unsubscribe = onForegroundMessage((payload) => {
      console.log('📩 Foreground notification:', payload);
      
      // Show toast for in-app notification
      const title = payload.data?.title || payload.notification?.title || 'Notification';
      const body = payload.data?.body || payload.notification?.body || '';
      
      toast({
        title,
        description: body,
      });

      // Also show browser notification
      showForegroundNotification(payload);
    });

    return unsubscribe;
  }, [toast]);

  const registerToken = useCallback(async (showToast = true): Promise<boolean> => {
    if (!user?.id) {
      console.warn('⚠️ No user logged in');
      return false;
    }

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

    // Check if notifications are supported
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

    setIsRegistering(true);

    try {
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
      const fcmToken = await getFcmToken();
      
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

      // Get device info
      const deviceInfo = `${navigator.userAgent.substring(0, 100)}`;

      // Upsert token to database - use composite key (user_id, token)
      const { error } = await supabase
        .from('fcm_tokens')
        .upsert(
          {
            user_id: user.id,
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
            user_id: user.id,
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
      const { data, error } = await supabase
        .from('fcm_tokens')
        .select('token')
        .eq('user_id', user.id)
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
  }, [user?.id]);

  return {
    registerToken,
    checkExistingToken,
    isRegistering,
    isRegistered,
    isSupported: typeof window !== 'undefined' && 'Notification' in window && isFirebaseConfigured(),
  };
}
