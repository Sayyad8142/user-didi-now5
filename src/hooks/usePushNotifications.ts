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

// ── Local token tracking ────────────────────────────────────────────────────
const TOKEN_CACHE_KEY = 'didi_fcm_token';

function getStoredToken(): string | null {
  try { return localStorage.getItem(TOKEN_CACHE_KEY); } catch { return null; }
}
function setStoredToken(t: string) {
  try { localStorage.setItem(TOKEN_CACHE_KEY, t); } catch {}
}
function clearStoredToken() {
  try { localStorage.removeItem(TOKEN_CACHE_KEY); } catch {}
}

// ── Deduplication ───────────────────────────────────────────────────────────
const processedIds = new Set<string>();
const MAX_PROCESSED = 80;

function isDuplicate(payload: Record<string, any>): boolean {
  // Stable key priority: messageId > notification id > type+booking_id+ts > timestamp fallback
  const id =
    payload.messageId ||
    payload.id ||
    (payload.data?.type && payload.data?.booking_id
      ? `${payload.data.type}:${payload.data.booking_id}:${payload.data?.created_at || ''}`
      : null) ||
    String(Date.now());

  if (processedIds.has(id)) return true;
  processedIds.add(id);
  if (processedIds.size > MAX_PROCESSED) {
    const first = processedIds.values().next().value;
    if (first) processedIds.delete(first);
  }
  return false;
}

// ── Notification-type-based query invalidation ──────────────────────────────
function invalidateForType(type?: string, data?: Record<string, any>) {
  const t = type || data?.type || '';

  // Always invalidate bookings list
  queryClient.invalidateQueries({ queryKey: ['bookings'] });
  queryClient.invalidateQueries({ queryKey: ['my-bookings'] });

  // Booking-detail specific
  if (data?.booking_id) {
    queryClient.invalidateQueries({ queryKey: ['booking', data.booking_id] });
  }

  switch (t) {
    case 'worker_assigned':
    case 'booking_confirmed':
    case 'on_the_way':
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
      queryClient.invalidateQueries({ queryKey: ['active-booking'] });
      break;

    case 'booking_started':
    case 'booking_completed':
      queryClient.invalidateQueries({ queryKey: ['active-booking'] });
      break;

    case 'booking_cancelled':
    case 'dispatch_failed':
      queryClient.invalidateQueries({ queryKey: ['active-booking'] });
      break;

    case 'support_message':
    case 'chat_message':
      queryClient.invalidateQueries({ queryKey: ['support'] });
      queryClient.invalidateQueries({ queryKey: ['unseen-messages'] });
      queryClient.invalidateQueries({ queryKey: ['chat'] });
      break;

    case 'payment_confirmed':
    case 'refund':
    case 'wallet_credit':
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      break;
  }

  console.log('[Push] Invalidated queries for type:', t || '(generic)');
}

// ── Unregister token from backend ───────────────────────────────────────────
export async function unregisterFcmToken(): Promise<void> {
  try {
    const token = getStoredToken();
    const idToken = await getFirebaseIdToken();

    if (!idToken) {
      console.warn('[Push] No Firebase token for unregister — skipping');
      clearStoredToken();
      return;
    }

    console.log('[Push] 🗑️ Unregistering FCM token from backend...');

    const { error } = await supabase.functions.invoke('unregister-user-fcm-token', {
      body: { token: token || undefined },
      headers: { Authorization: `Bearer ${idToken}` },
    });

    if (error) {
      console.error('[Push] Unregister failed:', error);
    } else {
      console.log('[Push] ✅ Token unregistered');
    }
  } catch (e) {
    console.error('[Push] Unregister error:', e);
  } finally {
    clearStoredToken();
  }
}

// ── Main hook ───────────────────────────────────────────────────────────────
export function usePushNotifications({ userId }: UsePushNotificationsOptions) {
  const [isRegistered, setIsRegistered] = useState(false);
  const [lastError, setLastError] = useState<null | string>(null);

  // Per-listener handle tracking (instead of removeAllListeners)
  const listenerHandlesRef = useRef<Array<{ remove: () => void }>>([]);
  const webUnsubRef = useRef<(() => void) | null>(null);
  const registeredForRef = useRef<string | null>(null);

  const removeAllOwnListeners = useCallback(() => {
    console.log(`[Push] Removing ${listenerHandlesRef.current.length} listener handle(s)`);
    for (const h of listenerHandlesRef.current) {
      try { h.remove(); } catch {}
    }
    listenerHandlesRef.current = [];

    if (webUnsubRef.current) {
      webUnsubRef.current();
      webUnsubRef.current = null;
    }
  }, []);

  const registerTokenInSupabase = useCallback(
    async (token: string, deviceInfo: DeviceInfo, force = false) => {
      if (!userId) return;

      // Skip only if token AND user are identical AND not forced
      const stored = getStoredToken();
      if (!force && stored === token && registeredForRef.current === userId) {
        console.log('[Push] Token unchanged, skipping re-registration');
        setIsRegistered(true);
        return;
      }

      try {
        const idToken = await getFirebaseIdToken();
        if (!idToken) {
          console.warn('[Push] Missing Firebase session token');
          setLastError('Missing Firebase session token');
          return;
        }

        console.log('[Push] Registering FCM token for user:', userId, force ? '(forced)' : '');

        const { error } = await supabase.functions.invoke('register-user-fcm-token', {
          body: { token, device_info: deviceInfo },
          headers: { Authorization: `Bearer ${idToken}` },
        });

        if (error) {
          console.error('[Push] register-user-fcm-token failed:', error);
          setLastError(error.message);
          return;
        }

        console.log('[Push] ✅ Token registered successfully');
        setStoredToken(token);
        setIsRegistered(true);
        setLastError(null);
      } catch (e: any) {
        console.error('[Push] Error registering token:', e);
        setLastError(e?.message ?? 'Failed to register push token');
      }
    },
    [userId],
  );

  // ── Web push ────────────────────────────────────────────────────────────
  const registerWebPush = useCallback(async () => {
    if (!userId) return;

    try {
      if (!('Notification' in window) || !('serviceWorker' in navigator)) {
        console.log('[Push] Browser does not support notifications');
        setLastError('Browser does not support push notifications');
        return;
      }

      let permission = Notification.permission;
      if (permission === 'default') {
        permission = await Notification.requestPermission();
      }
      if (permission !== 'granted') {
        console.log('[Push] Permission not granted:', permission);
        setLastError('Notification permission not granted');
        return;
      }

      const token = await getFcmToken();
      if (!token) {
        setLastError('Failed to get web push token');
        return;
      }

      console.log('[Push] 🌐 Web FCM token:', token.substring(0, 20) + '...');

      await registerTokenInSupabase(token, { platform: 'web', model: navigator.userAgent });

      // Foreground listener — store unsubscribe
      const unsub = onForegroundMessage((payload) => {
        if (isDuplicate(payload as any)) {
          console.log('[Push] Skipping duplicate web foreground message');
          return;
        }

        console.log('[Push] 📩 Web foreground:', payload.data?.type || 'unknown');
        showForegroundNotification(payload);

        const title = payload.data?.title || payload.notification?.title;
        const body = payload.data?.body || payload.notification?.body;
        if (title) toast.info(title, { description: body });

        invalidateForType(payload.data?.type, payload.data as Record<string, any>);
      });
      webUnsubRef.current = unsub;
    } catch (err: any) {
      console.error('[Push] Web push registration error:', err);
      setLastError(err?.message ?? 'Web push registration error');
    }
  }, [userId, registerTokenInSupabase]);

  // ── Native push ─────────────────────────────────────────────────────────
  const registerNativePush = useCallback(async () => {
    if (!userId) return;

    try {
      const { PushNotifications } = await import('@capacitor/push-notifications');

      // Remove only our own previous listeners
      removeAllOwnListeners();

      let permStatus = await PushNotifications.checkPermissions();
      if (permStatus.receive === 'prompt') {
        permStatus = await PushNotifications.requestPermissions();
      }
      if (permStatus.receive !== 'granted') {
        console.log('[Push] Permission not granted:', permStatus);
        setLastError('Notification permission not granted');
        return;
      }

      await PushNotifications.register();

      // Store each handle individually
      const h1 = await PushNotifications.addListener('registration', async (token) => {
        console.log('[Push] 📱 Native FCM token:', token.value.substring(0, 20) + '...');
        await registerTokenInSupabase(token.value, {
          platform: Capacitor.getPlatform(),
          model: navigator.userAgent,
        });
      });
      listenerHandlesRef.current.push(h1);

      const h2 = await PushNotifications.addListener('registrationError', (error) => {
        console.error('[Push] Registration error:', error);
        setLastError('Push registration error');
      });
      listenerHandlesRef.current.push(h2);

      // Foreground notification
      const h3 = await PushNotifications.addListener('pushNotificationReceived', (notification) => {
        if (isDuplicate(notification as any)) {
          console.log('[Push] Skipping duplicate native foreground notification');
          return;
        }

        console.log('[Push] 📩 Native foreground:', notification.data?.type || 'unknown');

        const title = notification.data?.title || notification.title;
        const body = notification.data?.body || notification.body;
        if (title) toast.info(title, { description: body });

        invalidateForType(notification.data?.type, notification.data);
      });
      listenerHandlesRef.current.push(h3);

      // Notification tap — deep link handled by usePushDeepLink
      const h4 = await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        console.log('[Push] 🔗 Notification tapped:', action.notification?.data?.type || 'unknown');
        invalidateForType(action.notification?.data?.type, action.notification?.data);
      });
      listenerHandlesRef.current.push(h4);

      console.log(`[Push] Attached ${listenerHandlesRef.current.length} native listeners`);
    } catch (err: any) {
      console.error('[Push] Native push registration error:', err);
      setLastError(err?.message ?? 'Native push registration error');
    }
  }, [userId, registerTokenInSupabase, removeAllOwnListeners]);

  // ── Register entry point ────────────────────────────────────────────────
  const register = useCallback(async (force = false) => {
    if (!userId) {
      console.log('[Push] No userId, skipping registration');
      return;
    }
    if (!force && registeredForRef.current === userId) {
      console.log('[Push] Already registered for user:', userId);
      return;
    }

    console.log('[Push] Starting registration for user:', userId, force ? '(forced)' : '');

    if (Capacitor.isNativePlatform()) {
      await registerNativePush(force);
    } else {
      await registerWebPush(force);
    }

    registeredForRef.current = userId;
  }, [userId, registerNativePush, registerWebPush]);

  // ── Lifecycle ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) {
      // User logged out — cleanup listeners (token DB cleanup is in Profile.tsx logout)
      removeAllOwnListeners();
      registeredForRef.current = null;
      setIsRegistered(false);
      return;
    }

    register();

    return () => {
      removeAllOwnListeners();
    };
  }, [userId, register, removeAllOwnListeners]);

  return {
    isRegistered,
    lastError,
    registerManually: register,
  };
}
