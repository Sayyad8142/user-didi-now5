// src/hooks/usePushNotifications.ts
import { useEffect, useCallback, useState, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { getFirebaseIdToken, getFcmToken, onForegroundMessage, showForegroundNotification } from "@/lib/firebase";
import { queryClient } from "@/main";
import { toast } from "@/components/ui/sonner";

interface UsePushNotificationsOptions {
  userId?: string | null;
}

interface DeviceInfo {
  platform: string;
  model?: string;
  osVersion?: string;
}

// Dedup: track last notification IDs to avoid processing twice
const processedNotificationIds = new Set<string>();
const MAX_PROCESSED = 50;

function dedupNotification(id: string): boolean {
  if (processedNotificationIds.has(id)) return true; // already seen
  processedNotificationIds.add(id);
  if (processedNotificationIds.size > MAX_PROCESSED) {
    const first = processedNotificationIds.values().next().value;
    if (first) processedNotificationIds.delete(first);
  }
  return false;
}

/** Invalidate booking queries so UI refreshes on push */
function invalidateBookingQueries() {
  queryClient.invalidateQueries({ queryKey: ['bookings'] });
  queryClient.invalidateQueries({ queryKey: ['my-bookings'] });
}

export function usePushNotifications({ userId }: UsePushNotificationsOptions) {
  const [isRegistered, setIsRegistered] = useState(false);
  const [lastError, setLastError] = useState<null | string>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const registeredForRef = useRef<string | null>(null);

  const registerTokenInSupabase = useCallback(
    async (token: string, deviceInfo: DeviceInfo) => {
      if (!userId) return;

      try {
        const idToken = await getFirebaseIdToken();
        if (!idToken) {
          console.warn("[Push] Missing Firebase session token");
          setLastError("Missing Firebase session token");
          return;
        }

        console.log("[Push] Registering FCM token for user:", userId);

        const { error } = await supabase.functions.invoke(
          "register-user-fcm-token",
          {
            body: { token, device_info: deviceInfo },
            headers: { Authorization: `Bearer ${idToken}` },
          }
        );

        if (error) {
          console.error("[Push] register-user-fcm-token failed:", error);
          setLastError(error.message);
          return;
        }

        console.log("[Push] ✅ Token registered successfully");
        setIsRegistered(true);
        setLastError(null);
      } catch (e: any) {
        console.error("[Push] Error registering token:", e);
        setLastError(e?.message ?? "Failed to register push token");
      }
    },
    [userId]
  );

  const registerWebPush = useCallback(async () => {
    try {
      if (!userId) return;

      if (!("Notification" in window) || !("serviceWorker" in navigator)) {
        console.log("[Push] Browser does not support notifications");
        setLastError("Browser does not support push notifications");
        return;
      }

      let permission = Notification.permission;
      if (permission === "default") {
        permission = await Notification.requestPermission();
      }

      if (permission !== "granted") {
        console.log("[Push] Permission not granted:", permission);
        setLastError("Notification permission not granted");
        return;
      }

      const token = await getFcmToken();
      if (!token) {
        setLastError("Failed to get web push token");
        return;
      }

      console.log("[Push] 🌐 Web FCM token obtained:", token.substring(0, 20) + "...");

      const deviceInfo: DeviceInfo = {
        platform: "web",
        model: navigator.userAgent,
      };

      await registerTokenInSupabase(token, deviceInfo);

      // Listen for foreground messages (store unsubscribe for cleanup)
      const unsubscribe = onForegroundMessage((payload) => {
        const msgId = payload.messageId || payload.data?.booking_id || String(Date.now());
        if (dedupNotification(msgId)) {
          console.log("[Push] Skipping duplicate foreground message:", msgId);
          return;
        }

        console.log("[Push] 📩 Foreground message:", payload.data?.type || "unknown");
        showForegroundNotification(payload);

        // Show in-app toast for booking events
        const title = payload.data?.title || payload.notification?.title;
        const body = payload.data?.body || payload.notification?.body;
        if (title) {
          toast.info(title, { description: body });
        }

        // Invalidate queries so booking screens refresh
        invalidateBookingQueries();
      });

      cleanupRef.current = unsubscribe;
    } catch (err: any) {
      console.error("[Push] Error during web push registration:", err);
      setLastError(err?.message ?? "Web push registration error");
    }
  }, [userId, registerTokenInSupabase]);

  const registerNativePush = useCallback(async () => {
    try {
      if (!userId) return;

      const { PushNotifications } = await import("@capacitor/push-notifications");

      // Remove previous listeners to prevent duplicates
      await PushNotifications.removeAllListeners();

      let permStatus = await PushNotifications.checkPermissions();
      if (permStatus.receive === "prompt") {
        permStatus = await PushNotifications.requestPermissions();
      }

      if (permStatus.receive !== "granted") {
        console.log("[Push] Permission not granted:", permStatus);
        setLastError("Notification permission not granted");
        return;
      }

      await PushNotifications.register();

      // Registration success — token obtained or refreshed
      await PushNotifications.addListener("registration", async (token) => {
        console.log("[Push] 📱 Native FCM token:", token.value.substring(0, 20) + "...");

        const deviceInfo: DeviceInfo = {
          platform: Capacitor.getPlatform(),
          model: navigator.userAgent,
        };

        await registerTokenInSupabase(token.value, deviceInfo);
      });

      await PushNotifications.addListener("registrationError", (error) => {
        console.error("[Push] Registration error:", error);
        setLastError("Push registration error");
      });

      // Foreground notification — show toast and refresh booking data
      await PushNotifications.addListener("pushNotificationReceived", (notification) => {
        const id = notification.id || notification.data?.booking_id || String(Date.now());
        if (dedupNotification(id)) {
          console.log("[Push] Skipping duplicate native foreground notification:", id);
          return;
        }

        console.log("[Push] 📩 Native foreground:", notification.data?.type || "unknown");

        const title = notification.data?.title || notification.title;
        const body = notification.data?.body || notification.body;
        if (title) {
          toast.info(title, { description: body });
        }

        invalidateBookingQueries();
      });

      // Notification tap — deep link handled by usePushDeepLink
      await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
        console.log("[Push] 🔗 Notification tapped:", action.notification?.data?.type || "unknown");
        invalidateBookingQueries();
      });

      // Cleanup function
      cleanupRef.current = () => {
        PushNotifications.removeAllListeners();
      };
    } catch (err: any) {
      console.error("[Push] Error during native push registration:", err);
      setLastError(err?.message ?? "Native push registration error");
    }
  }, [userId, registerTokenInSupabase]);

  const register = useCallback(async () => {
    if (!userId) {
      console.log("[Push] No userId, skipping registration");
      return;
    }

    // Avoid re-registering for the same user
    if (registeredForRef.current === userId) {
      console.log("[Push] Already registered for user:", userId);
      return;
    }

    console.log("[Push] Starting registration for user:", userId);

    if (Capacitor.isNativePlatform()) {
      await registerNativePush();
    } else {
      await registerWebPush();
    }

    registeredForRef.current = userId;
  }, [userId, registerNativePush, registerWebPush]);

  // Auto-register when userId is available
  useEffect(() => {
    if (!userId) {
      // User logged out — cleanup
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      registeredForRef.current = null;
      setIsRegistered(false);
      return;
    }

    register();

    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, [userId, register]);

  return {
    isRegistered,
    lastError,
    registerManually: register,
  };
}
