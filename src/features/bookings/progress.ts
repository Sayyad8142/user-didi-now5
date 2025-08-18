export type BookingLike = {
  id: string;
  status: string;
  booking_type: string;
  created_at: string;
  scheduled_date?: string | null;
  scheduled_time?: string | null;
};

const MS_PER_MIN = 60_000;

export function prettyTime(ms: number) {
  const m = Math.max(0, Math.round(ms / MS_PER_MIN));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}h ${mm}m`;
}

/** Compute 0..1 progress + labels */
export function computeProgress(b: BookingLike) {
  const now = Date.now();

  if (b.booking_type === 'instant') {
    const start = new Date(b.created_at).getTime();
    const SLA_MIN = 10;
    const elapsed = now - start;
    const pct = Math.min(1, elapsed / (SLA_MIN * MS_PER_MIN));
    const overdue = elapsed > SLA_MIN * MS_PER_MIN;
    const label = overdue ? 'Overdue' : `Arriving in ~${prettyTime(SLA_MIN * MS_PER_MIN - elapsed)}`;
    return { pct, overdue, label, etaText: 'We\'re assigning a worker...' };
  }

  // scheduled
  const dateStr = b.scheduled_date || '';
  const timeStr = b.scheduled_time ? b.scheduled_time.slice(0, 5) : '00:00'; // HH:MM
  const local = new Date(`${dateStr}T${timeStr}:00`);
  const target = local.getTime();
  const windowMin = 30; // visual countdown window
  const from = target - windowMin * MS_PER_MIN;
  const pct = Math.max(0, Math.min(1, (now - from) / (windowMin * MS_PER_MIN)));
  const overdue = now > target;
  const label = overdue ? 'Starts now' : `Starts in ${prettyTime(target - now)}`;
  return { pct, overdue, label, etaText: 'Scheduled booking' };
}