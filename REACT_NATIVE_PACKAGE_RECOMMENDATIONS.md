# React Native Package Recommendations — Didi Now User App

**Date:** 2026-03-26  
**Based on:** Current codebase analysis and production requirements

---

## Navigation

| Package | Version | Why |
|---------|---------|-----|
| `@react-navigation/native` | ^7.x | Industry-standard RN navigation. Type-safe, deep link support, handles Android back button. Replaces `react-router-dom`. |
| `@react-navigation/native-stack` | ^7.x | Native stack navigator using platform APIs (UINavigationController on iOS, Fragment on Android). Faster than JS-based stack. |
| `@react-navigation/bottom-tabs` | ^7.x | Replaces current `BottomTabs.tsx`. Badge support, lazy loading, customizable tab bar. |
| `react-native-screens` | ^4.x | Required peer dep for native-stack. Optimizes memory by using native screen containers. |
| `react-native-safe-area-context` | ^5.x | Safe area insets for notches/status bars. Replaces CSS `env(safe-area-inset-*)`. |

---

## State Management & Data Fetching

| Package | Version | Why |
|---------|---------|-----|
| `@tanstack/react-query` | ^5.x | **Already in use.** Same hooks, same patterns, same query keys. Zero migration cost for data layer. |
| `zustand` | ^5.x | Lightweight global state for UI state (selected service, booking form state). Optional — can continue with React Context if preferred. |

---

## Forms & Validation

| Package | Version | Why |
|---------|---------|-----|
| `react-hook-form` | ^7.x | **Already in use.** Works identically in React Native with `Controller` component for RN inputs. |
| `@hookform/resolvers` | ^3.x | **Already in use.** Zod resolver integration. |
| `zod` | ^3.x | **Already in use.** Schema validation is pure TS — works unchanged in RN. |

---

## Storage

| Package | Version | Why |
|---------|---------|-----|
| `react-native-mmkv` | ^3.x | **Primary recommendation.** 30x faster than AsyncStorage, synchronous API, encrypted. Direct replacement for `localStorage` used throughout the app (FCM token cache, backend URL cache, demo mode). Supabase client accepts MMKV as custom storage adapter. |

**Migration pattern:**
```typescript
import { MMKV } from 'react-native-mmkv';
const storage = new MMKV();

// Drop-in replacement for localStorage
const mmkvStorage = {
  getItem: (key: string) => storage.getString(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
};
```

---

## Firebase Auth

| Package | Version | Why |
|---------|---------|-----|
| `@react-native-firebase/app` | ^21.x | Core Firebase SDK for RN. Native module — no web SDK overhead. |
| `@react-native-firebase/auth` | ^21.x | Native Phone OTP authentication. **No reCAPTCHA needed** (unlike current web flow). Auto-reads SMS on Android. Same Firebase project (`didinowusernew`), same UIDs — existing users keep accounts. |

**Key benefit:** Current web flow requires RecaptchaVerifier + fallback logic for Capacitor. RN native auth is simpler:
```typescript
import auth from '@react-native-firebase/auth';
const confirmation = await auth().signInWithPhoneNumber('+91XXXXXXXXXX');
await confirmation.confirm('123456');
```

---

## Firebase Messaging (Push Notifications)

| Package | Version | Why |
|---------|---------|-----|
| `@react-native-firebase/messaging` | ^21.x | Native FCM token registration, background message handling, topic subscriptions. Replaces both Capacitor PushNotifications plugin AND Firebase Web Messaging. Same backend edge functions (`register-user-fcm-token`, `send-user-fcm`) work unchanged. |
| `notifee` | ^9.x | **Foreground notification display.** FCM only delivers data messages silently when app is in foreground — notifee creates visible local notifications with custom channels, actions, and styling. Replaces current `sonner` toast + Capacitor foreground handling. |

**Why two packages:** `@react-native-firebase/messaging` handles FCM transport. `notifee` handles notification UI (channels, badges, foreground display). Together they provide the most reliable push notification stack for RN.

---

## Payments

| Package | Version | Why |
|---------|---------|-----|
| `react-native-razorpay` | ^2.x | Official Razorpay React Native SDK. Handles UPI intent natively on Android (no manual `AppLauncher` needed). Supports all payment methods (UPI, cards, netbanking, wallets). Backend edge functions (`create-razorpay-order`, `verify-razorpay-payment`) are fully compatible — same order creation and signature verification flow. |

**Replaces:** Current `checkout.js` web integration + custom `RazorpayPlugin.java` Capacitor plugin + manual UPI URL building in `launchUpiPayment.ts`.

---

## SVG & Icons

| Package | Version | Why |
|---------|---------|-----|
| `lucide-react-native` | ^0.x | **Same icon library** as current app (`lucide-react`). Same icon names, same API. Minimal migration — just change imports from `lucide-react` to `lucide-react-native`. |
| `react-native-svg` | ^15.x | Required peer dependency for lucide-react-native and any SVG rendering. |

---

## Bottom Sheets

| Package | Version | Why |
|---------|---------|-----|
| `@gorhom/bottom-sheet` | ^5.x | Gesture-driven bottom sheets powered by Reanimated. Replaces `vaul` (web Drawer) and `@radix-ui/react-dialog`. Supports snap points, keyboard handling, backdrop, and scrollable content. The current app uses bottom sheets extensively (ScheduleSheet, DishIntensitySheet, CancelBookingSheet, ChatSheet, PayWorkerManualSheet). |
| `react-native-reanimated` | ^3.x | Required for @gorhom/bottom-sheet animations. Also useful for page transitions and micro-interactions. |
| `react-native-gesture-handler` | ^2.x | Required for gesture recognition in bottom sheets and swipeable components. |

---

## Date & Time

| Package | Version | Why |
|---------|---------|-----|
| `date-fns` | ^3.x | **Already in use.** Pure JS date library — works unchanged in RN. Used in `slot-utils.ts`, `dt.ts`, `ScheduleScreen.tsx`. |
| `react-native-date-picker` | ^5.x | Native date picker for scheduled booking date selection. Better UX than custom date chips on mobile. Optional — can keep current custom chip UI rebuilt in RN. |

---

## Environment Variables

| Package | Version | Why |
|---------|---------|-----|
| `expo-constants` | (bundled with Expo) | Access app config values at runtime. Environment-specific config via `eas.json` build profiles (dev/staging/prod). |
| `react-native-config` | ^1.x | **Alternative if not using Expo.** Reads `.env` files per build variant. |

**Config approach with Expo:**
```json
// eas.json
{
  "build": {
    "production": {
      "env": {
        "SUPABASE_URL": "https://api.didisnow.com",
        "SUPABASE_ANON_KEY": "eyJ..."
      }
    }
  }
}
```

---

## Analytics & Crash Reporting

| Package | Version | Why |
|---------|---------|-----|
| `@sentry/react-native` | ^6.x | Production crash reporting with source maps, breadcrumbs, and performance monitoring. Catches JS + native crashes. Essential for production app. |
| `@react-native-firebase/analytics` | ^21.x | Event tracking (booking created, payment completed, screen views). Same Firebase project — data appears in existing Firebase Console. |
| `@react-native-firebase/crashlytics` | ^21.x | **Alternative/complement to Sentry.** Native crash reporting in Firebase Console. Can run alongside Sentry for redundancy. |

---

## Networking & Connectivity

| Package | Version | Why |
|---------|---------|-----|
| `@react-native-community/netinfo` | ^11.x | Network state detection. Replaces `navigator.onLine` + `online`/`offline` events used in `App.tsx`. Provides connection type (wifi, cellular), internet reachability checks, and offline detection. |

---

## QR Code

| Package | Version | Why |
|---------|---------|-----|
| `react-native-qrcode-svg` | ^6.x | QR code generation for worker payment QR display (`WorkerQrModal.tsx`). SVG-based, customizable colors and size. |

---

## Additional Utilities

| Package | Version | Why |
|---------|---------|-----|
| `react-native-toast-message` | ^2.x | In-app toast notifications. Replaces `sonner`. Customizable, works with SafeAreaView. |
| `expo-linking` | (bundled with Expo) | Deep link handling. Replaces Capacitor `App.addListener('appUrlOpen')`. Works with React Navigation deep link config. |
| `expo-splash-screen` | (bundled with Expo) | Native splash screen management. Replaces both the HTML splash in `index.html` and `@capacitor/splash-screen`. |
| `expo-updates` | (bundled with Expo) | OTA JavaScript bundle updates without store review. Replaces current web version checking (`useWebVersion`). |
| `react-native-render-html` | ^6.x | Renders HTML content in RN. For legal pages (Terms, Privacy) that currently use DOMPurify + `dangerouslySetInnerHTML`. |

---

## Package Count Summary

| Category | Packages | Notes |
|----------|----------|-------|
| Navigation | 5 | Core navigation stack |
| Data/State | 2 | TanStack Query (reused) + Zustand (optional) |
| Forms | 3 | All reused from current app |
| Storage | 1 | MMKV replaces localStorage |
| Firebase | 5 | Auth + Messaging + Analytics + Crashlytics + Core |
| Payments | 1 | Razorpay native SDK |
| UI Components | 6 | Bottom sheet, icons, SVG, QR, toast, HTML renderer |
| Platform | 4 | NetInfo, linking, splash, updates |
| Crash/Analytics | 1 | Sentry |
| **Total** | **~28** | vs current 40+ web packages |

---

## Packages NOT Needed in RN (current web-only deps to drop)

| Current Package | Why Not Needed |
|----------------|----------------|
| `tailwindcss`, `postcss`, `autoprefixer` | Replaced by NativeWind (if used) or StyleSheet |
| All `@radix-ui/*` packages (15+) | Web-only accessible primitives; replaced by RN equivalents |
| `vaul` | Web drawer; replaced by `@gorhom/bottom-sheet` |
| `sonner` | Web toast; replaced by `react-native-toast-message` |
| `cmdk` | Web command palette; not applicable |
| `embla-carousel-react` | Web carousel; use `FlatList` with `pagingEnabled` or `react-native-reanimated-carousel` |
| `recharts` | Web SVG charts; use `victory-native` or `react-native-chart-kit` if needed |
| `dompurify` | DOM sanitization; not applicable in RN |
| `marked` | Markdown → HTML; use `react-native-render-html` or `react-native-markdown-display` |
| `class-variance-authority`, `clsx`, `tailwind-merge` | Web CSS utilities; NativeWind handles this or use StyleSheet |
| `next-themes` | Web theme switching; use RN `Appearance` API |
| `lovable-tagger` | Lovable dev tool; not applicable |
| All `@capacitor/*` packages | Replaced by RN native modules |

---

*This document recommends exact packages for the Didi Now React Native migration. No packages have been installed.*
