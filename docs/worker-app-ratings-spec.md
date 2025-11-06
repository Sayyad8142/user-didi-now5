# Worker App - Ratings Display Specification

## Overview
Workers need to view their ratings to understand their performance, as top-rated workers receive booking priority in the assignment system.

## Backend Data Structure

### Database Table: `worker_ratings`
Location: Supabase database
```sql
CREATE TABLE worker_ratings (
  id UUID PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES bookings(id),
  worker_id UUID NOT NULL REFERENCES workers(id),
  user_id UUID NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**RLS Policies:**
- Workers can view their own ratings: `worker_id = auth.uid()`
- Users can view/insert ratings for their bookings
- Admins have full access

### Worker Statistics
Calculate from `worker_ratings` table:
- **Average Rating**: `AVG(rating)` for worker_id
- **Total Ratings**: `COUNT(*)` for worker_id
- **Rating Distribution**: Count of 1-5 star ratings
- **Recent Ratings**: Last 10-20 ratings with comments

## Worker App Implementation

### 1. Rating Dashboard Screen
**Display Components:**
```
┌─────────────────────────────────┐
│     Your Rating Overview        │
├─────────────────────────────────┤
│  ⭐ 4.8 Average                 │
│  📊 127 Total Ratings           │
│                                 │
│  Rating Breakdown:              │
│  5★ ████████████████ 85        │
│  4★ ██████░░░░░░░░░░ 30        │
│  3★ ██░░░░░░░░░░░░░░ 8         │
│  2★ █░░░░░░░░░░░░░░░ 3         │
│  1★ ░░░░░░░░░░░░░░░░ 1         │
└─────────────────────────────────┘
```

### 2. Per-Booking Rating Display
Show rating immediately after booking completion:
```
┌─────────────────────────────────┐
│  Booking #ABC123 - Completed    │
├─────────────────────────────────┤
│  Customer Rating: ⭐⭐⭐⭐⭐      │
│  "Excellent service, very       │
│   professional and thorough!"   │
│                                 │
│  Received: 2 hours ago          │
└─────────────────────────────────┘
```

### 3. Booking Priority System
**How It Works:**
- Workers with **higher average ratings** receive booking offers **first**
- Booking assignment order determined by:
  1. Rating (DESC)
  2. Distance from booking location (ASC)
  3. Availability status
  4. Recent acceptance rate

**Example Query Logic:**
```sql
SELECT w.id, w.full_name, 
       COALESCE(AVG(wr.rating), 0) as avg_rating,
       COUNT(wr.id) as total_ratings
FROM workers w
LEFT JOIN worker_ratings wr ON w.id = wr.worker_id
WHERE w.is_active = true
  AND w.service_types @> ARRAY['requested_service']
  AND w.community = 'booking_community'
GROUP BY w.id, w.full_name
ORDER BY avg_rating DESC, total_ratings DESC
```

## API Endpoints Needed

### 1. Get Worker Statistics
```
GET /worker/ratings/stats
Headers: Authorization: Bearer {worker_jwt}

Response:
{
  "average_rating": 4.8,
  "total_ratings": 127,
  "rating_distribution": {
    "5": 85,
    "4": 30,
    "3": 8,
    "2": 3,
    "1": 1
  },
  "rank": "Top 5%",
  "total_workers": 450
}
```

### 2. Get Rating History
```
GET /worker/ratings/history?limit=20&offset=0
Headers: Authorization: Bearer {worker_jwt}

Response:
{
  "ratings": [
    {
      "id": "uuid",
      "booking_id": "uuid",
      "rating": 5,
      "comment": "Excellent service!",
      "created_at": "2025-01-15T10:30:00Z",
      "service_type": "maid"
    }
  ],
  "pagination": {
    "total": 127,
    "limit": 20,
    "offset": 0
  }
}
```

### 3. Get Booking Rating
```
GET /worker/bookings/{booking_id}/rating
Headers: Authorization: Bearer {worker_jwt}

Response:
{
  "rating": 5,
  "comment": "Very professional",
  "created_at": "2025-01-15T10:30:00Z",
  "received": true
}
```

## Supabase Client Implementation

### Fetch Worker Statistics
```typescript
// Worker App - Get my statistics
const { data: stats } = await supabase
  .rpc('get_worker_rating_stats', { 
    worker_id: auth.uid() 
  });
```

### Fetch Rating History
```typescript
// Worker App - Get my ratings
const { data: ratings } = await supabase
  .from('worker_ratings')
  .select(`
    id,
    rating,
    comment,
    created_at,
    booking_id,
    bookings!inner(service_type, community)
  `)
  .eq('worker_id', auth.uid())
  .order('created_at', { ascending: false })
  .limit(20);
```

### Real-time Rating Updates
```typescript
// Worker App - Listen for new ratings
const channel = supabase
  .channel('worker-ratings')
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'worker_ratings',
      filter: `worker_id=eq.${workerId}`
    },
    (payload) => {
      // Show notification: "You received a new rating!"
      showRatingNotification(payload.new);
    }
  )
  .subscribe();
```

## UI/UX Recommendations

### 1. Rating Notifications
- **Push notification** when customer submits rating
- **Badge** on ratings tab showing unviewed ratings
- **Celebratory animation** for 5-star ratings

### 2. Motivation Features
- Show **progress to next rank** (e.g., "8 more 5-star ratings to reach Gold tier")
- Display **comparison**: "You're in top 10% of workers in your area"
- **Streak tracker**: "15 consecutive 5-star ratings!"

### 3. Feedback Loop
- Highlight **positive comments** prominently
- For lower ratings, show **tips for improvement**
- Allow workers to **request clarification** on low ratings (admin-mediated)

## Database Functions to Create

### Function: `get_worker_rating_stats`
```sql
CREATE OR REPLACE FUNCTION get_worker_rating_stats(worker_id UUID)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'average_rating', COALESCE(ROUND(AVG(rating)::numeric, 2), 0),
    'total_ratings', COUNT(*),
    'rating_distribution', json_build_object(
      '5', COUNT(*) FILTER (WHERE rating = 5),
      '4', COUNT(*) FILTER (WHERE rating = 4),
      '3', COUNT(*) FILTER (WHERE rating = 3),
      '2', COUNT(*) FILTER (WHERE rating = 2),
      '1', COUNT(*) FILTER (WHERE rating = 1)
    ),
    'last_30_days_avg', COALESCE(
      ROUND(AVG(rating) FILTER (
        WHERE created_at > NOW() - INTERVAL '30 days'
      )::numeric, 2), 
      0
    )
  ) INTO result
  FROM worker_ratings
  WHERE worker_ratings.worker_id = get_worker_rating_stats.worker_id;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## Key Points for Worker App

1. **Data Source**: All ratings stored in `worker_ratings` table
2. **Access**: Workers can only see their own ratings via RLS
3. **Priority**: Higher avg_rating = first booking offers
4. **Motivation**: Show rankings, progress, and positive feedback
5. **Real-time**: Use Supabase realtime for instant rating notifications
6. **Privacy**: Comments are visible to workers to help improve service

## Example Worker App Flow

```
┌──────────────────────────────────────────┐
│ 1. Worker completes booking             │
│ 2. Customer rates worker (1-5 stars)    │
│ 3. Rating saved to worker_ratings table │
│ 4. Worker receives push notification    │
│ 5. Worker views rating in app           │
│ 6. Worker's avg_rating recalculated     │
│ 7. Higher rating = better booking queue │
└──────────────────────────────────────────┘
```

## Testing Checklist

- [ ] Worker can view their average rating
- [ ] Worker can see rating distribution chart
- [ ] Worker receives notification for new ratings
- [ ] Individual booking ratings display correctly
- [ ] Comments show properly (when provided)
- [ ] Real-time updates work without refresh
- [ ] RLS prevents viewing other workers' ratings
- [ ] Top-rated workers confirmed to get bookings first

## Summary

**Backend Location**: `worker_ratings` table in Supabase
**Key Fields**: `worker_id`, `rating` (1-5), `comment`, `booking_id`
**Purpose**: Performance tracking + booking priority assignment
**Worker Benefit**: Understand performance, earn more bookings through better ratings
