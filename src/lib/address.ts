/**
 * Address label helpers (Phase 2A — Villa community support).
 *
 * Apartment communities keep their existing rendering (plain flat number).
 * Villa communities render the villa label, preferring flats.display_name.
 */

export type CommunityType = 'apartment' | 'villa';

/** Normalise any raw community_type value; unknown/missing => apartment. */
export function normalizeCommunityType(raw?: string | null): CommunityType {
  return String(raw ?? '').trim().toLowerCase() === 'villa' ? 'villa' : 'apartment';
}

export function isVillaCommunity(raw?: string | null): boolean {
  return normalizeCommunityType(raw) === 'villa';
}

/** Label for a single unit row in pickers / lists. */
export function unitLabel(
  communityType: string | null | undefined,
  flatNo: string | null | undefined,
  displayName?: string | null,
): string {
  const no = String(flatNo ?? '').trim();
  if (!isVillaCommunity(communityType)) return no;
  const dn = String(displayName ?? '').trim();
  if (dn) return dn;
  return no ? `Villa ${no}` : '';
}

/** Label used wherever the saved home/address is displayed. */
export function savedUnitLabel(
  communityType: string | null | undefined,
  flatNo: string | null | undefined,
  displayName?: string | null,
): string {
  return unitLabel(communityType, flatNo, displayName);
}
