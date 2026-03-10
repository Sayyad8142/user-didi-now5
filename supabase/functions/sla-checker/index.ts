import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    console.log('SLA Checker: Starting overdue booking check...')

    // 1. Handle overdue bookings (existing SLA logic)
    const { data, error } = await supabase.rpc('auto_handle_overdue_bookings')

    if (error) {
      console.error('SLA Checker Error:', error)
    }

    const processedCount = (data as number) ?? 0
    console.log(`SLA Checker: Processed ${processedCount} overdue bookings`)

    // 2. Auto-cancel stale instant bookings (pending > 60 min)
    const { data: staleCancelled, error: staleError } = await supabase.rpc('auto_cancel_stale_instant_bookings')

    if (staleError) {
      console.error('Stale instant cancel error:', staleError)
    }

    const staleCancelledCount = (staleCancelled as number) ?? 0
    if (staleCancelledCount > 0) {
      console.log(`SLA Checker: Auto-cancelled ${staleCancelledCount} stale instant bookings`)
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        processed_count: processedCount,
        timestamp: new Date().toISOString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('SLA Checker Exception:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})