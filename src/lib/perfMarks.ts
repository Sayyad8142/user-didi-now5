/**
 * Lightweight startup performance instrumentation.
 * Records named milestones with a t=0 anchor at module load (= main.tsx import).
 * Logs each mark immediately and prints a sorted summary on demand.
 *
 * Usage:  import { mark, summary } from '@/lib/perfMarks'; mark('firebase.init');
 * Inspect at any time from the console:  __perf()
 */

const T0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
const marks: Array<{ name: string; t: number; dt: number }> = [];

export function mark(name: string) {
  const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const t = +(now - T0).toFixed(1);
  const last = marks.length ? marks[marks.length - 1].t : 0;
  const dt = +(t - last).toFixed(1);
  marks.push({ name, t, dt });
  // Single-line, easy to grep
  // eslint-disable-next-line no-console
  console.log(`⏱️  [perf] +${dt.toString().padStart(6)}ms  t=${t.toString().padStart(6)}ms  ${name}`);
}

export function summary() {
  // eslint-disable-next-line no-console
  console.table(marks);
  return marks.slice();
}

if (typeof window !== 'undefined') {
  (window as any).__perf = summary;
  (window as any).__perfMark = mark;
}

mark('perfMarks.module');
