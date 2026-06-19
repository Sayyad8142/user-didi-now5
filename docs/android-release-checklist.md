# Android Release Checklist (User App)

## Single source of truth

All Android versioning lives in **`android/version.properties`**:

```
versionCode=4
versionName=4.0
minVersionCode=3   # highest code already accepted by Play
```

- Do **not** edit `versionCode` / `versionName` in `android/app/build.gradle`.
- Do **not** change them from Android Studio.
- Keep `src/config/version.ts` in sync (used for in-app display only).

## Release steps

1. Open `android/version.properties` and:
   - Increase `versionCode` by at least 1.
   - Update `versionName` (e.g. `4.0` → `5.0`).
2. Update `src/config/version.ts` to match.
3. Build:

   ```bash
   npm install
   npm run build
   npx cap sync android
   cd android
   ./gradlew clean
   ./gradlew bundleRelease
   ```

4. The build automatically:
   - Runs `validateDidiNowReleaseVersion` BEFORE building — fails if `versionCode`/`versionName` is missing or `versionCode <= minVersionCode`.
   - Runs `verifyDidiNowReleaseVersion` AFTER building — fails if the AAB metadata does not match `version.properties`.
5. Confirm `android/app/build/outputs/bundle/release/output-metadata.json` shows the expected `versionCode` and `versionName`.
6. Upload `android/app/build/outputs/bundle/release/app-release.aab` to Google Play Console.
7. After Play accepts it, set `minVersionCode` in `android/version.properties` to the value you just uploaded so a future downgrade fails the build.

## Expected next release

| Field         | Value |
|---------------|-------|
| versionCode   | 5     |
| versionName   | 5.0   |

## Why builds fail

| Error message                                                          | Fix                                                                 |
|------------------------------------------------------------------------|---------------------------------------------------------------------|
| `Missing android/version.properties`                                   | Restore the file (single source of truth).                          |
| `... is missing 'versionCode' / 'versionName' / 'minVersionCode'`      | Add the missing key to `android/version.properties`.                |
| `versionCode=X must be > minVersionCode=Y`                             | Bump `versionCode` in `android/version.properties`.                 |
| `Wrong release version in AAB metadata`                                | You built from a stale checkout — run `./gradlew clean bundleRelease`. |
