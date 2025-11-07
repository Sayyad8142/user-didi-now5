# VoIP Calling Feature Documentation

## Overview

The VoIP calling feature enables free, in-app audio calls between users and workers for active bookings using Daily.co WebRTC technology.

## Features Implemented

### 1. **Call Initiation (User → Worker)**

**Location**: BookingCard.tsx (Booking details)

**When visible**: When booking status is `assigned`, `accepted`, `on_the_way`, or `started`

**UI Components**:
- Primary button: "Free Call (VoIP)" - Blue gradient
- Secondary button (disabled): "Private Call (PSTN) - Coming Soon" - Gray

**Flow**:
1. User taps "Free Call (VoIP)"
2. Frontend calls `create-rtc-call` edge function with `booking_id`
3. Backend:
   - Creates Daily.co room
   - Generates caller token (5 min expiry)
   - Inserts record in `rtc_calls` table
   - Returns room details
4. User navigates to CallScreen with "dialing" state
5. CallScreen auto-transitions to "ringing" after 2s
6. When worker joins, state changes to "active"

### 2. **Call Screen**

**Location**: `src/components/calling/CallScreen.tsx`

**Features**:
- Large avatar/icon display
- Real-time call timer
- Call state display: Connecting → Ringing → Active → Ended
- Control buttons:
  - Mute/Unmute microphone
  - Speaker on/off toggle
  - End call (red button)

**States**:
- **dialing**: Initial connection phase
- **ringing**: Waiting for other party
- **active**: Call in progress with timer
- **ended**: Call finished

### 3. **Incoming Call Handler**

**Location**: `src/components/calling/IncomingCallScreen.tsx`

**Triggers**:
- Real-time subscription to `rtc_calls` table
- When new call with current user as `callee_id`
- Plays notification sound (`/ding.mp3`)

**UI**:
- Full-screen overlay with blur background
- Caller name display
- Two large circular buttons:
  - Green "Accept" button
  - Red "Reject" button

**Accept Flow**:
1. Calls `accept-rtc-call` edge function
2. Receives callee token and room details
3. Navigates to CallScreen with "active" state

**Reject Flow**:
1. Calls `end-rtc-call` edge function
2. Updates call status to 'rejected'
3. Dismisses modal

### 4. **Call History**

**Location**: `src/components/calling/CallHistory.tsx`

**Displays**:
- All past calls for the booking
- Call time and date
- Duration (or "Not connected")
- Direction (You called / Incoming call)
- Real-time updates when new calls occur

**Visible**: For bookings in states: `assigned`, `accepted`, `on_the_way`, `started`, `completed`

### 5. **Edge Functions**

#### create-rtc-call
**Endpoint**: `POST /functions/v1/create-rtc-call`

**Request**:
```json
{
  "booking_id": "uuid"
}
```

**Response**:
```json
{
  "success": true,
  "rtc_call_id": "uuid",
  "room_id": "booking-xxx-timestamp",
  "room_url": "https://didinow.daily.co/room-name",
  "caller_token": "eyJ..."
}
```

#### accept-rtc-call
**Endpoint**: `POST /functions/v1/accept-rtc-call`

**Request**:
```json
{
  "rtc_call_id": "uuid"
}
```

**Response**:
```json
{
  "success": true,
  "room_id": "booking-xxx-timestamp",
  "room_url": "https://didinow.daily.co/room-name",
  "callee_token": "eyJ..."
}
```

#### end-rtc-call
**Endpoint**: `POST /functions/v1/end-rtc-call`

**Request**:
```json
{
  "rtc_call_id": "uuid"
}
```

**Response**:
```json
{
  "success": true,
  "duration_sec": 125
}
```

## Database Schema

### rtc_calls Table

```sql
CREATE TABLE rtc_calls (
  id UUID PRIMARY KEY,
  booking_id UUID NOT NULL,
  caller_id UUID NOT NULL,
  callee_id UUID NOT NULL,
  vendor TEXT DEFAULT 'daily',
  room_id TEXT NOT NULL,
  status TEXT DEFAULT 'initiated',
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_sec INT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

**Statuses**:
- `initiated`: Call created, waiting for acceptance
- `active`: Both parties connected
- `ended`: Call completed normally
- `rejected`: Call was rejected
- `missed`: Call not answered
- `failed`: Technical failure

## Setup Requirements

### 1. Daily.co Configuration

**Required Secrets**:
- `DAILY_API_KEY`: Your Daily.co API key
- `DAILY_DOMAIN`: Your Daily.co domain (e.g., `didinow.daily.co`)

**Setup Steps**:
1. Sign up at https://daily.co
2. Get API key from dashboard
3. Add secrets via Supabase dashboard or CLI:
```bash
supabase secrets set DAILY_API_KEY=your_key_here
supabase secrets set DAILY_DOMAIN=your_domain.daily.co
```

### 2. Mobile Permissions

**Android** (`AndroidManifest.xml`):
```xml
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
```

**iOS** (`Info.plist`):
```xml
<key>NSMicrophoneUsageDescription</key>
<string>We need access to your microphone for VoIP calls with workers</string>
```

### 3. Dependencies

```json
{
  "@daily-co/daily-js": "latest"
}
```

## Testing Guide

### Test Scenario 1: User Initiates Call

1. Login as User
2. Create a booking and wait for worker assignment
3. Open booking details
4. Tap "Free Call (VoIP)" button
5. **Expected**: Navigate to CallScreen with "Connecting..." → "Ringing..."
6. Have worker accept (see Scenario 2)
7. **Expected**: Call state changes to "Active" with timer
8. Test Mute/Speaker buttons
9. Tap "End Call"
10. **Expected**: Return to booking details, call added to history

### Test Scenario 2: Worker Calls User

**Prerequisites**: Worker app with VoIP integration

1. Worker initiates call from their app
2. **Expected**: User sees IncomingCallScreen modal
3. **Expected**: Notification sound plays
4. Tap "Accept" (green button)
5. **Expected**: Navigate to CallScreen with "Active" state
6. Verify audio works both ways
7. End call from either side
8. **Expected**: Both parties return to respective screens

### Test Scenario 3: Call Rejection

1. Follow Test Scenario 2 steps 1-3
2. Tap "Reject" (red button)
3. **Expected**: Modal dismisses, no call established
4. **Expected**: Call appears in history as "Not connected"

### Test Scenario 4: Call History

1. Complete several calls (various durations)
2. Open booking details
3. Scroll to "Call History" section
4. **Expected**: See list of all calls with:
   - Date/time
   - Direction (You called / Incoming)
   - Duration
   - Status

### Test Scenario 5: Network Issues

1. Start a call
2. Disable WiFi/mobile data mid-call
3. **Expected**: Error message shown, call ends gracefully
4. **Expected**: No app crash, can retry

### Test Scenario 6: Token Expiry

1. Initiate call but don't join immediately
2. Wait 6 minutes (tokens expire after 5 minutes)
3. Try to join
4. **Expected**: Error message about expired token
5. **Expected**: Can create new call

## Known Limitations

1. **No CallKit Integration (iOS)**: Calls don't appear in iOS call history or lock screen
2. **No Background Audio**: App must be in foreground during call
3. **Worker App Required**: Feature needs worker-side implementation
4. **Token Lifespan**: 5-minute expiry requires quick connection
5. **No Recording**: Calls are not recorded (can be added via Daily API)
6. **Audio Only**: No video support yet

## Troubleshooting

### Call Not Connecting

**Symptoms**: Stuck on "Connecting..." or "Ringing..."

**Solutions**:
1. Check `DAILY_API_KEY` and `DAILY_DOMAIN` are set correctly
2. Verify edge functions are deployed
3. Check browser console for WebRTC errors
4. Ensure microphone permissions granted
5. Test on different network (WiFi vs mobile data)

### No Sound

**Symptoms**: Call connects but no audio

**Solutions**:
1. Check microphone permissions
2. Verify device volume is up
3. Test mute button (ensure not muted)
4. Check speaker/earpiece selection
5. Try with headphones

### Incoming Calls Not Showing

**Symptoms**: Worker calls but user doesn't see modal

**Solutions**:
1. Verify real-time subscriptions are working
2. Check `rtc_calls` table has RLS policies
3. Ensure user is authenticated
4. Check browser console for subscription errors

### Call Quality Issues

**Symptoms**: Choppy audio, delays, dropouts

**Solutions**:
1. Check network speed (recommend 100+ kbps)
2. Move to better signal area
3. Close other apps using network
4. Restart app to refresh connection

## Future Enhancements

1. **CallKit Integration** (iOS native calling experience)
2. **Push Notifications** (wake app for incoming calls)
3. **Call Recording** (with user consent)
4. **Video Calling** (camera support)
5. **Group Calls** (multi-party support)
6. **Call Transfer** (transfer to support)
7. **PSTN Fallback** (via Exotel for non-smartphone users)
8. **Call Quality Metrics** (network stats, audio levels)
9. **Call Scheduling** (pre-book call times)
10. **Call Ratings** (rate call quality)

## Security Considerations

1. **Short-Lived Tokens**: All tokens expire in 5 minutes
2. **RLS Policies**: Users can only see their own calls
3. **Participant Verification**: Only booking parties can create calls
4. **Encrypted Communication**: WebRTC uses DTLS-SRTP
5. **Room Expiry**: Daily rooms auto-delete after 10 minutes
6. **No Phone Number Exposure**: Workers' phone numbers remain private

## Performance Notes

- Average call setup time: 2-4 seconds
- Bandwidth usage: ~50 kbps per direction
- Battery impact: Moderate (similar to regular phone call)
- Storage: Minimal (only call metadata stored)

## Support Contacts

- Daily.co Documentation: https://docs.daily.co
- Daily.co Support: https://www.daily.co/contact
- Daily.co Status: https://status.daily.co
