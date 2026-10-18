import { describe, expect, test } from "bun:test";
import { computePayout, CommissionConfigError } from "../supabase/functions/_shared/commission";

describe("computePayout", () => {
  test.each([
    [100, 0, 100],
    [200, 0, 200],
    [100, 10, 90],
    [200, 15, 170],
    [100, 20, 80],
  ])("₹%p at %p%% pays worker ₹%p", (amount, pct, net) => {
    expect(computePayout(amount, pct).net).toBe(net);
  });

  test("0% means no platform fee", () => {
    expect(computePayout(349, 0).platform_fee).toBe(0);
  });

  test("fractional amounts round the fee to the paisa and keep gross = fee + net", () => {
    const r = computePayout(99.99, 15); // fee 14.9985 -> 15.00
    expect(r.platform_fee).toBe(15);
    expect(r.net).toBe(84.99);
    const s = computePayout(333, 12.5); // fee 41.625 -> 41.63
    expect(s.platform_fee).toBe(41.63);
    expect(s.net).toBe(291.37);
  });

  test("missing commission fails closed instead of using a default", () => {
    for (const v of [null, undefined, ""]) {
      expect(() => computePayout(100, v)).toThrow(CommissionConfigError);
    }
  });

  test("invalid commission is rejected", () => {
    for (const v of [-1, 100.01, NaN, "abc", Infinity]) {
      expect(() => computePayout(100, v)).toThrow(CommissionConfigError);
    }
  });

  test("100% is allowed and pays zero", () => {
    expect(computePayout(100, 100).net).toBe(0);
  });

  test("same inputs always give the same split (repeat requests cannot change a payout)", () => {
    expect(computePayout(250, 7)).toEqual(computePayout(250, 7));
  });
});
