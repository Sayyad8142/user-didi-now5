// src/hooks/usePushNotifications.ts
import { useEffect, useCallback, useState } from "react";
import { PushNotifications } from "@capacitor/push-notifications";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { getFirebaseIdToken } from "@/lib/firebase";

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

  const register = useCallback(async () => {
    try {
      if (!userId) {
        console.log("No userId, skipping push registration");
        return;
      }

      if (!Capacitor.isNativePlatform()) {
        console.log("Push notifications: not a native platform, skipping");
        return;
      }

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
        // Optional: show in-app toast/snackbar here
      });

      // 6. When user taps the notification
      PushNotifications.addListener(
        "pushNotificationActionPerformed",
        (action) => {
          console.log("Push notification action performed:", action);
          // Optional: navigate using action.notification.data.booking_id, etc.
        }
      );
    } catch (err: any) {
      console.error("Error during push registration:", err);
      setLastError(err?.message ?? "Unknown push registration error");
    }
  }, [userId, registerTokenInSupabase]);

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
