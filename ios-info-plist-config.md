# iOS Info.plist Configuration

After running `npm run cap:add:ios`, add the following configuration to `ios/App/App/Info.plist` inside the top-level `<dict>`:

```xml
<!-- Display name -->
<key>CFBundleDisplayName</key>
<string>Didi Now</string>

<!-- Allow AppLauncher.canOpenURL/openURL for these schemes -->
<key>LSApplicationQueriesSchemes</key>
<array>
  <string>upi</string>
  <string>phonepe</string>
  <string>gpay</string>
  <string>paytm</string>
  <string>bhim</string>
  <string>whatsapp</string>
  <string>tel</string>
  <string>mailto</string>
</array>

<!-- Photo Library Usage (for admin worker photo uploads) -->
<key>NSPhotoLibraryUsageDescription</key>
<string>We use your photo library to let admins upload worker photos.</string>
<key>NSPhotoLibraryAddUsageDescription</key>
<string>We save selected photos when admins upload worker images.</string>
<key>NSCameraUsageDescription</key>
<string>We may use the camera for taking a worker photo (admin only).</string>

<!-- App Transport Security: keep strict HTTPS -->
<key>NSAppTransportSecurity</key>
<dict>
  <key>NSAllowsArbitraryLoads</key>
  <false/>
</dict>
```

## Terminal Commands to Run:

1. `npm run cap:add:ios` - Add iOS platform
2. Replace `resources/icon.png` and `resources/splash.png` with actual assets
3. `npm run cap:assets` - Generate platform-specific icons and splash screens
4. Add the above Info.plist configuration
5. `npm run cap:sync` - Sync the project
6. `npm run cap:open:ios` - Open in Xcode
