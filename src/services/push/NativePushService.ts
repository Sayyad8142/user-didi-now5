import { PushService } from './PushService';
import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from '@/integrations/supabase/client';

export class NativePushService implements PushService {
  isSupported(): boolean {
    return true;
  }

  async requestPermission(): Promise<boolean> {
    try {
      const current = await PushNotifications.checkPermissions();

      if (current.receive === 'granted') {
        await PushNotifications.register();
        return true;
      }

      const result = await PushNotifications.requestPermissions();

      if (result.receive === 'granted') {
        await PushNotifications.register();
        return true;
      }

      return false;
    } catch (err) {
      console.error('Push permission error:', err);
      throw new Error('Failed to enable push notifications');
    }
  }

  async registerToken(token: string, userId: string): Promise<void> {
    try {
      if (!userId) throw new Error('User not logged in');

      const { error } = await supabase
        .from('fcm_tokens')
        .upsert(
          {
            user_id: userId,
            token,
            updated_at: new Date().toISOString()
          },
          { onConflict: 'user_id' }
        );

      if (error) {
        console.error('Supabase token save error:', error);
        throw new Error('Failed to save push token');
      }

      console.log('Push token saved successfully');
    } catch (err) {
      console.error('Token register error:', err);
      throw err;
    }
  }

  onMessage(handler: (payload: any) => void): () => void {
    let listenerHandle: { remove: () => void } | null = null;
    
    PushNotifications.addListener('pushNotificationReceived', handler)
      .then((handle) => {
        listenerHandle = handle;
      })
      .catch((err) => {
        console.warn('Failed to add push listener:', err);
      });

    return () => {
      if (listenerHandle) {
        try {
          listenerHandle.remove();
        } catch (err) {
          console.warn('Listener remove error:', err);
        }
      }
    };
  }
}
