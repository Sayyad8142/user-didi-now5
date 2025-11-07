# In-App VoIP Calling Setup Guide

This document explains how to set up and use the in-app VoIP calling feature between Users and Workers using Daily.co WebRTC.

## Overview

The system enables secure, short-lived audio calls between users and workers for active bookings. It uses:
- **Daily.co**: WebRTC provider for audio/video calling
- **Supabase**: Database, authentication, and edge functions
- **FCM**: Push notifications for incoming calls

## Architecture

### Database Schema

The `rtc_calls` table stores all call records:

```sql
create table rtc_calls (
  id uuid primary key,
  booking_id uuid references bookings(id),
  caller_id uuid,          -- auth.uid() of person initiating call
  callee_id uuid,          -- auth.uid() of person receiving call
  vendor text,             -- 'daily'
  room_id text,            -- Daily.co room name
  status text,             -- 'initiated' | 'active' | 'ended' | 'missed' | 'rejected'
  started_at timestamptz,  -- when call was accepted
  ended_at timestamptz,    -- when call ended
  duration_sec int,        -- call duration in seconds
  created_at timestamptz
);
```

### Edge Functions

Three edge functions handle the call lifecycle:

1. **create-rtc-call**: Initiates a call
2. **accept-rtc-call**: Accepts an incoming call
3. **end-rtc-call**: Ends an active call

## Setup Instructions

### 1. Configure Daily.co

1. Sign up at [Daily.co](https://daily.co)
2. Get your API key from the dashboard
3. Note your domain (e.g., `didinow.daily.co`)

### 2. Add Secrets to Supabase

Add the following secrets via Supabase dashboard or CLI:

```bash
# Via Supabase CLI
supabase secrets set DAILY_API_KEY=your_daily_api_key
supabase secrets set DAILY_DOMAIN=didinow.daily.co
```

Or use the Lovable secrets UI to add:
- `DAILY_API_KEY`: Your Daily.co API key
- `DAILY_DOMAIN`: Your Daily.co domain

### 3. Run Database Migration

The migration creates the `rtc_calls` table with RLS policies and helper functions.

### 4. Deploy Edge Functions

Edge functions will be deployed automatically. Verify they're deployed:
- `create-rtc-call`
- `accept-rtc-call`
- `end-rtc-call`

## API Usage

### Initiating a Call (Caller)

```typescript
// User or Worker initiates call
const { data, error } = await supabase.functions.invoke('create-rtc-call', {
  body: { booking_id: 'uuid-here' }
});

// Response:
// {
//   success: true,
//   rtc_call_id: 'uuid',
//   room_id: 'booking-xxx-123456',
//   caller_token: 'token-here',
//   room_url: 'https://didinow.daily.co/booking-xxx-123456'
// }
```

### Accepting a Call (Callee)

```typescript
// Callee accepts the call
const { data, error } = await supabase.functions.invoke('accept-rtc-call', {
  body: { rtc_call_id: 'uuid-here' }
});

// Response:
// {
//   success: true,
//   room_id: 'booking-xxx-123456',
//   callee_token: 'token-here',
//   room_url: 'https://didinow.daily.co/booking-xxx-123456'
// }
```

### Ending a Call

```typescript
// Either party can end the call
const { data, error } = await supabase.functions.invoke('end-rtc-call', {
  body: { rtc_call_id: 'uuid-here' }
});

// Response:
// {
//   success: true,
//   duration_sec: 125
// }
```

## Testing with cURL

### Test create-rtc-call

```bash
curl -X POST \
  https://paywwbuqycovjopryele.supabase.co/functions/v1/create-rtc-call \
  -H "Authorization: Bearer YOUR_USER_JWT" \
  -H "Content-Type: application/json" \
  -d '{"booking_id": "your-booking-uuid"}'
```

### Test accept-rtc-call

```bash
curl -X POST \
  https://paywwbuqycovjopryele.supabase.co/functions/v1/accept-rtc-call \
  -H "Authorization: Bearer YOUR_USER_JWT" \
  -H "Content-Type: application/json" \
  -d '{"rtc_call_id": "your-rtc-call-uuid"}'
```

### Test end-rtc-call

```bash
curl -X POST \
  https://paywwbuqycovjopryele.supabase.co/functions/v1/end-rtc-call \
  -H "Authorization: Bearer YOUR_USER_JWT" \
  -H "Content-Type: application/json" \
  -d '{"rtc_call_id": "your-rtc-call-uuid"}'
```

## Frontend Integration

### Install Daily.co SDK

```bash
npm install @daily-co/daily-js
```

### Basic Call Flow

```typescript
import DailyIframe from '@daily-co/daily-js';

// 1. Initiate call
const { data: callData } = await supabase.functions.invoke('create-rtc-call', {
  body: { booking_id }
});

// 2. Join the call with token
const callFrame = DailyIframe.createFrame({
  showLeaveButton: true,
  iframeStyle: {
    position: 'fixed',
    width: '100%',
    height: '100%',
  },
});

await callFrame.join({
  url: callData.room_url,
  token: callData.caller_token,
});

// 3. Listen for call events
callFrame.on('left-meeting', async () => {
  await supabase.functions.invoke('end-rtc-call', {
    body: { rtc_call_id: callData.rtc_call_id }
  });
});
```

## Push Notifications

When a call is initiated, the system should send a push notification to the callee:

```json
{
  "notification": {
    "title": "Incoming Call",
    "body": "You have an incoming call for booking #123"
  },
  "data": {
    "type": "incoming_rtc",
    "rtc_call_id": "uuid-here",
    "booking_id": "uuid-here"
  }
}
```

## Security Features

1. **Short-lived tokens**: Tokens expire in 5 minutes
2. **RLS policies**: Users can only access calls they're part of
3. **Participant verification**: Only booking participants can create calls
4. **Room expiry**: Daily rooms expire in 10 minutes if unused

## Call History

Query call history for a booking:

```typescript
const { data: calls } = await supabase
  .from('rtc_calls')
  .select('*')
  .eq('booking_id', booking_id)
  .order('created_at', { ascending: false });
```

## Future Enhancements

- Add call recording (Daily.co supports this)
- Implement call quality metrics
- Add fallback to Exotel for PSTN calling
- Add video calling support
- Implement call transfer functionality

## Troubleshooting

### Call not connecting
- Verify `DAILY_API_KEY` and `DAILY_DOMAIN` are set correctly
- Check browser console for WebRTC errors
- Ensure microphone permissions are granted

### Token expired
- Tokens expire after 5 minutes
- Generate a new token by calling the appropriate edge function again

### No push notification
- Verify FCM token is stored for the worker
- Check edge function logs for push notification errors

## Support

For issues or questions:
1. Check Supabase edge function logs
2. Check Daily.co dashboard for room status
3. Review browser console for WebRTC errors
