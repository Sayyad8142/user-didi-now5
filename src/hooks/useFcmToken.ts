import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// Firebase configuration from environment or hardcoded
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBXq8YQ9Z1XZ9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};

export function useFcmToken() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    registerFcmToken();
  }, []);

  const registerFcmToken = async () => {
    try {
      // Check if Firebase Messaging is supported
      if (!('Notification' in window)) {
        console.log('Notifications not supported');
        setLoading(false);
        return;
      }

      // Request permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.log('Notification permission denied');
        setLoading(false);
        return;
      }

      // Dynamic import of Firebase
      const { initializeApp } = await import('firebase/app');
      const { getMessaging, getToken } = await import('firebase/messaging');

      // Initialize Firebase
      const app = initializeApp(FIREBASE_CONFIG);
      const messaging = getMessaging(app);

      // Get FCM token
      const currentToken = await getToken(messaging, {
        vapidKey: 'YOUR_VAPID_KEY_HERE'
      });

      if (currentToken) {
        console.log('FCM Token:', currentToken);
        setToken(currentToken);

        // Save to database
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { error } = await supabase
            .from('fcm_tokens')
            .upsert({
              user_id: user.id,
              token: currentToken,
              updated_at: new Date().toISOString()
            }, {
              onConflict: 'user_id'
            });

          if (error) {
            console.error('Error saving FCM token:', error);
          } else {
            console.log('FCM token saved successfully');
          }
        }
      } else {
        console.log('No FCM token available');
      }
    } catch (error) {
      console.error('Error registering FCM token:', error);
    } finally {
      setLoading(false);
    }
  };

  return { token, loading, registerFcmToken };
}
