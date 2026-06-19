// ============================================================================
// FCM HTTP v1 — DATA-ONLY sender (for incoming-call style high-priority pushes)
// No `notification` block, no `android.notification` — guarantees
// onMessageReceived() fires on Android in background/killed state.
// ============================================================================

interface FcmCredentials {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

function getFcmCredentials(serviceAccountEnvName?: string): FcmCredentials {
  const envName = serviceAccountEnvName || "FIREBASE_SERVICE_ACCOUNT";
  const serviceAccountJson = Deno.env.get(envName);
  if (serviceAccountJson) {
    try {
      const sa = JSON.parse(serviceAccountJson);
      return {
        projectId: sa.project_id,
        clientEmail: sa.client_email,
        privateKey: sa.private_key,
      };
    } catch (e) {
      console.error(`[fcmDataOnly] failed to parse ${envName}:`, e);
    }
  }
  if (!serviceAccountEnvName) {
    const projectId = Deno.env.get("FCM_PROJECT_ID");
    const clientEmail = Deno.env.get("FCM_CLIENT_EMAIL");
    const privateKey = Deno.env.get("FCM_PRIVATE_KEY");
    if (projectId && clientEmail && privateKey) {
      return { projectId, clientEmail, privateKey };
    }
  }
  throw new Error(`FCM credentials missing (${envName})`);
}

async function createSignedJwt(clientEmail: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: clientEmail,
    sub: clientEmail,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
  };
  const b64 = (s: string) =>
    btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const input = `${b64(JSON.stringify(header))}.${b64(JSON.stringify(payload))}`;
  const pem = privateKey
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\\n/g, "")
    .replace(/\s/g, "");
  const binary = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    binary,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(input),
  );
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${input}.${sigB64}`;
}

async function getAccessToken(clientEmail: string, privateKey: string): Promise<string> {
  const jwt = await createSignedJwt(clientEmail, privateKey);
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!r.ok) throw new Error(`oauth2 token failed: ${r.status} ${await r.text()}`);
  return (await r.json()).access_token;
}

export interface FcmDataOnlyResult {
  token: string;
  ok: boolean;
  status?: number;
  name?: string;
  error?: string;
}

/**
 * Sends a DATA-ONLY FCM HTTP v1 message. Guarantees onMessageReceived() fires
 * on Android in any app state. No `notification` block. APNs uses
 * content-available=1 only (background wake).
 */
export async function sendFcmDataOnly(
  token: string,
  data: Record<string, string>,
  serviceAccountEnvName?: string,
): Promise<FcmDataOnlyResult> {
  const { projectId, clientEmail, privateKey } = getFcmCredentials(serviceAccountEnvName);
  const accessToken = await getAccessToken(clientEmail, privateKey);
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

  const message = {
    token,
    data, // strings only
    android: {
      priority: "high",
    },
    apns: {
      headers: {
        "apns-push-type": "background",
        "apns-priority": "5",
        "apns-topic": Deno.env.get("APNS_TOPIC") ||
          "app.lovable.2edd991f3825445a9485006dde036295",
      },
      payload: { aps: { "content-available": 1 }, ...data },
    },
  };

  console.log(
    `[fcmDataOnly] project=${projectId} token=${token.slice(0, 12)}… keys=${Object.keys(data).join(",")}`,
  );

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message }),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error(`[fcmDataOnly] FAIL status=${res.status} body=${text}`);
    return { token, ok: false, status: res.status, error: text };
  }
  let parsed: { name?: string } = {};
  try { parsed = JSON.parse(text); } catch { /* ignore */ }
  console.log(`[fcmDataOnly] OK status=${res.status} name=${parsed.name || "?"}`);
  return { token, ok: true, status: res.status, name: parsed.name };
}

export function fcmProjectId(serviceAccountEnvName?: string): string {
  try { return getFcmCredentials(serviceAccountEnvName).projectId; } catch { return "unknown"; }
}
