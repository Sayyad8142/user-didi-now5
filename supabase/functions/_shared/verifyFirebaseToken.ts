/**
 * Secure Firebase ID Token verification for Deno edge functions.
 * Fetches Google's public keys and verifies RS256 signature, issuer, audience, and expiry.
 */

const GOOGLE_CERTS_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
const FIREBASE_PROJECT_ID = "didinowusernew";

// Cache certs for up to 1 hour
let cachedCerts: Record<string, string> | null = null;
let cacheExpiry = 0;

async function fetchGoogleCerts(): Promise<Record<string, string>> {
  const now = Date.now();
  if (cachedCerts && now < cacheExpiry) return cachedCerts;

  const res = await fetch(GOOGLE_CERTS_URL);
  if (!res.ok) throw new Error(`Failed to fetch Google certs: ${res.status}`);

  cachedCerts = await res.json();

  // Respect Cache-Control max-age
  const cc = res.headers.get("cache-control") || "";
  const match = cc.match(/max-age=(\d+)/);
  const maxAge = match ? parseInt(match[1], 10) : 3600;
  cacheExpiry = now + maxAge * 1000;

  return cachedCerts!;
}

function base64UrlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(padded);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN CERTIFICATE-----/g, "")
    .replace(/-----END CERTIFICATE-----/g, "")
    .replace(/\s/g, "");
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

/**
 * Verifies a Firebase ID token's RS256 signature and claims.
 * Returns the decoded payload on success, throws on failure.
 */
export async function verifyFirebaseToken(
  token: string
): Promise<{ uid: string; [key: string]: unknown }> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Malformed JWT");

  // Decode header & payload
  const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0])));
  const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1])));

  // 1. Check algorithm
  if (header.alg !== "RS256") throw new Error(`Unsupported alg: ${header.alg}`);

  // 2. Check kid exists
  const kid = header.kid;
  if (!kid) throw new Error("Missing kid in JWT header");

  // 3. Check expiry & issued-at
  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < now) throw new Error("Token expired");
  if (!payload.iat || payload.iat > now + 60) throw new Error("Token iat in the future");

  // 4. Check issuer & audience
  const expectedIssuer = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`;
  if (payload.iss !== expectedIssuer)
    throw new Error(`Invalid issuer: ${payload.iss}`);
  if (payload.aud !== FIREBASE_PROJECT_ID)
    throw new Error(`Invalid audience: ${payload.aud}`);

  // 5. Check sub exists
  const uid = payload.sub || payload.user_id;
  if (!uid || typeof uid !== "string") throw new Error("Missing sub/user_id");

  // 6. Fetch Google public certs and find matching key
  const certs = await fetchGoogleCerts();
  const certPem = certs[kid];
  if (!certPem) throw new Error(`No cert found for kid: ${kid}`);

  // 7. Import the X.509 certificate's public key
  const certDer = pemToArrayBuffer(certPem);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    // We need SPKI from the X.509 cert — use the cert directly with a workaround:
    // Deno's crypto.subtle doesn't support X.509 directly, so extract SPKI
    certDer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  ).catch(async () => {
    // Fallback: try importing as SPKI (some runtimes accept the full cert)
    // Parse X.509 cert to extract the SubjectPublicKeyInfo
    // For Deno, use the importX509 approach
    return await importX509Key(certPem);
  });

  // 8. Verify signature
  const signedData = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const signature = base64UrlDecode(parts[2]);

  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    signature,
    signedData
  );

  if (!valid) throw new Error("Invalid signature");

  return { ...payload, uid };
}

/**
 * Import an X.509 PEM certificate's public key for RS256 verification.
 * Extracts the SPKI from the X.509 DER-encoded certificate.
 */
async function importX509Key(pem: string): Promise<CryptoKey> {
  // Extract base64 from PEM
  const b64 = pem
    .replace(/-----BEGIN CERTIFICATE-----/g, "")
    .replace(/-----END CERTIFICATE-----/g, "")
    .replace(/\s/g, "");
  const der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

  // Parse X.509 DER to find SubjectPublicKeyInfo
  // X.509 structure: SEQUENCE { tbsCertificate, signatureAlgorithm, signatureValue }
  // tbsCertificate: SEQUENCE { version, serialNumber, signature, issuer, validity, subject, subjectPublicKeyInfo, ... }
  const spki = extractSPKI(der);

  return await crypto.subtle.importKey(
    "spki",
    spki,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
}

/**
 * Minimal ASN.1 DER parser to extract SubjectPublicKeyInfo from X.509 cert.
 */
function extractSPKI(der: Uint8Array): ArrayBuffer {
  let offset = 0;

  function readTag(): { tag: number; length: number; start: number } {
    const tag = der[offset++];
    let length = der[offset++];
    const start = offset;

    if (length & 0x80) {
      const numBytes = length & 0x7f;
      length = 0;
      for (let i = 0; i < numBytes; i++) {
        length = (length << 8) | der[offset++];
      }
      return { tag, length, start: offset };
    }
    return { tag, length, start };
  }

  function skipField() {
    const { length, start } = readTag();
    offset = start + length;
  }

  // Outer SEQUENCE (Certificate)
  const outerSeq = readTag();

  // tbsCertificate SEQUENCE
  const tbsStart = offset;
  const tbsSeq = readTag();

  // version [0] EXPLICIT (optional)
  if (der[offset] === 0xa0) {
    skipField();
  }

  // serialNumber
  skipField();
  // signature AlgorithmIdentifier
  skipField();
  // issuer
  skipField();
  // validity
  skipField();
  // subject
  skipField();

  // subjectPublicKeyInfo — this is what we want
  const spkiStart = offset;
  const spkiHeader = readTag();
  const spkiEnd = spkiHeader.start + spkiHeader.length;

  // Return the full TLV of subjectPublicKeyInfo
  return der.slice(spkiStart, spkiEnd).buffer;
}
