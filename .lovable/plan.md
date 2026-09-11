# Fix iOS user FCM token storage

## Scope
- Change only the user push registration, user push sender, and user logout cleanup functions.
- Keep APNs, Firebase, Xcode, Android, permission handling, booking notifications, and worker push storage unchanged.

## Implementation
1. Use `public.user_fcm_tokens` for user-device tokens because its `user_id` foreign key references `public.profiles(id)`.
2. Keep Firebase-token verification and `firebase_uid → profiles.id` mapping unchanged.
3. Update registration to preserve platform/device metadata and safely upsert the user’s token.
4. Update `send-user-fcm` and `unregister-user-fcm-token` to read/delete from the same table.
5. Deploy only those three functions.

## Verification
- Confirm registration returns HTTP 200 for profile `4bb948af-3a1f-42e5-b5f3-a77adeec03bd` after the iPhone retries.
- Confirm one stored row has that profile ID and `platform = ios`.
- Confirm `send-user-fcm` finds exactly that row.
- Send one direct test push and report the FCM/APNs result.
- Separately report direct-host reachability; do not mix it with the fixed foreign-key issue.
