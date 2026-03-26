# React Native Migration Plan — Didi Now User App

**Date:** 2026-03-26  
**Source:** Current React + Vite + Capacitor codebase  
**Target:** React Native (Android + iOS)

---

## A. What Can Be Reused

These files contain **pure TypeScript business logic** with no DOM or web dependencies. They can be copied into the React Native project with minimal or zero changes.

### Directly Reusable (copy as-is)

| Category | File(s) | Notes |
|----------|---------|-------|
| Pricing logic | `src/features/booking/pricing.ts` | Remove `lucide-react` icon imports; keep `getPricingMap`, `FLAT_SIZES`, `prettyServiceName` |
| Slot generation | `src/features/booking/slot-utils.ts` | Pure `date-fns` logic — `makeSlots`, `isPastToday`, `getDateChips`, `TIME_SEGMENTS` |
| Booking utilities | `src/features/booking/utils.ts` | Pure helper functions |
| UPI URL building | `src/utils/launchUpiPayment.ts` | `buildUpiUrl`, `generateTransactionRef`, `parseUpiPayload`, `isValidUpiPayload` — all pure string logic |
| Chat API | `src/features/chat/api.ts` | Supabase queries, no DOM |
| Types | `src/lib/types.ts` | `BookingMessage` type |
| Name validation | `src/lib/name-validation.ts` | Pure validation |
| Semver | `src/lib/semver.ts` | Version comparison logic |
| Deep link parsing | `src/lib/deepLink.ts` | `normalizeDeepLink` function (remove `navigate` parts) |
| Date helpers | `src/features/bookings/dt.ts` | Pure date formatting |
| Progress helpers | `src/features/bookings/progress.ts` | Booking progress calculations |
| Demo/guest mode | `src/lib/demo.ts` | Adapt `localStorage` → `AsyncStorage`/`MMKV` |
| Platform detection | `src/utils/platform.ts` | Replace Capacitor → `Platform` from `react-native` |
| FAQ content | `src/lib/data/faqs.ts`, `src/content/faqs.tsx` | Static content |

### Reusable with Adaptation (swap storage/transport layer)

| Category | File(s) | Adaptation Needed |
|----------|---------|-------------------|
| Supabase client | `src/integrations/supabase/client.ts` | Replace `localStorage` → `MMKV`; remove Proxy pattern; simplify backend resolver |
| Backend resolver | `src/lib/backendResolver.ts` | Replace `localStorage` → `MMKV`; keep URL-testing logic |
| Auth helpers | `src/lib/auth-helpers.ts` | Adapt for `@react-native-firebase/auth` |
| Firebase config | `src/lib/firebase.ts` | **Full rewrite** — replace Web SDK with `@react-native-firebase` native modules |
| Profile context | `src/contexts/ProfileContext.tsx` | Keep Supabase query logic; replace React Context → Zustand or keep Context |
| Auth provider | `src/components/auth/AuthProvider.tsx` | Keep auth state machine; swap Firebase Web → `@react-native-firebase/auth` |
| Push notifications | `src/hooks/usePushNotifications.ts` | Rewrite — use `@react-native-firebase/messaging` + `notifee` instead of Capacitor plugin |

### React Query Hooks (reusable queries, swap UI)

All hooks in `src/hooks/` that use `useQuery` / Supabase can be reused with the same query logic:

- `useBuildings.ts`, `useCommunities.ts`, `useFlats.ts`, `useFlatSize.ts`
- `useFavoriteWorkers.ts`, `useOnlineWorkerCounts.ts`
- `useSlotSurge.ts`, `useSupplyCheck.ts`
- `useDishIntensityPricing.ts`
- `useMaintenanceMode.ts`, `useWebVersion.ts` (adapt for native version checking)
- `useUnseenMessages.ts`, `useSupportChat.ts`

### Realtime Hooks (reusable with same Supabase realtime API)

- `src/features/bookings/useBookingRealtime.ts`
- `src/features/bookings/useAssignmentsRealtime.ts`
- `src/features/bookings/useMyBookingsRealtime.ts`

---

## B. What Must Be Rebuilt

### Complete Rewrite Required

| Category | Current Implementation | React Native Replacement |
|----------|----------------------|--------------------------|
| **All UI screens** (15+ screens) | React DOM + Tailwind + shadcn | React Native primitives + NativeWind or StyleSheet |
| **Routing** | `react-router-dom` (BrowserRouter) | `@react-navigation/native` (Stack + Bottom Tabs) |
| **Bottom tabs** | `src/components/BottomTabs.tsx` (DOM) | `@react-navigation/bottom-tabs` |
| **Forms** | HTML `<input>`, `<select>`, shadcn components | `TextInput`, custom pickers, `react-hook-form` with RN |
| **Modals/Sheets** | `@radix-ui/react-dialog`, `vaul` (Drawer) | `@gorhom/bottom-sheet`, React Navigation modals |
| **Toasts** | `sonner` (DOM-based) | `react-native-toast-message` or `notifee` local notifications |
| **Service worker** | `src/lib/registerServiceWorker.ts` | **Delete** — not applicable in RN |
| **Web push** | `firebase/messaging` (web), VAPID, service worker | `@react-native-firebase/messaging` |
| **reCAPTCHA** | `RecaptchaVerifier` for phone auth | **Not needed** — native Firebase Phone Auth has no reCAPTCHA |
| **HTML splash** | `index.html` splash div | `react-native-bootsplash` or `expo-splash-screen` |
| **DOMPurify** | `src/features/legal/TermsScreen.tsx` | `react-native-webview` or `react-native-render-html` |
| **Marked (markdown)** | Legal screens render markdown → HTML | `react-native-markdown-display` |
| **Capacitor plugins** | `@capacitor/app`, `@capacitor/splash-screen`, etc. | Native RN equivalents (see package recommendations) |
| **CSS/Tailwind** | All `className` props, `cn()`, design tokens in `index.css` | NativeWind (Tailwind for RN) or `StyleSheet.create()` |

### Files to Delete (not applicable in RN)

- `src/lib/registerServiceWorker.ts`
- `public/firebase-messaging-sw.js`
- `src/components/WebVersionControl.tsx`
- `src/hooks/useWebVersion.ts`, `useWebVersionQuery.ts`
- `src/components/UpdateBanner.tsx`, `UpdateRequiredScreen.tsx`
- `capacitor.config.ts`
- All `android/` and `ios/` Capacitor native dirs (replaced by RN native dirs)
- `index.html` (RN has no index.html)

---

## C. Recommended React Native Stack

### Framework Decision: **Expo (Managed → Bare)**

| Option | Verdict | Reason |
|--------|---------|--------|
| **Expo (with dev client)** | ✅ **Recommended** | EAS Build, OTA updates, native module support via `expo-dev-client`, simpler CI/CD |
| Bare React Native | ❌ | More manual setup for build/deploy; all Expo libraries now work in bare too |

Expo's "development build" approach gives you full native module access (Firebase, Razorpay) while keeping the Expo build toolchain.

### Core Stack

| Layer | Package | Why |
|-------|---------|-----|
| Framework | `expo` + `expo-dev-client` | EAS Build, OTA updates, managed native deps |
| Navigation | `@react-navigation/native` + `@react-navigation/bottom-tabs` + `@react-navigation/native-stack` | Industry standard, deep link support, type-safe |
| State/Cache | `@tanstack/react-query` v5 | **Already in use** — same hooks, same patterns, zero learning curve |
| Forms | `react-hook-form` + `zod` | **Already in use** — works identically in RN |
| Storage | `react-native-mmkv` | 30x faster than AsyncStorage, synchronous API, drop-in localStorage replacement |
| Auth | `@react-native-firebase/app` + `@react-native-firebase/auth` | Native Phone OTP (no reCAPTCHA), matches current Firebase project |
| Push | `@react-native-firebase/messaging` + `notifee` | Native FCM, foreground notifications, notification channels, same backend |
| Payments | `react-native-razorpay` | Official Razorpay RN SDK, native UPI intent on Android |
| HTTP/API | `@supabase/supabase-js` | **Already in use** — swap storage adapter to MMKV |
| Styling | `nativewind` v4 | Tailwind syntax in RN — closest migration path from current Tailwind classes |
| Bottom Sheets | `@gorhom/bottom-sheet` | Gesture-driven, reanimated-powered, replaces vaul/Drawer |
| Icons | `lucide-react-native` | **Same icon set** as current app |
| Date/Time | `date-fns` | **Already in use** — works in RN |
| Splash | `expo-splash-screen` | Managed splash with branding |
| Updates | `expo-updates` | OTA code updates without store review |
| Crash Reporting | `@sentry/react-native` or `expo-firebase-crashlytics` | Production error tracking |
| Analytics | `@react-native-firebase/analytics` | Event tracking, screen views |
| Deep Links | `expo-linking` + React Navigation deep link config | Universal links + custom scheme |
| Environment | `expo-constants` + `eas.json` | Per-environment config (dev/staging/prod) |

---

## D. Screen-by-Screen Migration Map

| Screen | Current File | Difficulty | Reason |
|--------|-------------|------------|--------|
| **Auth / Phone Input** | `src/pages/Auth.tsx` | 🟢 Easy | Simple form; Firebase native auth is simpler than web |
| **OTP Verification** | `src/pages/VerifyOTP.tsx` | 🟢 Easy | OTP input + verify; native Firebase auto-fills OTP |
| **Home** | `src/features/home/HomeScreen.tsx` | 🟡 Medium | Carousel, active booking card, service rows — moderate RN layout work |
| **Booking Form** | `src/features/booking/BookingForm.tsx` (1128 lines) | 🔴 Hard | Complex multi-section form, conditional UI, pricing logic, 1100+ lines — needs decomposition |
| **Instant Checkout** | `src/features/booking/InstantCheckoutScreen.tsx` (417 lines) | 🟡 Medium | Worker selection + booking creation; moderate |
| **Schedule Screen** | `src/features/booking/ScheduleScreen.tsx` (503 lines) | 🟡 Medium | Date picker + time slots + booking; moderate |
| **Bookings List** | `src/features/bookings/BookingsScreen.tsx` | 🟢 Easy | FlatList of booking cards |
| **Booking Detail** | `src/pages/BookingDetail.tsx` | 🟡 Medium | Status tracking, chat, payment actions |
| **Profile** | `src/pages/Profile.tsx` | 🟢 Easy | Display profile info, logout |
| **Account Settings** | `src/routes/profile/AccountSettings.tsx` | 🟢 Easy | Simple forms |
| **Chat** | `src/features/chat/ChatScreen.tsx` | 🟡 Medium | Message list + composer; needs RN keyboard handling |
| **Support** | `src/routes/support/SupportScreen.tsx` | 🟢 Easy | Form + FAQ list |
| **FAQs** | `src/pages/FAQs.tsx` | 🟢 Easy | Accordion list |
| **Legal (Terms/Privacy)** | `src/features/legal/*` | 🟡 Medium | Markdown rendering needs `react-native-render-html` or WebView |
| **Diagnostics** | `src/pages/Diagnostics.tsx` | 🟢 Easy | Debug info display |
| **Payment (UPI)** | `src/components/UpiChooser.tsx`, `PayWorkerManualSheet.tsx` | 🟡 Medium | Razorpay SDK + UPI intent handling |
| **Worker QR Modal** | `src/components/WorkerQrModal.tsx` | 🟡 Medium | QR display; use `react-native-qrcode-svg` |
| **Maintenance/Update** | `src/components/MaintenanceScreen.tsx`, `NativeUpdateRequiredScreen.tsx` | 🟢 Easy | Static screens |
| **Offline Screen** | `src/components/OfflineScreen.tsx` | 🟢 Easy | Use `@react-native-community/netinfo` |

**Summary:** 8 Easy · 9 Medium · 1 Hard

---

## E. Risk Areas

### E1. Firebase OTP Auth Migration — Risk: 🟡 MEDIUM

**Current:** Firebase Web SDK with `RecaptchaVerifier` (web) + `@capacitor-firebase/authentication` (Android native, with web fallback)

**RN approach:** `@react-native-firebase/auth` — Phone auth is native on both platforms, **no reCAPTCHA needed**

**Risks:**
- Must configure SHA-1/SHA-256 for Android in Firebase Console (already done for Capacitor)
- iOS requires APNs certificate upload to Firebase (may already be configured)
- Same Firebase project (`didinowusernew`) — tokens and UIDs will be identical, so **existing users keep their accounts**
- OTP auto-read on Android works natively (better than Capacitor)

### E2. FCM Push Notifications — Risk: 🟢 LOW

**Current:** Dual system — Capacitor `PushNotifications` plugin (native) + Firebase Web Messaging (web)

**RN approach:** `@react-native-firebase/messaging` + `notifee` for local/foreground notifications

**Why low risk:**
- Backend edge functions (`send-user-fcm/index.ts`) already send correct FCM v1 payloads
- `fcm_tokens` table stores tokens by platform — RN tokens will be stored the same way
- `register-user-fcm-token` edge function doesn't care about client framework
- `notifee` handles foreground display, notification channels, and actions natively
- The query invalidation pattern from `usePushNotifications.ts` can be reused

### E3. Razorpay Payment Flow — Risk: 🟡 MEDIUM

**Current:** Web `checkout.js` + custom Capacitor Android plugin (`RazorpayPlugin.java`) for native UPI

**RN approach:** `react-native-razorpay` — official SDK with native UPI support on both platforms

**Risks:**
- Backend edge functions (`create-razorpay-order`, `verify-razorpay-payment`) are **fully reusable** — no changes needed
- Payment callback format may differ slightly between web checkout.js and native SDK
- UPI intent handling is built into the native SDK — current manual `AppLauncher` UPI logic can be deleted
- Must test Razorpay test mode → live mode transition

### E4. Deep Links — Risk: 🟢 LOW

**Current:** Custom scheme `didinow://` + App Links (`app.didisnow.com`)

**RN approach:** `expo-linking` + React Navigation deep link config

- Same `assetlinks.json` / `apple-app-site-association` files
- `normalizeDeepLink` logic from `src/lib/deepLink.ts` is reusable
- Navigation config maps URLs to screens declaratively

### E5. Local Storage / Session Persistence — Risk: 🟢 LOW

**Current:** `localStorage` for FCM token cache, backend URL cache, demo mode, Supabase session

**RN approach:** `react-native-mmkv` — synchronous, encrypted, much faster

- Drop-in replacement pattern: create `mmkvStorage` adapter implementing `getItem`/`setItem`/`removeItem`
- Supabase client accepts custom storage adapter

### E6. Booking Timer / Realtime States — Risk: 🟢 LOW

**Current:** Supabase Realtime channels (`useBookingRealtime.ts`, `useAssignmentsRealtime.ts`)

**RN approach:** Same `@supabase/supabase-js` realtime API — works identically in RN

- `Timer.tsx` and `AutoCompleteCountdown.tsx` use `setInterval` — works in RN
- `useNow.ts` hook works unchanged

### E7. Safe Area / Status Bar / Notch — Risk: 🟡 MEDIUM

**Current:** CSS `env(safe-area-inset-*)`, viewport-fit=cover, custom `--vh` variable

**RN approach:** `react-native-safe-area-context` (included with Expo)

- Every screen must be wrapped in `<SafeAreaView>` or use `useSafeAreaInsets()`
- Bottom tab bar handled by `@react-navigation/bottom-tabs` automatically
- Must test on notched devices (iPhone X+, Android camera cutouts)

### E8. App Update Strategy — Risk: 🟢 LOW

**Current:** Web version check (`useWebVersion`) + native version gate (`useNativeVersionGate`)

**RN approach:**
- JS bundle updates: `expo-updates` (OTA, no store review)
- Native binary updates: `react-native-version-check` or `expo-updates` channel management
- Force update: Keep same `app_settings` table check, show blocking screen

### E9. Analytics / Crash Tracking — Risk: 🟢 LOW

**Currently:** No analytics library detected in the codebase

**RN approach:** Add `@sentry/react-native` + `@react-native-firebase/analytics` from day one

---

## F. Migration Strategy Recommendation

### Recommended: **Option 2 — Phased Migration with Backend Reuse**

| Option | Verdict | Reason |
|--------|---------|--------|
| Full rewrite from scratch | ❌ | Throws away tested business logic; higher bug risk |
| **Phased migration + backend reuse** | ✅ **Recommended** | Reuse all backend (edge functions, DB, RPCs), reuse business logic (pricing, slots, validation), rebuild only UI layer |
| Hybrid approach | ❌ | React Native WebView hybrid defeats the purpose of going native |

**Why phased:**
1. Backend (Supabase) is **100% reusable** — zero changes needed to edge functions, triggers, RPCs, or tables
2. ~60% of TypeScript logic is pure functions that port directly
3. The risk areas (Firebase auth, Razorpay, FCM) are well-documented with mature RN libraries
4. Phased approach means you can ship a working Android app in Phase 3 while iOS catches up
5. Current Capacitor app continues serving users during migration

---

## Execution Roadmap

### Phase 1: Setup & Architecture (Week 1)

**Scope:**
- Initialize Expo project with TypeScript
- Configure `@react-native-firebase` (auth + messaging)
- Set up Supabase client with MMKV storage adapter
- Set up React Navigation (stack + tabs)
- Configure NativeWind for styling
- Set up EAS Build for Android + iOS
- Port `backendResolver.ts` with MMKV
- Create shared folder structure for reused logic

**Deliverables:**
- Building & running RN app shell on both platforms
- Supabase client connecting to production backend
- Firebase initialized

**Risks:**
- Firebase native setup requires correct `google-services.json` (Android) and `GoogleService-Info.plist` (iOS)
- EAS Build configuration for custom native modules

**Dependencies:** None

---

### Phase 2: Auth + App Shell (Week 2)

**Scope:**
- Phone OTP login screen (native Firebase auth — simpler than web)
- OTP verification screen (auto-read on Android)
- AuthGate equivalent with navigation guard
- Profile context (port Supabase query)
- Bottom tab navigation (Home, Bookings, Profile)
- Maintenance mode gate
- Native version gate
- Offline detection with `@react-native-community/netinfo`

**Deliverables:**
- Users can log in with phone number
- Protected tab navigation
- Profile loaded from Supabase

**Risks:**
- Firebase Phone Auth requires SHA-256 for Android (should be pre-configured)
- iOS requires APNs setup

**Dependencies:** Phase 1

---

### Phase 3: Booking + Pricing Core (Weeks 3–4)

**Scope:**
- Home screen (service cards, active booking, availability)
- Booking form (port 1128-line component — decompose into smaller components)
- Instant checkout screen (worker selection + booking)
- Schedule screen (date/slot picker + booking)
- Bookings list screen
- Booking detail screen (status tracking, realtime updates)
- Chat screen
- Favorites
- Port all pricing, slot, and supply-check logic

**Deliverables:**
- Full booking flow working end-to-end
- Realtime booking status updates
- Chat with support

**Risks:**
- BookingForm.tsx is 1128 lines — must decompose into 4–5 focused components
- Realtime subscriptions must handle app background/foreground lifecycle

**Dependencies:** Phase 2

---

### Phase 4: Payments + Notifications (Week 5)

**Scope:**
- Razorpay integration (`react-native-razorpay`)
- UPI payment flow (native SDK handles intents)
- Payment confirmation / manual pay sheet
- Worker QR modal
- FCM push notification registration
- Foreground notification display (notifee)
- Background notification handling
- Deep link navigation from notifications
- Query invalidation on notification receipt

**Deliverables:**
- End-to-end payment flow
- Push notifications on Android + iOS
- Deep link navigation

**Risks:**
- Razorpay SDK test → live mode requires dashboard configuration
- iOS push requires APNs certificate + provisioning profile
- Notification payload format must match backend expectations

**Dependencies:** Phase 3

---

### Phase 5: QA + Store Publishing (Week 6)

**Scope:**
- Full regression testing on physical devices
- Safe area / notch testing across devices
- Performance profiling (startup time, navigation, scrolling)
- Crash reporting setup (Sentry)
- Analytics setup (Firebase Analytics)
- App icons + splash screen (brand assets)
- Store listing preparation (screenshots, descriptions — already in `store/` folder)
- EAS Submit for Google Play + App Store
- OTA update channel configuration

**Deliverables:**
- Production APK + IPA
- Store listings submitted
- Crash reporting active
- OTA update pipeline

**Risks:**
- App Store review may take 1–7 days
- Play Store review typically 1–3 days
- Must handle migration from Capacitor app → RN app (same package name `com.didisnow.app`)

**Dependencies:** Phase 4

---

## Timeline Summary

| Phase | Duration | Cumulative |
|-------|----------|------------|
| Phase 1: Setup | 1 week | Week 1 |
| Phase 2: Auth + Shell | 1 week | Week 2 |
| Phase 3: Booking Core | 2 weeks | Week 4 |
| Phase 4: Payments + Push | 1 week | Week 5 |
| Phase 5: QA + Publish | 1 week | Week 6 |

**Total estimated: 6 weeks** for a single experienced RN developer, or **4 weeks** with two developers (one on auth/navigation, one on booking/payments).

---

*This plan is based on the actual Didi Now user app codebase as of 2026-03-26. No code changes have been made.*
