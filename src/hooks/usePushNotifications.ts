import { useState, useCallback, useEffect, useRef } from 'react';
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';

interface PushNotificationState {
  isSupported: boolean;
  isRegistered: boolean;
  isRegistering: boolean;
  permissionStatus: 'granted' | 'denied' | 'prompt' | 'unknown';
}

export function usePushNotifications() {
  const [state, setState] = useState<PushNotificationState>({
    isSupported: false,
    isRegistered: false,
    isRegistering: false,
    permissionStatus: 'unknown',
  });

  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const listenerCleanupRef = useRef<(() => void) | null>(null);

  // Check if we're on a native platform
  const isNative = Capacitor.isNativePlatform();

  // Initialize and check support
  useEffect(() => {
    setState(prev => ({
      ...prev,
      isSupported: isNative,
    }));

    if (isNative) {
      checkPermissionStatus();
    }
  }, [isNative]);

  // Check current permission status
  const checkPermissionStatus = useCallback(async () => {
    if (!isNative) return;

    try {
      const result = await PushNotifications.checkPermissions();
      setState(prev => ({
        ...prev,
        permissionStatus: result.receive as 'granted' | 'denied' | 'prompt',
      }));
    } catch (err) {
      console.error('Error checking push permission:', err);
    }
  }, [isNative]);

  // Handle incoming notification (foreground)
  const handleNotificationReceived = useCallback((notification: any) => {
    console.log('📩 Push notification received:', notification);

    const title = notification.title || notification.data?.title || 'Notification';
    const body = notification.body || notification.data?.body || '';

    // Show toast for foreground notifications
    toast({
      title,
      description: body,
      duration: 5000,
    });
  }, [toast]);

  // Handle notification tap
  const handleNotificationAction = useCallback((notification: any) => {
    console.log('👆 Push notification tapped:', notification);

    const data = notification.notification?.data || notification.data || {};
    const bookingId = data.booking_id;
    const notificationType = data.notification_type;

    // Navigate based on notification type
    if (bookingId) {
      navigate(`/bookings?id=${bookingId}`);
    } else if (notificationType === 'chat') {
      navigate('/support');
    } else {
      navigate('/');
    }
  }, [navigate]);

  // Set up notification listeners
  const setupListeners = useCallback(async () => {
    if (!isNative || listenerCleanupRef.current) return;

    try {
      // Listener for received notifications (foreground)
      const receivedListener = await PushNotifications.addListener(
        'pushNotificationReceived',
        handleNotificationReceived
      );

      // Listener for notification tap
      const actionListener = await PushNotifications.addListener(
        'pushNotificationActionPerformed',
        handleNotificationAction
      );

      // Store cleanup function
      listenerCleanupRef.current = () => {
        receivedListener.remove();
        actionListener.remove();
      };

      console.log('✅ Push notification listeners set up');
    } catch (err) {
      console.error('Error setting up push listeners:', err);
    }
  }, [isNative, handleNotificationReceived, handleNotificationAction]);

  // Clean up listeners
  const cleanupListeners = useCallback(() => {
    if (listenerCleanupRef.current) {
      listenerCleanupRef.current();
      listenerCleanupRef.current = null;
      console.log('🧹 Push notification listeners cleaned up');
    }
  }, []);

  // Request permission and register for push
  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isNative) {
      console.warn('Push notifications only work on native platforms');
      return false;
    }

    setState(prev => ({ ...prev, isRegistering: true }));

    try {
      // Check current permission
      const currentStatus = await PushNotifications.checkPermissions();

      if (currentStatus.receive === 'denied') {
        toast({
          title: 'Notifications Blocked',
          description: 'Please enable notifications in your device settings.',
          variant: 'destructive',
        });
        setState(prev => ({ ...prev, isRegistering: false, permissionStatus: 'denied' }));
        return false;
      }

      // Request permission if not granted
      if (currentStatus.receive !== 'granted') {
        const result = await PushNotifications.requestPermissions();
        if (result.receive !== 'granted') {
          setState(prev => ({ ...prev, isRegistering: false, permissionStatus: 'denied' }));
          return false;
        }
      }

      // Register for push notifications
      await PushNotifications.register();
      setState(prev => ({ ...prev, permissionStatus: 'granted' }));

      console.log('✅ Push notification permission granted and registered');
      return true;
    } catch (err) {
      console.error('Error requesting push permission:', err);
      toast({
        title: 'Error',
        description: 'Failed to enable notifications',
        variant: 'destructive',
      });
      return false;
    } finally {
      setState(prev => ({ ...prev, isRegistering: false }));
    }
  }, [isNative, toast]);

  // Register FCM token to database
  const registerToken = useCallback(async (): Promise<boolean> => {
    if (!isNative || !user?.id) {
      return false;
    }

    setState(prev => ({ ...prev, isRegistering: true }));

    try {
      // Request permission first
      const hasPermission = await requestPermission();
      if (!hasPermission) {
        return false;
      }

      // Wait for registration token
      const token = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Token registration timeout'));
        }, 10000);

        PushNotifications.addListener('registration', (tokenData) => {
          clearTimeout(timeout);
          resolve(tokenData.value);
        });

        PushNotifications.addListener('registrationError', (error) => {
          clearTimeout(timeout);
          reject(new Error(error.error));
        });
      });

      console.log('📱 FCM Token received:', token.substring(0, 20) + '...');

      // Get device info
      const deviceInfo = `${Capacitor.getPlatform()} - ${navigator.userAgent.substring(0, 50)}`;

      // Upsert token to user_fcm_tokens table
      const { error } = await supabase
        .from('user_fcm_tokens')
        .upsert(
          {
            user_id: user.id,
            token,
            device_info: deviceInfo,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'token' }
        );

      if (error) {
        console.error('Error saving FCM token:', error);
        throw new Error('Failed to save push token');
      }

      // Set up listeners for incoming notifications
      await setupListeners();

      setState(prev => ({ ...prev, isRegistered: true }));
      console.log('✅ FCM token registered successfully');

      toast({
        title: 'Notifications Enabled',
        description: 'You will receive push notifications.',
      });

      return true;
    } catch (err) {
      console.error('Error registering FCM token:', err);
      toast({
        title: 'Error',
        description: 'Failed to enable notifications. Please try again.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setState(prev => ({ ...prev, isRegistering: false }));
    }
  }, [isNative, user?.id, requestPermission, setupListeners, toast]);

  // Unregister token on logout
  const unregisterToken = useCallback(async (): Promise<void> => {
    if (!isNative || !user?.id) return;

    try {
      // Remove all tokens for this user
      const { error } = await supabase
        .from('user_fcm_tokens')
        .delete()
        .eq('user_id', user.id);

      if (error) {
        console.error('Error removing FCM token:', error);
      }

      // Clean up listeners
      cleanupListeners();

      setState(prev => ({ ...prev, isRegistered: false }));
      console.log('✅ FCM token unregistered');
    } catch (err) {
      console.error('Error unregistering FCM token:', err);
    }
  }, [isNative, user?.id, cleanupListeners]);

  // Check if token already exists for user
  const checkExistingToken = useCallback(async (): Promise<boolean> => {
    if (!user?.id) return false;

    try {
      const { data, error } = await supabase
        .from('user_fcm_tokens')
        .select('token')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Error checking existing token:', error);
        return false;
      }

      const hasToken = !!data?.token;
      setState(prev => ({ ...prev, isRegistered: hasToken }));
      return hasToken;
    } catch (err) {
      console.error('Error in checkExistingToken:', err);
      return false;
    }
  }, [user?.id]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      cleanupListeners();
    };
  }, [cleanupListeners]);

  return {
    ...state,
    requestPermission,
    registerToken,
    unregisterToken,
    checkExistingToken,
    checkPermissionStatus,
  };
}
