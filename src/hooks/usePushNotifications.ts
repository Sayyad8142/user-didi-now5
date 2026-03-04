// src/hooks/usePushNotifications.ts
import { useEffect, useCallback, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { getFirebaseIdToken, getFcmToken, onForegroundMessage, showForegroundNotification } from "@/lib/firebase";

interface UsePushNotificationsOptions {
  userId?: string | null;
}

interface DeviceInfo {
  platform: string;
  model?: string;
  osVersion?: string;
}

export function usePushNotifications({ userId }: UsePushNotificationsOptions) {
  const [isRegistered, setIsRegistered] = useState(false);
  const [lastError, setLastError] = useState<null | string>(null);

  const registerTokenInSupabase = useCallback(
    async (token: string, deviceInfo: DeviceInfo) => {
      if (!userId) return;

      try {
        const idToken = await getFirebaseIdToken();
        if (!idToken) {
          setLastError("Missing Firebase session token");
          return;
        }

        const { error } = await supabase.functions.invoke(
          "register-user-fcm-token",
          {
            body: {
              token,
              device_info: deviceInfo,
            },
            headers: {
              Authorization: `Bearer ${idToken}`,
            },
          }
        );

        if (error) {
          console.error("❌ register-user-fcm-token failed:", error);
          setLastError(error.message);
          return;
        }

        setIsRegistered(true);
        setLastError(null);
      } catch (e: any) {
        console.error("❌ Error registering token:", e);
        setLastError(e?.message ?? "Failed to register push token");
      }
    },
    [userId]
  );

  const registerWebPush = useCallback(async () => {
    try {
      if (!userId) return;

      // Check browser support
      if (!("Notification" in window) || !("serviceWorker" in navigator)) {
        console.log("Web push: browser does not support notifications");
        setLastError("Browser does not support push notifications");
        return;
      }

      // Request permission
      let permission = Notification.permission;
      if (permission === "default") {
        permission = await Notification.requestPermission();
      }

      if (permission !== "granted") {
        console.log("Web push: permission not granted:", permission);
        setLastError("Notification permission not granted");
        return;
      }

      // Get FCM token (handles SW registration + VAPID key internally)
      const token = await getFcmToken();
      if (!token) {
        setLastError("Failed to get web push token");
        return;
      }

      console.log("🌐 Web FCM token obtained:", token.substring(0, 20) + "...");

      const deviceInfo: DeviceInfo = {
        platform: "web",
        model: navigator.userAgent,
      };

      await registerTokenInSupabase(token, deviceInfo);

      // Listen for foreground messages
      onForegroundMessage((payload) => {
        showForegroundNotification(payload);
      });
    } catch (err: any) {
      console.error("Error during web push registration:", err);
      setLastError(err?.message ?? "Web push registration error");
    }
  }, [userId, registerTokenInSupabase]);

  const registerNativePush = useCallback(async () => {
    try {
      if (!userId) return;

      // 1. Check permission
      let permStatus = await PushNotifications.checkPermissions();

      if (permStatus.receive === "prompt") {
        permStatus = await PushNotifications.requestPermissions();
      }

      if (permStatus.receive !== "granted") {
        console.log("Push notifications permission not granted:", permStatus);
        setLastError("Notification permission not granted");
        return;
      }

      // 2. Register with FCM/APNS
      await PushNotifications.register();

      // 3. Listen for registration success
      PushNotifications.addListener("registration", async (token) => {
        console.log("FCM registration token:", token.value);

        const deviceInfo: DeviceInfo = {
          platform: Capacitor.getPlatform(),
          model: navigator.userAgent,
        };

        await registerTokenInSupabase(token.value, deviceInfo);
      });

      // 4. Listen for registration error
      PushNotifications.addListener("registrationError", (error) => {
        console.error("Push registration error:", error);
        setLastError("Push registration error");
      });

      // 5. When notification received in foreground
      PushNotifications.addListener("pushNotificationReceived", (notification) => {
        console.log("Push notification received:", notification);
      });

      // 6. When user taps the notification
      PushNotifications.addListener(
        "pushNotificationActionPerformed",
        (action) => {
          console.log("Push notification action performed:", action);
        }
      );
    } catch (err: any) {
      console.error("Error during native push registration:", err);
      setLastError(err?.message ?? "Native push registration error");
    }
  }, [userId, registerTokenInSupabase]);

  const register = useCallback(async () => {
    if (!userId) {
      console.log("No userId, skipping push registration");
      return;
    }

    if (Capacitor.isNativePlatform()) {
      await registerNativePush();
    } else {
      await registerWebPush();
    }
  }, [userId, registerNativePush, registerWebPush]);

  useEffect(() => {
    if (!userId) return;
    // Auto-register when we have a logged-in user
    register();
  }, [userId, register]);

  return {
    isRegistered,
    lastError,
    registerManually: register,
  };
}
