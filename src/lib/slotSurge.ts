/**
 * Shared slot-surge logic for both Instant and Scheduled bookings.
 * Mirrors src/lib/userSurge.ts server-side validation.
 */

import { SurgeMap } from "@/hooks/useSlotSurge";

export function getSlotSurge(surgeMap: SurgeMap, time: string): number {
  if (!time) return 0;
  // Normalize time to HH:MM:00 for map lookup
  const normalized = time.includes(':') && time.split(':').length === 2
    ? time + ':00'
    : time;
  return surgeMap[normalized] ?? 0;
}

export function formatSurgeLabel(amount: number): string {
  if (amount === 0) return "";
  if (amount > 0) return `+₹${amount}`;
  return `Save ₹${Math.abs(amount)}`;
}

export function getSurgeColor(amount: number): string {
  if (amount > 0) return "text-orange-600";
  if (amount < 0) return "text-emerald-600";
  return "text-muted-foreground";
}
