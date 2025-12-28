// src/hooks/usePushNotifications.ts
import { useEffect, useCallback, useState } from "react";
import { PushNotifications } from "@capacitor/push-notifications";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

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

      const { error } = await supabase.from("user_fcm_tokens").upsert(
        {
          user_id: userId,
          token,
          device_info: JSON.stringify(deviceInfo),
        },
        {
          onConflict: "token",
        }
      );

      if (error) {
        console.error("Error saving FCM token to user_fcm_tokens:", error);
        setLastError(error.message);
      } else {
        console.log("✅ FCM token saved to user_fcm_tokens");
        setIsRegistered(true);
        setLastError(null);
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
