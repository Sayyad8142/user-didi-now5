import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useToast } from '@/hooks/use-toast';
import { getFcmToken, isFirebaseConfigured } from '@/lib/firebase';

export function useRegisterUserFcmToken() {
  const [isRegistering, setIsRegistering] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  const registerToken = useCallback(async (showToast = true): Promise<boolean> => {
    if (!user?.id) {
      console.warn('No user logged in');
      return false;
    }

    if (!isFirebaseConfigured()) {
      console.warn('Firebase not configured');
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
            description: 'Failed to get notification token',
            variant: 'destructive',
          });
        }
        return false;
      }

      // Upsert token to database
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
          }
        );

      if (error) {
        console.error('Error saving FCM token:', error);
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
      console.error('Error registering FCM token:', error);
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

    const { data } = await supabase
      .from('fcm_tokens')
      .select('token')
      .eq('user_id', user.id)
      .single();

    const hasToken = !!data?.token;
    setIsRegistered(hasToken);
    return hasToken;
  }, [user?.id]);

  return {
    registerToken,
    checkExistingToken,
    isRegistering,
    isRegistered,
    isSupported: 'Notification' in window && isFirebaseConfigured(),
  };
}
