import { supabase } from '@/integrations/supabase/client';

// Columns that may not exist in older production `bookings` table schemas.
// If insert fails because of a missing column in the schema cache, we strip
// the offending key and retry. This mirrors the compatibility fallback used
// by the create-paid-booking edge function.
const OPTIONAL_BOOKING_COLUMNS = [
  'building_id',
  'community_id',
  'flat_id',
  'preferred_worker_id',
  'dish_intensity',
  'dish_intensity_extra_inr',
  'has_glass_partition',
  'glass_partition_fee',
  'surcharge_amount',
  'surcharge_reason',
];

const MISSING_COLUMN_REGEX =
  /Could not find the '([^']+)' column|column "([^"]+)" of relation "bookings" does not exist/i;

function extractMissingColumn(message: string): string | null {
  const m = message.match(MISSING_COLUMN_REGEX);
  return m ? (m[1] || m[2] || null) : null;
}

/**
 * Insert a booking row with automatic stripping of optional columns that
 * the production schema may not yet have. Retries up to N times.
 */
export async function insertBookingWithCompat(payload: Record<string, any>) {
  let current = { ...payload };
  const stripped: string[] = [];

  for (let attempt = 0; attempt < 6; attempt++) {
    const { data, error } = await supabase
      .from('bookings')
      .insert([current])
      .select();

    if (!error) {
      if (stripped.length) {
        console.warn('[insertBookingCompat] Inserted after stripping columns:', stripped);
      }
      return { data, error: null as any };
    }

    const missing = extractMissingColumn(error.message || '');
    if (missing && OPTIONAL_BOOKING_COLUMNS.includes(missing) && missing in current) {
      console.warn(`[insertBookingCompat] Stripping unsupported column "${missing}" and retrying`);
      stripped.push(missing);
      const { [missing]: _omit, ...rest } = current;
      current = rest;
      continue;
    }

    return { data: null, error };
  }

  return {
    data: null,
    error: { message: 'Exceeded compatibility retry attempts' } as any,
  };
}
