import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { getAuth } from 'firebase/auth';
import { toast } from 'sonner';
import { useProfile } from '@/contexts/ProfileContext';

/**
 * Reusable "Did the worker reach your location?" card.
 *
 * Used on:
 *  - Home active booking card
 *  - Bookings list card
 *  - Booking detail screen
 *
 * Visibility rules:
 *  - Booking status must be active (assigned/dispatched/on_the_way/accepted/started)
 *  - Worker must be assigned (worker_id present)
 *  - Booking not yet reach-confirmed (reach_status is null/'pending')
 *  - 15 min must have elapsed since reference time
 *      • Instant   → created_at
 *      • Scheduled → scheduled_date+scheduled_time
 *
 * On confirm:
 *  - Calls confirm-worker-reach edge fn (which also writes worker_reach_events).
 *  - Falls back to direct DB update if edge fn unreachable (preserves UX).
 *  - Optimistic UI; rollback on failure.
 */

export interface ReachBookingShape {
  id: string;
  status: string;
  booking_type?: string | null;
  created_at: string;
  scheduled_date?: string | null;
  scheduled_time?: string | null;
  worker_id?: string | null;
  reach_status?: string | null;
  reach_confirmed_at?: string | null;
}

const ACTIVE_STATUSES = ['assigned', 'dispatched', 'on_the_way', 'accepted', 'started'] as const;
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

export function isReachEligible(booking: ReachBookingShape): boolean {
  if (!booking) return false;
  if (!ACTIVE_STATUSES.includes(booking.status as any)) return false;
  if (!booking.worker_id) return false;
  if (booking.reach_status && booking.reach_status !== 'pending') return false;

  let referenceTime: number;
  if (booking.booking_type === 'scheduled' && booking.scheduled_date) {
    const timeStr = booking.scheduled_time ? booking.scheduled_time.slice(0, 5) : '00:00';
    const sched = new Date(`${booking.scheduled_date}T${timeStr}:00`);
    referenceTime = isNaN(sched.getTime()) ? new Date(booking.created_at).getTime() : sched.getTime();
  } else {
    referenceTime = new Date(booking.created_at).getTime();
  }
  return Date.now() >= referenceTime + FIFTEEN_MINUTES_MS;
}

interface Props {
  booking: ReachBookingShape;
  /** Called after a successful confirmation with the new status. */
  onConfirmed?: (newStatus: 'reached' | 'not_reached') => void;
  /** When true, also renders the post-confirmation banner (reached / not_reached). Default true. */
  showConfirmedBanner?: boolean;
  className?: string;
}

export function WorkerReachConfirmationCard({
  booking,
  onConfirmed,
  showConfirmedBanner = true,
  className,
}: Props) {
  const { profile } = useProfile();
  const [updating, setUpdating] = useState(false);
  const [eligibleNow, setEligibleNow] = useState(() => isReachEligible(booking));
  const [localStatus, setLocalStatus] = useState<string | null | undefined>(booking.reach_status);

  // Re-sync from props when realtime updates the parent
  useEffect(() => {
    setLocalStatus(booking.reach_status);
  }, [booking.reach_status]);

  // Re-evaluate every 30s so the card appears at the 15-min mark without a refresh
  useEffect(() => {
    const tick = () => setEligibleNow(isReachEligible({ ...booking, reach_status: localStatus }));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [booking, localStatus]);

  const handleConfirm = useCallback(
    async (reached: boolean) => {
      if (updating) return;
      if (localStatus && localStatus !== 'pending') return;

      setUpdating(true);
      const newStatus: 'reached' | 'not_reached' = reached ? 'reached' : 'not_reached';
      const previous = localStatus;

      // Optimistic
      setLocalStatus(newStatus);
      setEligibleNow(false);

      try {
        // PRIMARY: edge function (also writes worker_reach_events + admin alerts)
        let edgeOk = false;
        try {
          const auth = getAuth();
          const token = await auth.currentUser?.getIdToken();
          const { data, error } = await supabase.functions.invoke('confirm-worker-reach', {
            body: { booking_id: booking.id, reached },
            headers: token ? { 'x-firebase-token': token } : undefined,
          });
          if (!error && !data?.error) edgeOk = true;
          else console.warn('[ReachStatus] Edge fn unavailable, falling back:', error || data?.error);
        } catch (edgeErr) {
          console.warn('[ReachStatus] Edge fn call failed, falling back:', edgeErr);
        }

        // FALLBACK: direct DB update (keeps booking row consistent even if edge fn down)
        if (!edgeOk) {
          const { error: dbErr } = await supabase
            .from('bookings')
            .update({
              reach_status: newStatus,
              reach_confirmed_at: new Date().toISOString(),
              reach_confirmed_by: 'user',
            })
            .eq('id', booking.id)
            .eq('user_id', profile?.id ?? '');
          if (dbErr) throw dbErr;
        }

        if (reached) toast.success('Thanks for confirming. Worker has reached.');
        else toast.info('Thanks. Our team will take action immediately.');
        onConfirmed?.(newStatus);
      } catch (err) {
        console.error('[ReachStatus] All paths failed:', err);
        // Roll back
        setLocalStatus(previous);
        setEligibleNow(true);
        toast.error('Could not update status. Please try again.');
      } finally {
        setUpdating(false);
      }
    },
    [booking.id, localStatus, profile?.id, updating, onConfirmed]
  );

  // Confirmed banners
  if (showConfirmedBanner && localStatus === 'reached') {
    return (
      <div className={`p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-2 ${className ?? ''}`}>
        <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
        <p className="text-sm font-medium text-emerald-800">You confirmed worker reached</p>
      </div>
    );
  }
  if (showConfirmedBanner && localStatus === 'not_reached') {
    return (
      <div className={`p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-2 ${className ?? ''}`}>
        <XCircle className="h-4 w-4 text-rose-600 shrink-0" />
        <p className="text-sm font-medium text-rose-800">You marked worker as not reached</p>
      </div>
    );
  }

  if (!eligibleNow) return null;

  return (
    <div className={`p-4 bg-amber-50 border border-amber-200 rounded-2xl ${className ?? ''}`}>
      <p className="text-sm font-medium text-amber-900 mb-3">Did the worker reach your location?</p>
      <div className="flex gap-2">
        <Button
          onClick={() => handleConfirm(true)}
          disabled={updating}
          className="flex-1 h-10 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl"
        >
          {updating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
          Reached
        </Button>
        <Button
          onClick={() => handleConfirm(false)}
          disabled={updating}
          variant="destructive"
          className="flex-1 h-10 font-semibold rounded-xl"
        >
          {updating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <XCircle className="h-4 w-4 mr-2" />}
          Not Reached
        </Button>
      </div>
    </div>
  );
}

export default WorkerReachConfirmationCard;
