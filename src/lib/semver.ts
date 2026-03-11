/**
 * Semantic version comparison utilities.
 * Handles versions like "1.0.0", "1.2.3", "2.0.0-beta".
 */

function parseSemver(version: string): number[] {
  return version
    .replace(/^v/i, '')
    .split('.')
    .map(p => parseInt(p, 10) || 0)
    .concat([0, 0, 0]) // pad to at least 3 parts
    .slice(0, 3);
}

/** Returns -1 if a < b, 0 if equal, 1 if a > b */
export function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] < pb[i]) return -1;
    if (pa[i] > pb[i]) return 1;
  }
  return 0;
}

/** a < b */
export function semverLt(a: string, b: string): boolean {
  return compareSemver(a, b) < 0;
}

/** a >= b */
export function semverGte(a: string, b: string): boolean {
  return compareSemver(a, b) >= 0;
}
