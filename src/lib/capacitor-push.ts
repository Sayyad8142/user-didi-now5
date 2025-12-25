// Capacitor Push Notifications for native Android/iOS
import { Capacitor } from '@capacitor/core';
import { PushNotifications, Token, PushNotificationSchema, ActionPerformed } from '@capacitor/push-notifications';

export interface PushTokenResult {
  token: string;
  platform: 'android' | 'ios' | 'web';
}

export type NativePushRegisterResult =
  | { ok: true; token: string; platform: 'android' | 'ios' }
  | {
      ok: false;
      reason: 'permission_denied' | 'registration_error' | 'timeout' | 'unknown';
      platform: 'android' | 'ios';
      message?: string;
    };

// Check if running in native Capacitor app
export const isNativeApp = (): boolean => {
  return Capacitor.isNativePlatform();
};

// Request permission and register for push notifications (native only)
export const registerNativePush = async (): Promise<NativePushRegisterResult | null> => {
  if (!isNativeApp()) {
    console.log('📱 Not a native app, skipping native push registration');
    return null;
  }

  const platform = Capacitor.getPlatform() as 'android' | 'ios';

  try {
    // First check current permission status
    const currentPerm = await PushNotifications.checkPermissions();
    console.log('📱 Current push permission:', currentPerm.receive);

    // Request permission if not already granted
    let permResult = currentPerm;
    if (currentPerm.receive !== 'granted') {
      permResult = await PushNotifications.requestPermissions();
      console.log('📱 Permission request result:', permResult.receive);
    }

    if (permResult.receive !== 'granted') {
      console.warn('⚠️ Push notification permission not granted:', permResult.receive);
      return {
        ok: false,
        reason: 'permission_denied',
        platform,
      };
    }

    console.log('✅ Push notification permission granted');

    // Remove any existing listeners to avoid duplicates
    await PushNotifications.removeAllListeners();

    // Set up listeners BEFORE calling register
    return await new Promise<NativePushRegisterResult>((resolve) => {
      const timeout = setTimeout(() => {
        console.warn('⚠️ Token registration timeout after 30s');
        resolve({
          ok: false,
          reason: 'timeout',
          platform,
          message:
            'Timed out waiting for an FCM token. This usually means the Android build is missing Firebase config (google-services.json) or Google Play services is unavailable.',
        });
      }, 30000);

      PushNotifications.addListener('registration', (token: Token) => {
        clearTimeout(timeout);
        console.log('✅ Native push token received:', token.value.substring(0, 30) + '...');
        resolve({
          ok: true,
          token: token.value,
          platform,
        });
      });

      PushNotifications.addListener('registrationError', (error) => {
        clearTimeout(timeout);
        const message = typeof error === 'string' ? error : JSON.stringify(error);
        console.error('❌ Push registration error:', message);
        resolve({
          ok: false,
          reason: 'registration_error',
          platform,
          message,
        });
      });

      // Now register
      PushNotifications.register()
        .then(() => {
          console.log('📱 PushNotifications.register() called successfully');
        })
        .catch((err) => {
          clearTimeout(timeout);
          console.error('❌ PushNotifications.register() failed:', err);
          resolve({
            ok: false,
            reason: 'registration_error',
            platform,
            message: String(err),
          });
        });
    });
  } catch (error) {
    console.error('❌ Error registering native push:', error);
    return {
      ok: false,
      reason: 'unknown',
      platform,
      message: String(error),
    };
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
