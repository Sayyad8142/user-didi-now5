// Shared Firebase token verification for edge functions
// Uses Google Identity Toolkit API to verify Firebase ID tokens

const FIREBASE_API_KEY = Deno.env.get("FIREBASE_API_KEY") || "";

export interface FirebaseUser {
  uid: string;
  phone?: string | null;
  email?: string | null;
}

export async function verifyFirebaseToken(idToken: string): Promise<FirebaseUser> {
  if (!idToken) throw new Error("No token provided");

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(FIREBASE_API_KEY)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    console.error("Firebase token verification failed:", res.status, text);
    throw new Error("Invalid or expired token");
  }

  const data = await res.json();
  const user = data.users?.[0];
  if (!user?.localId) throw new Error("No user found for token");

  return {
    uid: user.localId,
    phone: user.phoneNumber || null,
    email: user.email || null,
  };
}

export function extractToken(req: Request): string {
  const header = req.headers.get("x-firebase-token") || req.headers.get("authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7) : header;
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-firebase-token",
};
