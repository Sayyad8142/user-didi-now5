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

/**
 * Sends an FCM push notification using HTTP v1 API
 * 
 * @param token - Device FCM token
 * @param title - Notification title
 * @param body - Notification body
 * @param data - Optional data payload
 */
export async function sendFcmV1Message(
  token: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<void> {
  const { projectId, clientEmail, privateKey } = getFcmCredentials();

  console.log('📛 FCM project:', projectId, 'client:', clientEmail?.split('@')?.[0] + '@…');

  console.log('🔐 Getting OAuth2 access token...');
  const accessToken = await getAccessToken(clientEmail, privateKey);

  const fcmUrl = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

  // Build data payload - always include title/body in data for overlay display
  const dataPayload: Record<string, string> = {
    ...data,
    title: title,
    body: body,
  };

  const message: Record<string, unknown> = {
    token: token,
    // Data-only message for native apps (allows custom handling)
    // Title/body in data payload so native app can display custom UI
    data: dataPayload,
    android: {
      priority: 'high',
      // No notification block - native app handles display
    },
    // Web push needs notification block for browser display
    webpush: {
      notification: {
        title: title,
        body: body,
        icon: '/lovable-uploads/a157d599-7225-4729-88f2-e0a3d7500d7b.png',
        requireInteraction: true,
      },
      fcm_options: {
        link: '/',
      },
    },
    // APNS for iOS
    apns: {
      headers: {
        'apns-priority': '10',
      },
      payload: {
        aps: {
          alert: {
            title: title,
            body: body,
          },
          sound: 'default',
          badge: 1,
        },
      },
    },
  };

  console.log('📤 Sending FCM v1:', { 
    title, 
    body, 
    token_preview: token.substring(0, 20) + '...',
    has_data: !!data 
  });

  const response = await fetch(fcmUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ FCM v1 error:', response.status, errorText);
    throw new Error(`FCM v1 failed: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  console.log('✅ FCM v1 sent successfully:', result.name);
}
