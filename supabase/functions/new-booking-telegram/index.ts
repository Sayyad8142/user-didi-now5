// ============================================================================
// Telegram Booking Notifications - INSTANT BOOKINGS ONLY
// ============================================================================
// This edge function sends Telegram notifications for NEW INSTANT bookings.
//
// IMPORTANT: 
// - Only processes booking_type = 'instant'
// - Scheduled bookings are IGNORED here
// - Scheduled bookings are notified via run_scheduled_prealerts() function
//   which runs 15 minutes before the scheduled time
//
// Triggered by: notify_telegram_new_booking() database trigger
// ============================================================================

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const TELEGRAM_CHAT_ID = Deno.env.get('TELEGRAM_CHAT_ID');
    const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SHARED_SECRET');

    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      console.error('Missing Telegram credentials');
      return new Response(
        JSON.stringify({ ok: false, error: 'Missing Telegram configuration' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate webhook secret if configured
    if (WEBHOOK_SECRET) {
      const providedSecret = req.headers.get('x-webhook-secret');
      if (providedSecret !== WEBHOOK_SECRET) {
        console.error('Invalid webhook secret');
        return new Response(
          JSON.stringify({ ok: false, error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const payload = await req.json();
    console.log('Received webhook payload:', JSON.stringify(payload, null, 2));

    // Validate event type and table
    if (payload.type !== 'INSERT' || payload.table !== 'bookings') {
      console.log('Ignoring non-INSERT event or non-bookings table');
      return new Response(
        JSON.stringify({ ok: true, message: 'Event ignored' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const record = payload.record;
    if (!record) {
      console.error('No record found in payload');
      return new Response(
        JSON.stringify({ ok: false, error: 'No record in payload' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // CRITICAL FIX: Only send notifications for INSTANT bookings
    // Scheduled bookings are handled by run_scheduled_prealerts() 15 minutes before scheduled time
    if (record.booking_type === 'scheduled') {
      console.log('Ignoring scheduled booking - will be notified 15 mins before scheduled time');
      return new Response(
        JSON.stringify({ ok: true, message: 'Scheduled booking ignored' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Format the Telegram message - PLAIN TEXT ONLY
    const serviceType = record.service_type || 'N/A';
    const bookingType = record.booking_type || 'N/A';
    const community = record.community || 'N/A';
    const flatNo = record.flat_no || 'N/A';
    const scheduledDate = record.scheduled_date || 'N/A';
    const scheduledTime = record.scheduled_time || 'N/A';
    const price = record.price_inr ? `₹${record.price_inr}` : 'N/A';
    const userName = record.cust_name || 'N/A';
    const userPhone = record.cust_phone || 'N/A';
    const bookingId = record.id || 'N/A';

    // Only INSTANT bookings should reach this point
    const message = `🆕 NEW INSTANT BOOKING ALERT
Service: ${serviceType}
Type: ${bookingType}
Community: ${community}
Flat: ${flatNo}
Price: ${price}
Customer: ${userName} (${userPhone})
Booking ID: ${bookingId}`;

    // Send message to Telegram
    const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    
    const telegramResponse = await fetch(telegramUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
      }),
    });

    const telegramData = await telegramResponse.json();

    if (!telegramResponse.ok) {
      console.error('Telegram API error:', telegramData);
      return new Response(
        JSON.stringify({ ok: false, error: 'Telegram failed', details: telegramData }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Telegram message sent successfully:', telegramData);

    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in new-booking-telegram function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
