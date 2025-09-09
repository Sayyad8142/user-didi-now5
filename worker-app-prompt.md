# Worker App for Home Services - Lovable Project Prompt

## Project Overview
Build a React Native-style worker mobile app that integrates with an existing home services user app. This worker app allows service providers (maids, cooks, bathroom cleaners) to receive, manage, and complete bookings in real-time.

## Key Features Required

### 1. Real-time Booking Management
- **Overlay Notifications**: Display booking notifications as overlay popups even when app is in background
- **Background Processing**: App continues to listen for new bookings when minimized
- **FCM Integration**: Firebase Cloud Messaging for push notifications
- **Auto-refresh**: Real-time updates without manual refresh

### 2. Core Worker Features
- **Login/Authentication**: Phone + OTP authentication for workers
- **Booking Queue**: List of assigned bookings with status tracking
- **Booking Details**: View customer info, service type, location, timing
- **Status Updates**: Mark bookings as "started", "in-progress", "completed"
- **Earnings Tracker**: Display daily/weekly earnings
- **Availability Toggle**: Online/offline status management

### 3. Technical Requirements
- **Capacitor Mobile App**: PWA that works as native mobile app
- **Overlay System**: Floating notifications that appear over other apps
- **Background Tasks**: Service worker for background processing
- **Push Notifications**: FCM integration for instant booking alerts
- **Offline Support**: Basic functionality when internet is poor

## Integration with Existing User App

### Supabase Backend Connection
Connect to existing Supabase project:
- **Project ID**: `paywwbuqycovjopryele`
- **URL**: `https://paywwbuqycovjopryele.supabase.co`
- **Anon Key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBheXd3YnVxeWNvdmpvcHJ5ZWxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxNjkyNjksImV4cCI6MjA3MDc0NTI2OX0.js1MaTBkjuGlaDfQjrZpZ9_G8Jy9ygNAB8KpNDiQg8o`

### Database Tables to Use
1. **workers**: Worker profiles, availability, service types
2. **bookings**: Customer bookings with status tracking
3. **assignments**: Worker-booking assignments
4. **booking_status_history**: Status change tracking

### Key Database Functions
- `assign_worker_to_booking()`: Assign worker to booking
- `worker_set_booking_status()`: Update booking status
- `update_worker_availability()`: Toggle online/offline
- Use real-time subscriptions for live booking updates

## Detailed Feature Requirements

### 1. Overlay Notification System
```javascript
// When new booking arrives, show overlay
- Floating card with booking details
- Accept/Decline buttons
- Auto-dismiss after 30 seconds
- Sound/vibration alerts
- Works even when app is backgrounded
```

### 2. Background Service Worker
```javascript
// Continuous listening for:
- New booking assignments
- Booking cancellations
- Customer messages
- Admin updates
- Auto-sync when connection restored
```

### 3. Main App Screens
- **Dashboard**: Today's bookings, earnings, status toggle
- **Booking List**: Pending, active, completed bookings
- **Booking Details**: Customer info, location, service details
- **Profile**: Worker info, service types, ratings
- **Earnings**: Daily/weekly/monthly earnings tracker

### 4. Real-time Features
```javascript
// Supabase real-time subscriptions:
- Listen to bookings table for new assignments
- Listen to booking status changes
- Listen to worker availability updates
- Auto-refresh booking list every 30 seconds
```

## Technical Implementation

### 1. Authentication Flow
```javascript
// Worker login process:
1. Phone number input
2. OTP verification
3. Check if worker exists in workers table
4. Store auth session
5. Enable FCM token registration
```

### 2. Booking Workflow
```javascript
// Complete booking flow:
1. Worker receives push notification
2. Overlay shows booking details
3. Worker accepts/declines
4. If accepted: booking status = "assigned"
5. Worker updates status: "started" → "in-progress" → "completed"
6. Earnings automatically calculated
```

### 3. FCM Setup
- Firebase project integration
- Token registration and storage
- Background message handling
- Notification permission requests
- Custom notification sounds

### 4. Capacitor Configuration
```javascript
// Required Capacitor plugins:
- @capacitor/push-notifications
- @capacitor/background-task
- @capacitor/local-notifications
- @capacitor/haptics
- @capacitor/status-bar
```

## UI/UX Requirements

### Design System
- **Colors**: Professional blue/green theme
- **Typography**: Clear, readable fonts for mobile
- **Buttons**: Large, touch-friendly buttons
- **Cards**: Clean booking cards with clear status indicators
- **Icons**: Intuitive icons for different actions

### Mobile-First Design
- **Bottom Navigation**: Easy thumb navigation
- **Swipe Actions**: Swipe to accept/complete bookings
- **Pull to Refresh**: Standard mobile gesture
- **Haptic Feedback**: Vibration for important actions

## Sample Booking Flow

### 1. New Booking Notification
```
📱 OVERLAY POPUP:
"New Booking Available!"
🏠 Maid Service - 2BHK
📍 Community: Prestige Lakeside
⏰ Time: Today 2:00 PM
💰 Amount: ₹800
[ACCEPT] [DECLINE]
```

### 2. Accepted Booking Card
```
📋 BOOKING #12345
👤 Customer: Priya Sharma
📞 Phone: +91 9876543210
🏠 Service: Maid (2BHK)
📍 Address: A-101, Prestige Lakeside
⏰ Scheduled: Today 2:00 PM
💰 Earning: ₹800
Status: [START WORK] button
```

### 3. Status Updates
```javascript
// Status progression:
"pending" → "assigned" → "started" → "in-progress" → "completed"

// Worker actions:
- Tap "Start Work" when arriving
- Tap "Mark Complete" when finished
- Auto-calculate earnings
```

## Error Handling & Edge Cases
- **No Internet**: Queue updates for when connection returns
- **App Crash**: Persist important data in local storage
- **Permission Denied**: Graceful fallbacks for notifications
- **Battery Optimization**: Instructions to disable battery optimization

## Performance Requirements
- **App Launch**: Under 3 seconds
- **Overlay Response**: Under 1 second
- **Background Sync**: Every 30 seconds
- **Battery Efficient**: Minimal battery drain in background

## Testing Scenarios
1. **New Booking Flow**: From notification to acceptance
2. **Background Processing**: App works when minimized
3. **Offline Mode**: Basic functionality without internet
4. **Multiple Bookings**: Handle multiple simultaneous bookings
5. **Error Recovery**: App recovers from network issues

## Deployment & Distribution
- **Web App**: PWA installable from browser
- **Mobile**: Generate APK/IPA for app stores
- **Updates**: Auto-update capability
- **Analytics**: Track app usage and performance

## Integration Testing
Test the complete flow:
1. Customer books service in user app
2. Admin assigns worker in admin panel
3. Worker receives notification in worker app
4. Worker completes booking
5. Customer sees completion in user app

## Additional Features (Phase 2)
- **Customer Chat**: Direct messaging with customers
- **Photo Upload**: Before/after photos of work
- **Earnings Dashboard**: Detailed analytics
- **Multiple Languages**: Hindi/English support
- **Worker Referrals**: Invite other workers

---

**Build this as a modern, efficient worker app that seamlessly integrates with the existing user app, focusing on real-time performance, overlay notifications, and smooth mobile experience.**