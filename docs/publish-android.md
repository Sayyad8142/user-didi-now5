# Android Play Store Publishing Guide

## Prerequisites
- Android Studio installed
- Java 17+ (required for Gradle)
- Google Play Console account

## Local Build Commands

### 1. Install dependencies and build web
```bash
npm install
npm run build
```

### 2. Generate Android assets (first time only)
```bash
npx capacitor-assets generate --android
```

### 3. Sync and open Android Studio
```bash
npm run android:prep
npm run android:open
```

### 4. Create signing keystore (first time only)
In Android Studio:
1. Go to **Build > Generate Signed Bundle/APK...**
2. Create new keystore: `android/my-release-key.jks`
3. Copy `android/signing.properties.example` to `android/signing.properties`
4. Fill in your actual keystore details
5. **DO NOT COMMIT** signing.properties or .jks files

### 5. Build AAB for Play Store
```bash
npm run android:aab
```
Output: `android/app/build/outputs/bundle/release/app-release.aab`

### 6. Build APK for testing (optional)
```bash
npm run android:apk
```
Output: `android/app/build/outputs/apk/release/app-release.apk`

## Play Console Checklist

Before uploading:
- [ ] App icon ready (512×512)
- [ ] Feature graphic ready (1024×500)
- [ ] Screenshots taken (phone + tablet)
- [ ] Privacy Policy URL live and accessible
- [ ] Data Safety form completed
- [ ] Content rating questionnaire completed
- [ ] Test credentials provided (if app requires sign-in)
- [ ] Release notes written

## Environment Variables

Ensure `.env.production` is configured with production Supabase credentials before building.

## Troubleshooting

### Build fails with signing errors
1. Verify `android/signing.properties` exists and has correct values
2. Check keystore file path is correct
3. Ensure keystore passwords match

### Upload rejected by Play Console
1. Increment `versionCode` in `android/app/build.gradle`
2. Rebuild AAB
3. Re-upload

### App crashes on launch
1. Check production environment variables are set
2. Verify network security config allows HTTPS to your backend
3. Test APK on physical device first