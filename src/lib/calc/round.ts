/**
 * Excel's ROUNDUP, "away from zero", with an epsilon to absorb float dust from
 * divisions that should land on an exact integer (e.g. 480/24 === 20, not
 * 20.000000000000004 rounding up to 21). Single source of truth — every
 * rounding in this engine must go through this function.
 */
const EPS = 1e-9;

export function ceil(x: number): number {
  // `|| 0` normalizes -0 (e.g. Math.ceil(0 - EPS) === -0) to +0 so downstream
  // equality checks (toEqual, JSON serialization) don't see a spurious diff.
  return Math.ceil(x - EPS) || 0;
}
