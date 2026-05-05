// Mints a Firebase Custom Token using the FIREBASE_SERVICE_ACCOUNT credentials.
// Custom tokens are JWTs signed (RS256) with the service account private key,
// with audience = identitytoolkit, and include the desired uid.
// Client exchanges them via firebase/auth signInWithCustomToken().

interface ServiceAccount {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

function loadServiceAccount(): ServiceAccount {
  const raw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
  if (raw) {
    try {
      const sa = JSON.parse(raw);
      return {
        projectId: sa.project_id,
        clientEmail: sa.client_email,
        privateKey: sa.private_key,
      };
    } catch (e) {
      console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT", e);
    }
  }
  const projectId = Deno.env.get("FCM_PROJECT_ID") || "";
  const clientEmail = Deno.env.get("FCM_CLIENT_EMAIL") || "";
  const privateKey = Deno.env.get("FCM_PRIVATE_KEY") || "";
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Firebase service account not configured");
  }
  return { projectId, clientEmail, privateKey };
}

function b64url(input: string | Uint8Array): string {
  const bytes =
    typeof input === "string"
      ? new TextEncoder().encode(input)
      : input;
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function importPrivateKey(privateKey: string): Promise<CryptoKey> {
  const pem = privateKey
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\\n/g, "")
    .replace(/\n/g, "")
    .replace(/\s/g, "");
  const bin = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  return await crypto.subtle.importKey(
    "pkcs8",
    bin,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

export async function createFirebaseCustomToken(
  uid: string,
  claims: Record<string, unknown> = {}
): Promise<string> {
  if (!uid) throw new Error("uid required");
  const sa = loadServiceAccount();

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload: Record<string, unknown> = {
    iss: sa.clientEmail,
    sub: sa.clientEmail,
    aud:
      "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit",
    iat: now,
    exp: now + 3600,
    uid,
  };
  if (claims && Object.keys(claims).length) {
    payload.claims = claims;
  }

  const headerB64 = b64url(JSON.stringify(header));
  const payloadB64 = b64url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await importPrivateKey(sa.privateKey);
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput)
  );
  const sigB64 = b64url(new Uint8Array(sig));
  return `${signingInput}.${sigB64}`;
}

export function uidFromPhone(phone: string): string {
  // deterministic uid; keep "phone:" prefix per spec
  const normalized = phone.replace(/\s+/g, "");
  return `phone:${normalized}`;
}
