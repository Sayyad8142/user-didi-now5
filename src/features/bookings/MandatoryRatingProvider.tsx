import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { Star, X, Calendar, Clock, IndianRupee, Sparkles, ShowerHead, MapPin } from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { WorkerAvatar } from '@/components/WorkerAvatar';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/contexts/ProfileContext';
import { fetchMyBookings } from './bookingsReadClient';
import { prettyServiceName } from '@/features/booking/utils';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

interface PendingRatingBooking {
  id: string;
  worker_id?: string | null;
  worker_name?: string | null;
  worker_photo_url?: string | null;
  service_type: string;
  scheduled_date?: string | null;
  scheduled_time?: string | null;
  created_at?: string;
}

interface MandatoryRatingContextType {
  refresh: () => Promise<void>;
}

const Ctx = createContext<MandatoryRatingContextType>({ refresh: async () => {} });
export const useMandatoryRating = () => useContext(Ctx);

// Session-only dismissed booking IDs (cleared on app restart)
const sessionDismissed = new Set<string>();

export function MandatoryRatingProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useProfile();
  const qc = useQueryClient();
  const [queue, setQueue] = useState<PendingRatingBooking[]>([]);
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const lastFetchRef = useRef(0);

  const current = queue[0];

  const refresh = useCallback(async (force = false) => {
    if (!profile?.id) return;
    // TTL guard — only refetch every 60s unless forced
    const REFRESH_TTL = 60_000;
    if (!force && Date.now() - lastFetchRef.current < REFRESH_TTL) return;
    lastFetchRef.current = Date.now();

    try {
      // Reuse the bookings React Query cache shared with BookingsScreen
      // (queryKey: ['bookings', profile.id]) to avoid a duplicate
      // bookings-read call on app open.
      let all: any[] | undefined = qc.getQueryData(['bookings', profile.id]);
      if (!all) {
        all = await fetchMyBookings(50);
        qc.setQueryData(['bookings', profile.id], all);
      }
      const completed = (all || []).filter((b: any) => b.status === 'completed');
      if (completed.length === 0) {
        setQueue([]);
        return;
      }

      // Only ask ratings for bookings completed in the last 7 days,
      // and require an explicit completed_at timestamp (avoid stale
      // bookings whose updated_at/created_at happens to be recent).
      const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
      const now = Date.now();

      const candidates = completed.filter((b: any) => {
        if (!b.worker_id) return false;
        if (sessionDismissed.has(b.id)) return false;
        if (!b.completed_at) return false;
        const completedTs = new Date(b.completed_at).getTime();
        if (!Number.isFinite(completedTs)) return false;
        return now - completedTs <= SEVEN_DAYS_MS;
      });

      if (candidates.length === 0) {
        setQueue([]);
        return;
      }

      const ids = candidates.map((b: any) => b.id);
      const { data: rated } = await supabase
        .from('worker_ratings')
        .select('booking_id')
        .in('booking_id', ids);
      const ratedIds = new Set((rated || []).map((r: any) => r.booking_id));

      // Only prompt for the SINGLE most recent unrated booking,
      // not a queue of historical ones.
      const unrated = candidates
        .filter((b: any) => !ratedIds.has(b.id))
        .sort((a: any, b: any) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime())
        .slice(0, 1);

      setQueue(unrated as PendingRatingBooking[]);
    } catch (err) {
      console.warn('[MandatoryRating] refresh failed', err);
    }
  }, [profile?.id, qc]);

  // Initial check — defer until after first paint so it doesn't block Home
  useEffect(() => {
    if (!profile?.id) return;
    const t = setTimeout(() => { void refresh(true); }, 1500);
    return () => clearTimeout(t);
  }, [profile?.id, refresh]);

  // On app resume / visibility — TTL-guarded (handled inside refresh)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void refresh(false);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [refresh]);

  // Open whenever queue has items
  useEffect(() => {
    if (current) {
      setOpen(true);
      setRating(0);
      setComment('');
    } else {
      setOpen(false);
    }
  }, [current?.id]);

  const handleSubmit = async () => {
    if (!current || !rating || !profile?.id) return;
    setSubmitting(true);
    try {
      const { getAuth } = await import('firebase/auth');
      const token = await getAuth().currentUser?.getIdToken();
      if (!token) throw new Error('Not authenticated');

      const { data, error } = await supabase.functions.invoke('submit-worker-rating', {
        body: {
          booking_id: current.id,
          rating,
          comment: comment.trim() || null,
        },
        headers: { 'x-firebase-token': token },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success('Thanks for rating!');
      setQueue((q) => q.slice(1));
    } catch (err: any) {
      console.error('[MandatoryRating] submit failed', err);
      toast.error(err?.message || 'Could not submit rating');
    } finally {
      setSubmitting(false);
    }
  };

  const handleMinimize = () => {
    if (current) sessionDismissed.add(current.id);
    setQueue((q) => q.slice(1));
  };

  return (
    <Ctx.Provider value={{ refresh }}>
      {children}
      <Sheet
        open={open}
        onOpenChange={(o) => {
          // Block dismissal via overlay/escape — only minimize button works
          if (!o) return;
          setOpen(o);
        }}
      >
        <SheetContent
          side="bottom"
          className="rounded-t-3xl p-0 max-h-[92vh] overflow-y-auto [&>button.absolute]:hidden"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          {current && (
            <div className="p-6 space-y-5">
              {/* Minimize (session only) */}
              <button
                onClick={handleMinimize}
                aria-label="Minimize"
                className="absolute right-4 top-4 text-muted-foreground hover:text-foreground p-1 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="text-center pt-2">
                <div className="flex justify-center mb-3">
                  <WorkerAvatar
                    photoUrl={current.worker_photo_url}
                    name={current.worker_name}
                    size="lg"
                    className="w-20 h-20 border-2 border-primary/20"
                  />
                </div>
                <h2 className="text-xl font-bold text-foreground">
                  Rate {current.worker_name || 'your worker'}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Service completed: {prettyServiceName(current.service_type)}
                </p>
                <p className="text-xs text-muted-foreground mt-2 italic">
                  Your rating helps us send the best workers to your community.
                </p>
              </div>

              <div className="flex items-center justify-center gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(n)}
                    className="p-1 transition-transform active:scale-90"
                    aria-label={`${n} stars`}
                  >
                    <Star
                      className={`w-10 h-10 ${
                        n <= rating ? 'text-yellow-500' : 'text-gray-300'
                      }`}
                      fill={n <= rating ? 'currentColor' : 'none'}
                    />
                  </button>
                ))}
              </div>

              <Textarea
                placeholder="Share your experience (optional)"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                className="text-sm"
              />

              <Button
                onClick={handleSubmit}
                disabled={!rating || submitting}
                className="w-full bg-pink-600 hover:bg-pink-700 text-white h-12 text-base font-semibold"
              >
                {submitting ? 'Submitting...' : 'Submit Rating'}
              </Button>

              <p className="text-[11px] text-center text-muted-foreground">
                You can minimize this for now, but we'll ask again until you rate.
              </p>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </Ctx.Provider>
  );
}
