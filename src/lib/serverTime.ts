/**
 * Server time synchronization for precise thresholds.
 * Calculates clock drift between local phone and backend.
 */

let driftMs = 0;
let isSynced = false;

/**
 * Sync with a server timestamp.
 * Call this whenever a response includes a server-provided timestamp (like created_at).
 */
export function syncServerTime(serverIso: string) {
  const serverTime = new Date(serverIso).getTime();
  const localTime = Date.now();
  driftMs = serverTime - localTime;
  isSynced = true;
  
  if (Math.abs(driftMs) > 1000) {
    console.log(`[ServerTime] Clock drift detected: ${driftMs}ms`);
  }
}

/**
 * Get current time as perceived by the server.
 */
export function getServerNow(): number {
  return Date.now() + driftMs;
}

/**
 * Is the clock drift calculated?
 */
export function isTimeSynced(): boolean {
  return isSynced;
}

/**
 * Calculate the age of an event in milliseconds relative to server time.
 */
export function getServerAge(eventIso: string): number {
  const eventTime = new Date(eventIso).getTime();
  return getServerNow() - eventTime;
}
