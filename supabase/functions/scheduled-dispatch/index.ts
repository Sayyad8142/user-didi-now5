import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  EXTERNAL_SUPABASE_URL,
  EXTERNAL_SUPABASE_SERVICE_ROLE_KEY,
} from "../_shared/externalSupabaseEnv.ts"

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
    // CRITICAL: run_scheduled_prealerts() is defined on the EXTERNAL
    // Supabase project alongside the bookings table. The Lovable-injected
    // SUPABASE_URL points at Lovable Cloud where this RPC does not exist,
    // so scheduled dispatch was silently no-oping in production.
    const supabase = createClient(
      EXTERNAL_SUPABASE_URL,
      EXTERNAL_SUPABASE_SERVICE_ROLE_KEY,
    )

    console.log('Scheduled Dispatch: Starting check for bookings due in 15 minutes...')

    // Call the database function to handle scheduled bookings
    const { data, error } = await supabase.rpc('run_scheduled_prealerts', { p_window_minutes: 15 })

    if (error) {
      console.error('Scheduled Dispatch Error:', error)
      return new Response(
        JSON.stringify({ error: error.message }), 
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log('Scheduled Dispatch: Successfully processed scheduled bookings')

    return new Response(
      JSON.stringify({ 
        success: true,
        timestamp: new Date().toISOString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Scheduled Dispatch Exception:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
