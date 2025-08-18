import { useEffect, useState } from 'react';
import { computeProgress, type BookingLike } from './progress';

export default function AssigningProgress({ booking }: { booking: BookingLike }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 5000); // refresh every 5s
    return () => clearInterval(id);
  }, []);
  const { pct, overdue, label, etaText } = computeProgress(booking);
  const width = `${Math.round(pct * 100)}%`;

  return (
    <div className="mt-3">
      <div className="flex items-center gap-2 text-sm">
        <span className="inline-flex h-2 w-2 rounded-full bg-pink-500 animate-pulse" />
        <span className="font-medium">{etaText}</span>
        <span className={`ml-auto text-xs ${overdue ? 'text-rose-600' : 'text-gray-500'}`}>{label}</span>
      </div>
      <div className="mt-2 h-2 w-full rounded-full bg-gray-100 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct * 100)}>
        <div className={`h-full transition-all duration-500 ${overdue ? 'bg-rose-500' : 'bg-pink-500'}`} style={{ width }} />
      </div>
      {overdue && (
        <div className="mt-1 text-[11px] font-semibold text-rose-600 uppercase tracking-wide">Overdue</div>
      )}
    </div>
  );
}