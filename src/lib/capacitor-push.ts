// Capacitor Push Notifications for native Android/iOS
import { Capacitor } from '@capacitor/core';
import { PushNotifications, Token, PushNotificationSchema, ActionPerformed } from '@capacitor/push-notifications';

export interface PushTokenResult {
  token: string;
  platform: 'android' | 'ios' | 'web';
}

// Check if running in native Capacitor app
export const isNativeApp = (): boolean => {
  return Capacitor.isNativePlatform();
};

// Request permission and register for push notifications (native only)
export const registerNativePush = async (): Promise<PushTokenResult | null> => {
  if (!isNativeApp()) {
    console.log('📱 Not a native app, skipping native push registration');
    return null;
  }

  try {
    // Request permission
    const permResult = await PushNotifications.requestPermissions();
    
    if (permResult.receive !== 'granted') {
      console.warn('⚠️ Push notification permission not granted:', permResult.receive);
      return null;
    }

    console.log('✅ Push notification permission granted');

    // Register with FCM/APNs
    await PushNotifications.register();

    // Wait for token
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.warn('⚠️ Token registration timeout');
        resolve(null);
      }, 10000);

      PushNotifications.addListener('registration', (token: Token) => {
        clearTimeout(timeout);
        console.log('✅ Native push token:', token.value.substring(0, 20) + '...');
        resolve({
          token: token.value,
          platform: Capacitor.getPlatform() as 'android' | 'ios',
        });
      });

      PushNotifications.addListener('registrationError', (error) => {
        clearTimeout(timeout);
        console.error('❌ Push registration error:', error);
        resolve(null);
      });
    });
  } catch (error) {
    console.error('❌ Error registering native push:', error);
    return null;
  }
};

// Check current permission status (native only)
export const checkNativePushPermission = async (): Promise<'granted' | 'denied' | 'prompt'> => {
  if (!isNativeApp()) {
    return 'prompt';
  }

  try {
    const result = await PushNotifications.checkPermissions();
    
    if (result.receive === 'granted') return 'granted';
    if (result.receive === 'denied') return 'denied';
    return 'prompt';
  } catch (error) {
    console.error('❌ Error checking push permission:', error);
    return 'prompt';
  }
};

// Set up notification listeners (native only)
export const setupNativePushListeners = (
  onNotificationReceived: (notification: PushNotificationSchema) => void,
  onNotificationTapped: (notification: ActionPerformed) => void
): (() => void) => {
  if (!isNativeApp()) {
    return () => {};
  }

  const receivedListener = PushNotifications.addListener(
    'pushNotificationReceived',
    onNotificationReceived
  );

  const actionListener = PushNotifications.addListener(
    'pushNotificationActionPerformed',
    onNotificationTapped
  );

  // Return cleanup function
  return () => {
    receivedListener.then(l => l.remove());
    actionListener.then(l => l.remove());
  };
};
