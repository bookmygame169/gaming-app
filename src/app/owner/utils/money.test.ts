import { describe, expect, it } from "vitest";
import { distributeWholeRupees, toWholeRupees } from "./dashboardHelpers";

/**
 * Splitting one bill across the lines that make it up.
 *
 * The console lets an owner set the amount a customer actually pays - a
 * discount, a rounded-down total - and that figure then has to be spread back
 * over the session items so the individual lines still add up to it. Every
 * rupee is a real rupee, so the property that matters is not what any one line
 * gets: it is that the lines add up to exactly what was charged. A split that
 * loses one rupee under-reports takings; one that gains a rupee means the
 * report and the till disagree, and the till is right.
 */

describe("toWholeRupees", () => {
  it("rounds to the nearest rupee", () => {
    expect(toWholeRupees(199.4)).toBe(199);
    expect(toWholeRupees(199.5)).toBe(200);
  });

  it("never returns a negative charge", () => {
    expect(toWholeRupees(-50)).toBe(0);
  });

  it("treats an unusable number as zero rather than passing NaN on", () => {
    expect(toWholeRupees(Number.NaN)).toBe(0);
    expect(toWholeRupees(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("distributeWholeRupees", () => {
  it("splits in proportion to what each line was worth", () => {
    const out = distributeWholeRupees([{ price: 200 }, { price: 100 }], 300);
    expect(out.map((i) => i.price)).toEqual([200, 100]);
  });

  it("gives the odd rupee to the line with the largest fraction owed", () => {
    // 299 across 200:100 is 199.33 and 99.67. The second line is owed more of
    // a rupee than the first, so it is the one rounded up.
    const out = distributeWholeRupees([{ price: 200 }, { price: 100 }], 299);
    expect(out.map((i) => i.price)).toEqual([199, 100]);
  });

  it("splits evenly when no line has a price to weight by", () => {
    const out = distributeWholeRupees([{ price: 0 }, { price: 0 }, { price: 0 }], 100);
    expect(out.map((i) => i.price)).toEqual([34, 33, 33]);
  });

  it("ignores a negative price rather than letting it eat another line's share", () => {
    const out = distributeWholeRupees([{ price: -50 }, { price: 100 }], 100);
    expect(out.map((i) => i.price)).toEqual([0, 100]);
  });

  it("zeroes every line when the bill is written down to nothing", () => {
    const out = distributeWholeRupees([{ price: 200 }, { price: 100 }], 0);
    expect(out.map((i) => i.price)).toEqual([0, 0]);
  });

  it("leaves an empty bill alone", () => {
    expect(distributeWholeRupees([], 100)).toEqual([]);
  });

  it("does not mutate the items it was handed", () => {
    // These are React state objects; writing through them skips a re-render
    // and leaves the screen showing the old prices.
    const items = [{ price: 200 }, { price: 100 }];
    distributeWholeRupees(items, 250);
    expect(items).toEqual([{ price: 200 }, { price: 100 }]);
  });

  it("keeps any other fields on the line", () => {
    const out = distributeWholeRupees(
      [{ price: 200, console: "ps5", duration: 60 }],
      150
    );
    expect(out[0]).toEqual({ price: 150, console: "ps5", duration: 60 });
  });

  // The invariant the money depends on, checked over the whole awkward middle
  // rather than the handful of cases anybody thought to write down.
  it("always adds back up to exactly what was charged", () => {
    const prices = [0, 1, 33, 50, 99, 100, 150, 200, 349];
    const totals = [0, 1, 7, 99, 100, 101, 250, 299, 300, 1000, 1001];

    for (const total of totals) {
      for (let count = 1; count <= 5; count++) {
        for (let offset = 0; offset < prices.length; offset++) {
          const items = Array.from({ length: count }, (_, i) => ({
            price: prices[(offset + i) % prices.length],
          }));

          const out = distributeWholeRupees(items, total);
          const sum = out.reduce((acc, i) => acc + (i.price ?? 0), 0);

          expect(sum, `${count} lines summing to ${total}`).toBe(toWholeRupees(total));
          expect(
            out.every((i) => (i.price ?? 0) >= 0),
            `${count} lines summing to ${total} produced a negative line`
          ).toBe(true);
        }
      }
    }
  });

  it("still balances when the amount charged is not a whole rupee", () => {
    const out = distributeWholeRupees([{ price: 200 }, { price: 100 }], 299.6);
    const sum = out.reduce((acc, i) => acc + (i.price ?? 0), 0);
    expect(sum).toBe(300);
  });
});
