import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Clock, Wallet, RefreshCw, AlertCircle } from 'lucide-react';

/**
 * Shared UI block for two related "no-worker" states:
 *   1. Pending (Finding worker) — shows live countdown until auto-cancel.
 *   2. Cancelled by system due to no worker available — shows refund info + Book Again.
 *
 * Backend untouched: we derive `dispatch_expires_at` from `created_at + 60 minutes`
 * (matching the existing auto_cancel_stale_instant_bookings function), since the
 * column does not exist on the bookings table.
 */

const AUTO_CANCEL_MINUTES = 60;

type Booking = {
  id: string;
  status: string;
  booking_type?: string | null;
  worker_id?: string | null;
  created_at: string;
  service_type?: string | null;
  cancel_source?: string | null;
  cancel_reason?: string | null;
  cancellation_reason?: string | null;
  payment_status?: string | null;
  dispatch_expires_at?: string | null;
};

function formatRemaining(ms: number): string {
  if (ms <= 0) return '0m';
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m <= 0) return `${s}s`;
  if (m < 60) return `${m}m ${s.toString().padStart(2, '0')}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${(m % 60)}m`;
}

function getDispatchExpiresAt(booking: Booking): Date | null {
  // Prefer explicit column if backend ever adds it
  if (booking.dispatch_expires_at) {
    const d = new Date(booking.dispatch_expires_at);
    if (!isNaN(d.getTime())) return d;
  }
  // Only auto-cancel applies to instant pending bookings
  if (booking.booking_type !== 'instant') return null;
  const created = new Date(booking.created_at);
  if (isNaN(created.getTime())) return null;
  return new Date(created.getTime() + AUTO_CANCEL_MINUTES * 60_000);
}

/** Heuristic: detect "no worker available" cancellation from existing schema. */
export function isNoWorkerCancellation(b: Booking): boolean {
  if (b.status !== 'cancelled') return false;
  if (b.cancel_source !== 'system') return false;
  const reason = `${b.cancel_reason ?? ''} ${b.cancellation_reason ?? ''}`.toLowerCase();
  return (
    reason.includes('no_worker') ||
    reason.includes('no worker') ||
    reason.includes('auto-cancel') ||
    reason.includes('auto cancel')
  );
}

/** Should the countdown UI render for this booking? */
export function shouldShowDispatchCountdown(b: Booking): boolean {
  if (b.status !== 'pending') return false;
  if (b.worker_id) return false;
  return !!getDispatchExpiresAt(b);
}

export function FindingWorkerCountdown({ booking }: { booking: Booking }) {
  const expiresAt = getDispatchExpiresAt(booking);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!expiresAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [expiresAt?.getTime()]);

  if (!expiresAt) return null;
  const remaining = expiresAt.getTime() - now;
  const expired = remaining <= 0;

  return (
    <div className="mt-3 ml-1 mr-1 p-3 rounded-2xl bg-amber-50 ring-1 ring-amber-200">
      <div className="flex items-start gap-2.5">
        <div className="p-1.5 rounded-lg bg-amber-100 text-amber-700 shrink-0">
          <Clock className="w-3.5 h-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-amber-900 leading-tight">
            Finding worker
          </p>
          <p className="mt-0.5 text-[12px] text-amber-800/90 leading-snug">
            We are trying to assign a worker for your booking.
          </p>
          <p className="mt-1.5 text-[12px] font-semibold tabular-nums text-amber-900">
            {expired ? 'Auto-cancellation in progress…' : `Auto-cancels in ${formatRemaining(remaining)}`}
          </p>
        </div>
      </div>
    </div>
  );
}

export function NoWorkerCancelledBlock({ booking }: { booking: Booking }) {
  const navigate = useNavigate();
  const refunded = booking.payment_status === 'refunded_to_wallet';

  const handleBookAgain = () => {
    const svc = booking.service_type || 'maid';
    // Navigate to a fresh booking flow. Profile already supplies community/flat/flat_size.
    // We do NOT reuse the old booking ID — a fresh booking is created on confirm.
    navigate(`/book/${svc}`);
  };

  return (
    <div className="mt-3 ml-1 mr-1 p-3.5 rounded-2xl bg-rose-50 ring-1 ring-rose-200">
      <div className="flex items-start gap-2.5">
        <div className="p-1.5 rounded-lg bg-rose-100 text-rose-700 shrink-0">
          <AlertCircle className="w-3.5 h-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-rose-900 leading-tight">
            No worker available
          </p>
          <p className="mt-0.5 text-[12px] text-rose-800/90 leading-snug">
            Sorry, we couldn't assign a worker. Your amount has been refunded to your Didi Now wallet.
          </p>
          {refunded && (
            <Badge className="mt-2 bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-0 gap-1 font-semibold">
              <Wallet className="w-3 h-3" /> Refunded to wallet
            </Badge>
          )}
        </div>
      </div>
      <Button
        onClick={handleBookAgain}
        className="mt-3 w-full h-11 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
      >
        <RefreshCw className="w-4 h-4 mr-1.5" />
        Book Again
      </Button>
    </div>
  );
}
