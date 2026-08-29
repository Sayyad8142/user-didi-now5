// ============================================================================
// iOS push (Firebase Cloud Messaging)
// ----------------------------------------------------------------------------
// iOS must register with Firebase Messaging to obtain a real *FCM registration
// token*. @capacitor/push-notifications alone yields a raw 64-hex APNs device
// token, which the FCM HTTP v1 API (`message.token`) rejects.
//
// This module is iOS-only on purpose. Android keeps using the existing
// @capacitor/push-notifications flow untouched.
// ============================================================================

import { Capacitor } from '@capacitor/core';

export type IosPushResult =
  | { status: 'ok'; token: string }
  | { status: 'denied' }
  | { status: 'no-token' }
  | { status: 'unsupported' }
  | { status: 'error'; error: string };

/** Heuristic: a raw APNs device token is 64 hex chars. FCM tokens never are. */
export function looksLikeApnsRawToken(token: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(token.trim());
}

async function loadMessaging() {
  const mod = await import('@capacitor-firebase/messaging');
  return mod.FirebaseMessaging;
}

/**
 * Requests notification permission (if needed) and returns a real FCM
 * registration token for this iPhone/iPad.
 */
export async function getIosFcmToken(): Promise<IosPushResult> {
  if (Capacitor.getPlatform() !== 'ios') return { status: 'unsupported' };

  try {
    const FirebaseMessaging = await loadMessaging();

    let perm = await FirebaseMessaging.checkPermissions();
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
      console.log('[Push][iOS] Requesting notification permission…');
      perm = await FirebaseMessaging.requestPermissions();
    }
    if (perm.receive !== 'granted') {
      console.log('[Push][iOS] Permission not granted:', perm.receive);
      return { status: 'denied' };
    }

    // getToken() internally waits for the APNs token and exchanges it with
    // Firebase, returning an FCM registration token.
    const { token } = await FirebaseMessaging.getToken();
    if (!token) {
      console.warn('[Push][iOS] getToken() returned empty token');
      return { status: 'no-token' };
    }

    if (looksLikeApnsRawToken(token)) {
      console.error('[Push][iOS] Got a raw APNs token instead of an FCM token — aborting registration');
      return { status: 'error', error: 'Received raw APNs token, not an FCM token' };
    }

    console.log('[Push][iOS] ✅ FCM registration token acquired:', `${token.slice(0, 20)}…`);
    return { status: 'ok', token };
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    console.error('[Push][iOS] Failed to get FCM token:', msg);
    return { status: 'error', error: msg };
  }
}

/**
 * Attaches iOS Firebase Messaging listeners.
 * Returns handles so callers can remove them.
 */
export async function attachIosMessagingListeners(handlers: {
  onTokenRefresh?: (token: string) => void;
  onMessage?: (payload: { data?: Record<string, any>; notification?: any }) => void;
  onActionPerformed?: (payload: { data?: Record<string, any>; notification?: any }) => void;
}): Promise<Array<{ remove: () => void }>> {
  if (Capacitor.getPlatform() !== 'ios') return [];

  const FirebaseMessaging = await loadMessaging();
  const handles: Array<{ remove: () => void }> = [];

  if (handlers.onTokenRefresh) {
    handles.push(
      await FirebaseMessaging.addListener('tokenReceived', (event: any) => {
        if (event?.token && !looksLikeApnsRawToken(event.token)) {
          console.log('[Push][iOS] 🔄 Token refreshed');
          handlers.onTokenRefresh!(event.token);
        }
      }),
    );
  }

  if (handlers.onMessage) {
    handles.push(
      await FirebaseMessaging.addListener('notificationReceived', (event: any) => {
        handlers.onMessage!({
          data: event?.notification?.data,
          notification: event?.notification,
        });
      }),
    );
  }

  if (handlers.onActionPerformed) {
    handles.push(
      await FirebaseMessaging.addListener('notificationActionPerformed', (event: any) => {
        handlers.onActionPerformed!({
          data: event?.notification?.data,
          notification: event?.notification,
        });
      }),
    );
  }

  console.log(`[Push][iOS] Attached ${handles.length} Firebase Messaging listener(s)`);
  return handles;
}
