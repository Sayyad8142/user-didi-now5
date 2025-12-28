import React, { createContext, useContext, useEffect, useCallback, useState, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';

interface PushNotificationContextType {
  isSupported: boolean;
  isRegistered: boolean;
  isRegistering: boolean;
  permissionStatus: 'granted' | 'denied' | 'prompt' | 'unknown';
  registerForPush: () => Promise<boolean>;
  unregisterFromPush: () => Promise<void>;
}

const PushNotificationContext = createContext<PushNotificationContextType>({
  isSupported: false,
  isRegistered: false,
  isRegistering: false,
  permissionStatus: 'unknown',
  registerForPush: async () => false,
  unregisterFromPush: async () => {},
});

export const usePushNotificationContext = () => useContext(PushNotificationContext);

interface PushNotificationProviderProps {
  children: React.ReactNode;
}

export function PushNotificationProvider({ children }: PushNotificationProviderProps) {
  const [isRegistered, setIsRegistered] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<'granted' | 'denied' | 'prompt' | 'unknown'>('unknown');
  
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  
  const isNative = Capacitor.isNativePlatform();
  const listenersSetupRef = useRef(false);
  const previousUserIdRef = useRef<string | null>(null);

  // Handle foreground notification
  const handleNotificationReceived = useCallback((notification: any) => {
    console.log('📩 Push notification received (foreground):', notification);
    
    const title = notification.title || notification.data?.title || 'Notification';
    const body = notification.body || notification.data?.body || '';

    toast({
      title,
      description: body,
      duration: 5000,
    });
  }, [toast]);

  // Handle notification tap
  const handleNotificationAction = useCallback((action: any) => {
    console.log('👆 Push notification tapped:', action);
    
    const data = action.notification?.data || {};
    const bookingId = data.booking_id;
    const notificationType = data.notification_type;

    if (bookingId) {
      navigate(`/bookings?id=${bookingId}`);
    } else if (notificationType === 'chat') {
      navigate('/support');
    } else {
      navigate('/');
    }
  }, [navigate]);

  // Set up push notification listeners
  const setupListeners = useCallback(async () => {
    if (!isNative || listenersSetupRef.current) return;

    try {
      await PushNotifications.addListener('pushNotificationReceived', handleNotificationReceived);
      await PushNotifications.addListener('pushNotificationActionPerformed', handleNotificationAction);
      listenersSetupRef.current = true;
      console.log('✅ Push notification listeners registered');
    } catch (err) {
      console.error('Error setting up push listeners:', err);
    }
  }, [isNative, handleNotificationReceived, handleNotificationAction]);

  // Clean up listeners
  const cleanupListeners = useCallback(async () => {
    if (!isNative || !listenersSetupRef.current) return;

    try {
      await PushNotifications.removeAllListeners();
      listenersSetupRef.current = false;
      console.log('🧹 Push notification listeners removed');
    } catch (err) {
      console.error('Error removing push listeners:', err);
    }
  }, [isNative]);

  // Register for push notifications
  const registerForPush = useCallback(async (): Promise<boolean> => {
    if (!isNative || !user?.id) {
      console.warn('Push notifications require native platform and authenticated user');
      return false;
    }

    setIsRegistering(true);

    try {
      // Check/request permission
      const currentStatus = await PushNotifications.checkPermissions();
      
      if (currentStatus.receive === 'denied') {
        toast({
          title: 'Notifications Blocked',
          description: 'Please enable notifications in your device settings.',
          variant: 'destructive',
        });
        setPermissionStatus('denied');
        return false;
      }

      if (currentStatus.receive !== 'granted') {
        const result = await PushNotifications.requestPermissions();
        if (result.receive !== 'granted') {
          setPermissionStatus('denied');
          return false;
        }
      }

      setPermissionStatus('granted');

      // Register and get token
      await PushNotifications.register();

      const token = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Token timeout')), 10000);

        PushNotifications.addListener('registration', (data) => {
          clearTimeout(timeout);
          resolve(data.value);
        });

        PushNotifications.addListener('registrationError', (error) => {
          clearTimeout(timeout);
          reject(new Error(error.error));
        });
      });

      console.log('📱 FCM Token:', token.substring(0, 20) + '...');

      // Save token to database
      const deviceInfo = `${Capacitor.getPlatform()} - ${navigator.userAgent.substring(0, 50)}`;

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
        console.error('Error saving token:', error);
        throw new Error('Failed to save token');
      }

      // Set up listeners
      await setupListeners();

      setIsRegistered(true);
      console.log('✅ Push notifications registered');

      toast({
        title: 'Notifications Enabled',
        description: 'You will receive push notifications.',
      });

      return true;
    } catch (err) {
      console.error('Error registering for push:', err);
      toast({
        title: 'Error',
        description: 'Failed to enable notifications.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsRegistering(false);
    }
  }, [isNative, user?.id, setupListeners, toast]);

  // Unregister from push notifications
  const unregisterFromPush = useCallback(async (): Promise<void> => {
    if (!user?.id) return;

    try {
      // Remove tokens from database
      await supabase
        .from('user_fcm_tokens')
        .delete()
        .eq('user_id', user.id);

      // Clean up listeners
      await cleanupListeners();

      setIsRegistered(false);
      console.log('✅ Push notifications unregistered');
    } catch (err) {
      console.error('Error unregistering from push:', err);
    }
  }, [user?.id, cleanupListeners]);

  // Check existing registration on mount
  useEffect(() => {
    if (!isNative) return;

    const checkExisting = async () => {
      try {
        const status = await PushNotifications.checkPermissions();
        setPermissionStatus(status.receive as any);

        if (user?.id) {
          const { data } = await supabase
            .from('user_fcm_tokens')
            .select('token')
            .eq('user_id', user.id)
            .maybeSingle();

          if (data?.token) {
            setIsRegistered(true);
            await setupListeners();
          }
        }
      } catch (err) {
        console.error('Error checking push status:', err);
      }
    };

    checkExisting();
  }, [isNative, user?.id, setupListeners]);

  // Handle logout - clean up tokens
  useEffect(() => {
    const wasLoggedIn = previousUserIdRef.current !== null;
    const isNowLoggedOut = user === null;

    if (wasLoggedIn && isNowLoggedOut) {
      // User just logged out
      cleanupListeners();
      setIsRegistered(false);
    }

    previousUserIdRef.current = user?.id || null;
  }, [user, cleanupListeners]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupListeners();
    };
  }, [cleanupListeners]);

  const value: PushNotificationContextType = {
    isSupported: isNative,
    isRegistered,
    isRegistering,
    permissionStatus,
    registerForPush,
    unregisterFromPush,
  };

  return (
    <PushNotificationContext.Provider value={value}>
      {children}
    </PushNotificationContext.Provider>
  );
}
