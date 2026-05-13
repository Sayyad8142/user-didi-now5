import React, { useCallback, useEffect, useState } from 'react';
import { Star, Check, Heart } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/contexts/ProfileContext';
import { fetchMyBookings } from '@/features/bookings/bookingsReadClient';
import { LOVABLE_CLOUD_FUNCTIONS_URL, PRODUCTION_ANON_KEY } from '@/lib/constants';
import { resolveBackendUrl } from '@/lib/backendResolver';
import { getFirebaseIdToken } from '@/lib/firebase';
import { toast } from 'sonner';

interface RatableBooking {
  id: string;
  status: string;
  worker_id: string | null;
  worker_name?: string | null;
  created_at: string;
}

const RATABLE_STATUSES = ['assigned', 'accepted', 'on_the_way', 'started', 'completed'];

/**
 * HomeRatingCard
 * Compact, premium rating prompt rendered directly under HomeOtpCard so users
 * notice it without scrolling. Hidden when no eligible booking exists or when
 * the user has already rated.
 */
export function HomeRatingCard() {
  const { profile } = useProfile();
  const [booking, setBooking] = useState<RatableBooking | null>(null);
  const [existingRating, setExistingRating] = useState<number | null>(null);
  const [hover, setHover] = useState(0);
  const [selected, setSelected] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [hidden, setHidden] = useState(false);

  const loadBooking = useCallback(async () => {
    if (!profile?.id) {
      setBooking(null);
      return;
    }
    try {
      const all = (await fetchMyBookings(50)) as RatableBooking[];
      const match = all
        .filter((b) => RATABLE_STATUSES.includes(b.status) && !!b.worker_id)
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
      setBooking(match ?? null);
    } catch (err) {
      console.warn('[HomeRatingCard] fetch error:', err);
    }
  }, [profile?.id]);

  useEffect(() => {
    loadBooking();
  }, [loadBooking]);

  // Check existing rating
  useEffect(() => {
    if (!booking?.id) {
      setExistingRating(null);
      return;
    }
    supabase
      .from('worker_ratings')
      .select('rating')
      .eq('booking_id', booking.id)
      .maybeSingle()
      .then(({ data }) => {
        setExistingRating(data?.rating ?? null);
      });
  }, [booking?.id]);

  const handleSubmit = async (rating: number) => {
    if (!booking || submitting) return;
    setSelected(rating);
    setSubmitting(true);
    try {
      const token = await getFirebaseIdToken();
      if (!token) throw new Error('Not authenticated');
      const backendUrl = await resolveBackendUrl().catch(() => null);
      const candidates = [
        `${LOVABLE_CLOUD_FUNCTIONS_URL}/functions/v1/submit-worker-rating`,
        ...(backendUrl ? [`${backendUrl}/functions/v1/submit-worker-rating`] : []),
      ].filter((u, i, a) => a.indexOf(u) === i);

      let lastErr: any = null;
      let ok = false;
      for (const url of candidates) {
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: PRODUCTION_ANON_KEY,
              Authorization: `Bearer ${PRODUCTION_ANON_KEY}`,
              'x-firebase-token': token,
            },
            body: JSON.stringify({ booking_id: booking.id, rating, comment: null }),
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok || json?.error) {
            lastErr = new Error(json?.error || `HTTP ${res.status}`);
            if (res.status !== 404) throw lastErr;
            continue;
          }
          ok = true;
          break;
        } catch (e) {
          lastErr = e;
        }
      }
      if (!ok) throw lastErr || new Error('Could not submit rating');

      setExistingRating(rating);
      setJustSubmitted(true);
      setTimeout(() => setHidden(true), 2800);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to submit rating');
      setSelected(0);
    } finally {
      setSubmitting(false);
    }
  };

  if (!booking || hidden) return null;

  const display = hover || selected || existingRating || 0;
  const isReadOnly = !!existingRating && !justSubmitted;

  return (
    <section
      aria-label="Rate your worker"
      className="my-2 px-4 py-3 rounded-2xl bg-gradient-to-br from-pink-50 via-white to-pink-50 ring-1 ring-pink-200/70 shadow-[0_4px_16px_-6px_rgba(236,72,153,0.25)] animate-fade-in"
    >
      {justSubmitted ? (
        <div className="flex items-center justify-center gap-2 py-2 animate-scale-in">
          <div className="w-7 h-7 rounded-full bg-pink-500 flex items-center justify-center">
            <Check className="w-4 h-4 text-white" strokeWidth={3} />
          </div>
          <p className="text-sm font-semibold text-pink-700">
            Thank you for your feedback
          </p>
          <Heart className="w-4 h-4 text-pink-500" fill="currentColor" />
        </div>
      ) : (
        <>
          <div className="flex items-baseline justify-between mb-2">
            <div>
              <p className="text-[13px] font-bold text-foreground leading-tight">
                How was your service experience?
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Rate your worker{booking.worker_name ? ` · ${booking.worker_name}` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-1 mt-1">
            {[1, 2, 3, 4, 5].map((n) => {
              const filled = n <= display;
              return (
                <button
                  key={n}
                  type="button"
                  disabled={isReadOnly || submitting}
                  onMouseEnter={() => !isReadOnly && setHover(n)}
                  onMouseLeave={() => !isReadOnly && setHover(0)}
                  onClick={() => !isReadOnly && handleSubmit(n)}
                  className={`flex-1 flex items-center justify-center p-1.5 rounded-lg transition-all duration-200 ${
                    !isReadOnly && !submitting
                      ? 'active:scale-90 hover:scale-110'
                      : ''
                  } ${filled ? 'drop-shadow-[0_2px_4px_rgba(245,158,11,0.4)]' : ''}`}
                  aria-label={`Rate ${n} star${n > 1 ? 's' : ''}`}
                >
                  <Star
                    className={`w-7 h-7 transition-colors duration-200 ${
                      filled ? 'text-amber-400' : 'text-pink-200'
                    }`}
                    fill={filled ? 'currentColor' : 'none'}
                    strokeWidth={2}
                  />
                </button>
              );
            })}
          </div>

          <p className="text-center text-[10px] text-muted-foreground mt-1.5 font-medium">
            {isReadOnly
              ? `You rated ${existingRating}/5`
              : submitting
                ? 'Submitting…'
                : selected
                  ? `${selected} star${selected > 1 ? 's' : ''} selected`
                  : 'Tap to rate'}
          </p>
        </>
      )}
    </section>
  );
}

export default HomeRatingCard;
