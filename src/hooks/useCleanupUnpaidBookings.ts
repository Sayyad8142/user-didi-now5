import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/contexts/ProfileContext';

/**
 * On mount, auto-cancels the current user's orphan Pay Now bookings
 * (payment_status = 'pending', payment_method IS NULL, older than 10 minutes).
 * Runs silently — no toast or UI disruption.
 */
export function useCleanupUnpaidBookings() {
  const { profile } = useProfile();

  useEffect(() => {
    if (!profile?.id) return;

    const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    supabase
      .from('bookings')
      .update({
        status: 'cancelled',
        cancellation_reason: 'payment_not_completed_timeout',
        cancelled_at: new Date().toISOString(),
        cancelled_by: 'user',
        cancel_source: 'user',
        cancel_reason: 'Payment not completed',
      })
      .eq('user_id', profile.id)
      .eq('payment_status', 'pending')
      .is('payment_method', null)
      .eq('status', 'pending')
      .lt('created_at', cutoff)
      .then(({ error }) => {
        if (error) {
          console.warn('⚠️ useCleanupUnpaidBookings error:', error.message);
        }
      });
  }, [profile?.id]);
}
