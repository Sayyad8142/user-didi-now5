import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  EXTERNAL_SUPABASE_URL,
  EXTERNAL_SUPABASE_SERVICE_ROLE_KEY,
} from '../_shared/externalSupabaseEnv.ts'
import { refundBookingToWallet } from '../_shared/refundAmount.ts'

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

    // 2. Auto-cancel stale instant bookings (pending > 90 min)
    const { data: staleCancelled, error: staleError } = await supabase.rpc('auto_cancel_stale_instant_bookings')

    if (staleError) {
      console.error('Stale instant cancel error:', staleError)
    }

    const staleCancelledCount = (staleCancelled as number) ?? 0
    if (staleCancelledCount > 0) {
      console.log(`SLA Checker: Auto-cancelled ${staleCancelledCount} stale instant bookings`)
    }

    // 3. Reconcile refunds for recently cancelled paid bookings.
    // DB-side auto-cancel refunds can be based on stale/base pricing; the
    // authoritative amount is what the customer actually paid. This tops up
    // any shortfall idempotently.
    let reconciled = 0
    try {
      if (EXTERNAL_SUPABASE_URL && EXTERNAL_SUPABASE_SERVICE_ROLE_KEY) {
        const admin = createClient(EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_SERVICE_ROLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        const { data: cancelled } = await admin
          .from('bookings')
          .select('id, user_id')
          .eq('status', 'cancelled')
          .in('payment_status', ['paid', 'moved_to_wallet'])
          .gte('cancelled_at', since)
          .limit(200)

        for (const b of cancelled || []) {
          if (!b?.user_id) continue
          const res = await refundBookingToWallet(admin, b.id as string, b.user_id as string, 'auto_cancelled')
          if ((res as any)?.refunded) reconciled++
        }
      }
    } catch (e) {
      console.error('Refund reconciliation failed:', (e as Error).message)
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        processed_count: processedCount,
        stale_cancelled_count: staleCancelledCount,
        refunds_reconciled: reconciled,
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