// Shared helpers for Zavu OTP flow.
// Zavu (https://api.zavu.dev) is a WhatsApp messaging API and does NOT validate
// OTP codes server-side. So we generate the OTP ourselves, deliver it via a
// Zavu authentication template, and self-verify using a stateless HMAC-signed
// verification token. This avoids any DB/RLS changes.

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function hmacSign(secret: string, data: string): Promise<string> {
  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return b64url(new Uint8Array(sig));
}

async function hmacVerify(secret: string, data: string, sig: string): Promise<boolean> {
  const key = await importHmacKey(secret);
  return await crypto.subtle.verify(
    "HMAC",
    key,
    b64urlDecode(sig),
    enc.encode(data),
  );
}

async function sha256Hex(data: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(data));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Generate a numeric OTP of `length` digits (default 6). */
export function generateOtp(length = 6): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) out += (bytes[i] % 10).toString();
  return out;
}

/** Normalize phone to E.164 (+91 default for 10-digit Indian numbers). */
export function normalizePhone(raw: string): string {
  const d = String(raw || "").trim();
  if (/^\+\d{8,15}$/.test(d)) return d;
  const digits = d.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  return d;
}

/** Mask phone for safe logging: +91XXXXXXXXXX -> +91XXXXXX**12 */
export function maskPhone(phone: string): string {
  if (!phone || phone.length < 4) return "***";
  return phone.slice(0, phone.length - 4).replace(/\d/g, "X") + phone.slice(-2);
}

export interface VerificationTokenPayload {
  phone: string;
  /** sha256(code + ":" + phone + ":" + nonce) hex */
  hash: string;
  /** epoch seconds when token expires */
  exp: number;
  /** random nonce so signed tokens are unique per send */
  nonce: string;
}

/** Build an opaque, stateless verification token: base64url(payloadJSON).sig */
export async function createVerificationToken(
  secret: string,
  phone: string,
  code: string,
  ttlSeconds = 5 * 60,
): Promise<string> {
  const nonce = b64url(crypto.getRandomValues(new Uint8Array(12)));
  const hash = await sha256Hex(`${code}:${phone}:${nonce}`);
  const payload: VerificationTokenPayload = {
    phone,
    hash,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    nonce,
  };
  const payloadB64 = b64url(enc.encode(JSON.stringify(payload)));
  const sig = await hmacSign(secret, payloadB64);
  return `${payloadB64}.${sig}`;
}

export type VerifyTokenResult =
  | { ok: true; payload: VerificationTokenPayload }
  | { ok: false; error: "invalid" | "expired" | "phone_mismatch" | "code_mismatch" };

export async function verifyVerificationToken(
  secret: string,
  token: string,
  phone: string,
  code: string,
): Promise<VerifyTokenResult> {
  const parts = String(token || "").split(".");
  if (parts.length !== 2) return { ok: false, error: "invalid" };
  const [payloadB64, sig] = parts;
  const sigOk = await hmacVerify(secret, payloadB64, sig);
  if (!sigOk) return { ok: false, error: "invalid" };
  let payload: VerificationTokenPayload;
  try {
    const json = new TextDecoder().decode(b64urlDecode(payloadB64));
    payload = JSON.parse(json);
  } catch {
    return { ok: false, error: "invalid" };
  }
  if (payload.phone !== phone) return { ok: false, error: "phone_mismatch" };
  if (Math.floor(Date.now() / 1000) > payload.exp) return { ok: false, error: "expired" };
  const expected = await sha256Hex(`${code}:${phone}:${payload.nonce}`);
  if (expected !== payload.hash) return { ok: false, error: "code_mismatch" };
  return { ok: true, payload };
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-firebase-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Send a WhatsApp authentication template via Zavu. */
export async function sendZavuOtpMessage(opts: {
  apiKey: string;
  apiBase?: string;
  templateId: string;
  to: string;
  code: string;
}): Promise<{ ok: true; messageId?: string } | { ok: false; status: number; error: string }> {
  const base = (opts.apiBase || "https://api.zavu.dev").replace(/\/+$/, "");
  const url = `${base}/v1/messages`;
  const body = {
    to: opts.to,
    messageType: "template",
    content: {
      templateId: opts.templateId,
      templateVariables: { "1": opts.code },
    },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({} as Record<string, unknown>));
  if (!res.ok) {
    const error =
      (data && typeof data === "object" && "message" in data && String((data as Record<string, unknown>).message)) ||
      (data && typeof data === "object" && "error" in data && String((data as Record<string, unknown>).error)) ||
      `Zavu API error (HTTP ${res.status})`;
    return { ok: false, status: res.status, error };
  }
  const messageId =
    (data && typeof data === "object" && "id" in data && String((data as Record<string, unknown>).id)) ||
    (data && typeof data === "object" && "messageId" in data && String((data as Record<string, unknown>).messageId)) ||
    undefined;
  return { ok: true, messageId };
}
