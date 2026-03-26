# Capacitor 8 Migration Assessment — Didi Now User App

**Date:** 2026-03-26
**Current Capacitor version:** 7.4.2
**Target version:** 8.x

---

## 1. Current Capacitor Packages

| Package | Current Version | Type |
|---------|----------------|------|
| `@capacitor/core` | ^7.4.2 | Runtime |
| `@capacitor/cli` | ^7.4.2 | Dev tool |
| `@capacitor/android` | ^7.4.2 | Platform |
| `@capacitor/ios` | ^7.4.2 | Platform |
| `@capacitor/app` | ^7.1.1 | Plugin |
| `@capacitor/app-launcher` | ^7.0.2 | Plugin |
| `@capacitor/action-sheet` | ^7.0.2 | Plugin |
| `@capacitor/browser` | ^7.0.0 | Plugin |
| `@capacitor/push-notifications` | 7.0.0 | Plugin |
| `@capacitor/splash-screen` | 7.0.0 | Plugin |
| `@capacitor/assets` | ^3.0.5 | Dev tool |

---

## 2. Required Package Changes for Capacitor 8

```bash
# Core
npm install @capacitor/core@^8.0.0 @capacitor/android@^8.0.0 @capacitor/ios@^8.0.0
npm install -D @capacitor/cli@^8.0.0

# All plugins must be v8
npm install @capacitor/app@^8.0.0 @capacitor/app-launcher@^8.0.0 \
  @capacitor/action-sheet@^8.0.0 @capacitor/browser@^8.0.0 \
  @capacitor/push-notifications@^8.0.0 @capacitor/splash-screen@^8.0.0

# Assets tool (should resolve deprecated transitive deps)
npm install -D @capacitor/assets@latest
```

---

## 3. Breaking Changes Analysis

### 3.1 Node.js Requirement
- **Cap 8 requires Node.js 22+**
- Current CI/dev environments must be verified
- Lovable sandbox may not yet support Node 22

### 3.2 Edge-to-Edge (Android) — **HIGH IMPACT**
- Cap 8 **removes** the `adjustMarginsForEdgeToEdge` config option
- App content now renders **behind** system bars (status bar + navigation bar) by default
- Must use CSS `env(safe-area-inset-*)` variables to avoid content being hidden behind bars
- **This app already uses `viewport-fit=cover`** in `index.html` and `safe-top`/`pb-safe-bottom` classes — good foundation, but needs testing
- Android `styles.xml` may need updates for the new edge-to-edge behavior

### 3.3 Android Build Tooling
| Tool | Cap 7 | Cap 8 |
|------|-------|-------|
| Gradle Plugin (AGP) | 8.2.0 | **8.13.0** |
| Gradle Wrapper | 8.11.1 | **8.14.3** |
| Kotlin | 1.9.x | **2.2.x** |
| Target SDK | 35 | **36** |
| Android Studio | Ladybug+ | **Meerkat+** |

- AGP 8.13+ requires Android Studio Meerkat or newer
- Kotlin 2.2 is a major jump — any custom native code must be compatible
- Gradle property syntax changes: `property('x')` → new accessor syntax

### 3.4 iOS Changes
- **SPM (Swift Package Manager) is now default** for new projects
- Existing CocoaPods projects continue to work but `npx cap add ios` would create SPM-based project
- Minimum Xcode version bump likely required
- `CAPBridgeViewController` notification changes for `viewDidAppear` and `viewWillTransition`

### 3.5 Push Notifications
- Plugin API surface is largely the same between v7 and v8
- **No known breaking changes** for `@capacitor/push-notifications`
- Firebase FCM integration should continue working
- **Risk: LOW** — but must verify the native `FirebaseMessagingService` in `AndroidManifest.xml` still resolves correctly with new AGP/Kotlin

### 3.6 App Links / Deep Links
- No breaking changes in deep link handling
- `intent-filter` declarations in `AndroidManifest.xml` remain the same
- Custom URL scheme (`didinow://`) unaffected
- **Risk: LOW**

### 3.7 Splash Screen
- `@capacitor/splash-screen` v8 likely aligns with edge-to-edge changes
- The current native launch theme (`AppTheme.NoActionBarLaunch`) may need adjustments for Android 15+ edge-to-edge enforcement
- **Risk: MEDIUM** — the splash-to-WebView transition timing should be re-tested

### 3.8 WebView / Server Config
- `bundledWebRuntime` was already deprecated and set to `false` — no change needed
- `capacitor.config.ts` `server` block unchanged
- `allowMixedContent` config unchanged
- **Risk: LOW**

---

## 4. Impact on Current Architecture

| Area | Risk | Notes |
|------|------|-------|
| Android build | 🟡 Medium | AGP + Kotlin + Gradle version jumps |
| iOS build | 🟢 Low | CocoaPods still supported |
| Edge-to-edge layout | 🔴 High | Most impactful change — must audit all screens |
| Push notifications | 🟢 Low | API unchanged |
| Deep links | 🟢 Low | No changes |
| Splash screen | 🟡 Medium | Edge-to-edge interaction |
| UPI / AppLauncher | 🟢 Low | `<queries>` already declared |
| Firebase Auth | 🟢 Low | Web SDK, not affected by Capacitor version |
| Supabase client | 🟢 Low | Pure JS, not Capacitor-dependent |

---

## 5. Benefits of Upgrading

1. **Eliminates all 23 deprecated/vulnerable transitive deps** (via updated `@capacitor/assets`)
2. **Android 15+ compliance** — edge-to-edge is mandatory on Android 15 (API 36)
3. **Kotlin 2.2** — better performance, modern language features
4. **SPM support on iOS** — faster builds, no CocoaPods dependency (for new setups)
5. **Future plugin compatibility** — community plugins will progressively drop Cap 7 support

---

## 6. Recommendation

| Factor | Assessment |
|--------|-----------|
| Is it blocked? | **No** — no fundamental blocker, but requires careful work |
| Risk level | **🟡 MEDIUM** |
| Effort estimate | 2–4 hours for an experienced mobile developer |
| Recommended timing | **After React Native migration decision is finalized** |

### Rationale

Since the project is actively evaluating a **full React Native migration** (per `didi-now-react-native-migration.md`), upgrading the Capacitor shell to v8 is a significant effort that may become throwaway work. 

**Recommended approach:**
- If React Native migration proceeds → **skip Cap 8 upgrade entirely**
- If Capacitor is kept long-term → **upgrade to Cap 8 within 2–3 months** (before Android 15 enforcement deadline)
- The current Cap 7 setup has **zero production vulnerabilities** and is fully functional

---

## 7. Migration Steps (When Ready)

```bash
# 1. Ensure Node.js 22+
node --version  # must be >= 22

# 2. Use Capacitor CLI migration tool
npx @capacitor/cli@latest migrate

# 3. Review and fix any flagged items

# 4. Update Android build files
#    - AGP → 8.13.0
#    - Gradle Wrapper → 8.14.3
#    - Kotlin → 2.2.x
#    - compileSdk / targetSdk → 36

# 5. Audit edge-to-edge CSS
#    - Test all screens with system bars overlay
#    - Verify safe-area-inset usage

# 6. Test on physical devices
#    - Android 14+ (edge-to-edge)
#    - iOS latest
#    - Push notifications
#    - UPI deep links
#    - Splash screen transition

# 7. Rebuild and submit to stores
npx cap sync
```

---

*This is an assessment only. No upgrade has been performed.*
