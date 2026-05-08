# Fix: Android OTP "Verifying you're not a robot..." popup

## Root cause (confirmed)

Firebase Phone Auth on Android falls back to **web reCAPTCHA** (Chrome Custom Tab popup) when it cannot get a Play Integrity / SafetyNet attestation. The attestation requires the app's **SHA-1 + SHA-256 signing fingerprints** to be registered in the Firebase Console for the Android app `com.didisnow.app`.

### Audit results

| Check | File | Result |
|---|---|---|
| Package name | `capacitor.config.ts` | ✅ `com.didisnow.app` |
| Package name | `android/app/build.gradle` | ✅ `com.didisnow.app` (namespace + applicationId) |
| Package name | `android/app/google-services.json` | ✅ `com.didisnow.app` |
| **OAuth client / SHA fingerprints** | `android/app/google-services.json` | ❌ **`"oauth_client": []` is EMPTY** |

> **SHA fingerprints are missing in Firebase Console. Re-download `google-services.json` after adding SHA-1 and SHA-256.**

---

## Fix steps (do these in order)

### 1. Get SHA fingerprints locally

**macOS / Linux:**
```bash
cd android
./gradlew signingReport
```

**Windows:**
```cmd
cd android
gradlew signingReport
```

Copy the `SHA1` and `SHA-256` values for both:
- `Variant: debug` (debug keystore)
- `Variant: release` (your release keystore from `signing.properties`)

### 2. Get Play App Signing fingerprints

Google Play re-signs your AAB with their own key. Get those fingerprints from:

**Google Play Console → your app → Test and release → Setup → App integrity → App signing key certificate**

Copy both **SHA-1** and **SHA-256** of the *App signing key certificate* (NOT the upload certificate — though you should add the upload one too).

### 3. Add ALL fingerprints to Firebase Console

**Firebase Console → Project Settings → Your apps → Android app `com.didisnow.app` → Add fingerprint**

Add all of these:
- [ ] Debug SHA-1
- [ ] Debug SHA-256
- [ ] Release SHA-1 (local keystore)
- [ ] Release SHA-256 (local keystore)
- [ ] Play App Signing SHA-1
- [ ] Play App Signing SHA-256
- [ ] (Optional) Play Upload Cert SHA-1 / SHA-256

### 4. Enable Play Integrity API

**Google Cloud Console → APIs & Services → Library → search "Play Integrity API" → Enable**

Make sure the project selected is the same Firebase project (`didinowusernew`, project number `767811736462`).

### 5. Re-download `google-services.json`

**Firebase Console → Project Settings → General → Your apps → Android app → Download `google-services.json`**

Replace the file at:
```
android/app/google-services.json
```

Verify `oauth_client` is **no longer `[]`** — it should now contain at least one entry with `client_id` and `client_type: 3`.

### 6. Rebuild

```bash
npm run build
npx cap sync android
cd android
# macOS / Linux
./gradlew assembleRelease
# Windows
gradlew assembleRelease
```

Install the new APK on a physical device and test "Send OTP". The reCAPTCHA popup should no longer appear.

---

## What was NOT changed (per instructions)

- ❌ Firebase OTP logic — untouched
- ❌ Twilio — not added
- ❌ Razorpay / payment logic — untouched
- ❌ Supabase auth logic — untouched

## What WAS changed (safety logging only)

`src/lib/firebase.ts` — added `[OTP-AUDIT]` diagnostic logs around `sendOtpNative`:
- Platform + native availability + package name on entry
- "Firebase phone auth started" before plugin call
- "OTP sent event received" on success
- "Firebase phone auth FAILED" + reCAPTCHA-fallback hint on failure
- Full error code/message on throw

These logs help confirm the fix worked (no fallback messages should appear after SHAs are registered).
