// ============================================================================
// FCM HTTP v1 Helper - Uses Service Account for Authentication
// Supports both FIREBASE_SERVICE_ACCOUNT (JSON) or individual FCM_* env vars
// ============================================================================

interface FcmCredentials {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

/**
 * Gets FCM credentials from environment variables
 * Supports either FIREBASE_SERVICE_ACCOUNT JSON or individual FCM_* vars
 */
function getFcmCredentials(): FcmCredentials {
  // First, try FIREBASE_SERVICE_ACCOUNT JSON
  const serviceAccountJson = Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
  
  if (serviceAccountJson) {
    try {
      const sa = JSON.parse(serviceAccountJson);
      console.log('🔐 Using FIREBASE_SERVICE_ACCOUNT JSON');
      return {
        projectId: sa.project_id,
        clientEmail: sa.client_email,
        privateKey: sa.private_key,
      };
    } catch (e) {
      console.error('❌ Failed to parse FIREBASE_SERVICE_ACCOUNT:', e);
    }
  }

  // Fallback to individual FCM_* env vars
  const projectId = Deno.env.get('FCM_PROJECT_ID');
  const clientEmail = Deno.env.get('FCM_CLIENT_EMAIL');
  const privateKey = Deno.env.get('FCM_PRIVATE_KEY');

  if (projectId && clientEmail && privateKey) {
    console.log('🔐 Using individual FCM_* env vars');
    return { projectId, clientEmail, privateKey };
  }

  // No credentials found
  const missing = [];
  if (!serviceAccountJson) missing.push('FIREBASE_SERVICE_ACCOUNT');
  if (!projectId) missing.push('FCM_PROJECT_ID');
  if (!clientEmail) missing.push('FCM_CLIENT_EMAIL');
  if (!privateKey) missing.push('FCM_PRIVATE_KEY');
  
  throw new Error(`Missing FCM configuration. Provide either FIREBASE_SERVICE_ACCOUNT or all of: FCM_PROJECT_ID, FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY. Missing: ${missing.join(', ')}`);
}

/**
 * Creates a signed JWT for Google OAuth2 authentication
 */
async function createSignedJwt(
  clientEmail: string,
  privateKey: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 3600; // 1 hour expiry

  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };

  const payload = {
    iss: clientEmail,
    sub: clientEmail,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: exp,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  };

  const headerB64 = btoa(JSON.stringify(header))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  
  const payloadB64 = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const signatureInput = `${headerB64}.${payloadB64}`;

  // Parse PEM private key
  const pemContents = privateKey
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\\n/g, '')
    .replace(/\n/g, '')
    .replace(/\s/g, '');

  const binaryKey = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

  // Import the key for signing
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  // Sign the JWT
  const encoder = new TextEncoder();
  const signatureBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    encoder.encode(signatureInput)
  );

  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return `${signatureInput}.${signatureB64}`;
}

/**
 * Gets an OAuth2 access token using the service account JWT
 */
async function getAccessToken(
  clientEmail: string,
  privateKey: string
): Promise<string> {
  const jwt = await createSignedJwt(clientEmail, privateKey);

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ OAuth2 token error:', response.status, errorText);
    throw new Error(`Failed to get access token: ${response.status}`);
  }

  const data = await response.json();
  return data.access_token;
}

export interface SendFcmOptions {
  /** Device platform: 'ios' | 'android' | 'web'. Used for observability and APNs topic selection. */
  platform?: string;
  /** iOS bundle id used as `apns-topic`. Falls back to APNS_TOPIC env or 'app.lovable.2edd991f3825445a9485006dde036295'. */
  apnsTopic?: string;
  /** Optional badge count for iOS. If omitted, badge is NOT set (recommended for booking-style alerts). */
  badge?: number;
  /** Optional user_id for log breadcrumbs. */
  userId?: string;
}

/**
 * Sends an FCM push notification using HTTP v1 API.
 * Produces a cross-platform payload: Android system notification, web push, and iOS APNs alert.
 *
 * @param token - Device FCM token
 * @param title - Notification title (visible)
 * @param body  - Notification body (visible)
 * @param data  - Optional data payload (auto-stringified). `deep_link` is forwarded for tap handling.
 * @param opts  - Optional platform/badge/topic hints
 */
export async function sendFcmV1Message(
  token: string,
  title: string,
  body: string,
  data?: Record<string, string>,
  opts: SendFcmOptions = {}
): Promise<void> {
  const { projectId, clientEmail, privateKey } = getFcmCredentials();

  const platform = (opts.platform || data?.platform || 'unknown').toLowerCase();
  const userId = opts.userId || data?.user_id || 'n/a';
  const apnsTopic =
    opts.apnsTopic ||
    Deno.env.get('APNS_TOPIC') ||
    'app.lovable.2edd991f3825445a9485006dde036295';

  console.log(
    `📛 FCM send | project=${projectId} | user=${userId} | platform=${platform} | token=${token.slice(0, 12)}…`
  );

  const accessToken = await getAccessToken(clientEmail, privateKey);
  const fcmUrl = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

  // Build data payload — title/body mirrored for in-app overlays.
  const dataPayload: Record<string, string> = {
    ...data,
    title,
    body,
  };

  // Backward-compat: if booking_id present and no deep_link, generate one.
  if (!dataPayload.deep_link && dataPayload.booking_id) {
    dataPayload.deep_link = `/booking/${dataPayload.booking_id}`;
  }

  // iOS aps block — always an alert push (visible). Badge only if explicitly requested.
  const aps: Record<string, unknown> = {
    alert: { title, body },
    sound: 'default',
    'mutable-content': 1,
    'content-available': 1, // wakes app for in-app handling without suppressing alert
  };
  if (typeof opts.badge === 'number') {
    aps.badge = opts.badge;
  }

  const message: Record<string, unknown> = {
    token,

    // Visible notification block — required for Android/iOS system display.
    notification: { title, body },

    // Data payload for deep-linking / in-app handling.
    data: dataPayload,

    android: {
      priority: 'high',
      notification: {
        channel_id: 'fcm_fallback_notification_channel',
        sound: 'default',
      },
    },

    webpush: {
      notification: {
        title,
        body,
        icon: '/lovable-uploads/a157d599-7225-4729-88f2-e0a3d7500d7b.png',
        requireInteraction: true,
      },
      fcm_options: {
        link: dataPayload.deep_link || '/',
      },
    },

    // APNS — explicit headers for production-safe alert delivery.
    apns: {
      headers: {
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'apns-topic': apnsTopic,
        // Allow OS to coalesce duplicates per booking when applicable.
        ...(dataPayload.booking_id
          ? { 'apns-collapse-id': `booking-${dataPayload.booking_id}` }
          : {}),
      },
      payload: {
        aps,
        // Mirror data fields at top level so iOS userInfo carries them too.
        ...dataPayload,
      },
    },
  };

  console.log(
    `📤 FCM payload | user=${userId} | platform=${platform} | title="${title}" | deep_link=${dataPayload.deep_link || '—'} | apns-topic=${apnsTopic}`
  );

  const response = await fetch(fcmUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(
      `❌ FCM v1 error | user=${userId} | platform=${platform} | status=${response.status} | ${errorText}`
    );
    throw new Error(`FCM v1 failed: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  console.log(
    `✅ FCM v1 sent | user=${userId} | platform=${platform} | name=${result.name}`
  );
}
