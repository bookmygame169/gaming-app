import { describe, expect, it } from "vitest";
import {
  MAX_DESCRIPTION,
  toDateString,
  toDescription,
  toPositiveAmount,
} from "./expenseInput";

describe("toPositiveAmount", () => {
  it("takes a normal rupee figure", () => {
    expect(toPositiveAmount(2450)).toBe(2450);
    expect(toPositiveAmount("1999.5")).toBe(1999.5);
  });

  it("rounds to paise rather than storing a float", () => {
    expect(toPositiveAmount(10.005)).toBe(10.01);
    expect(toPositiveAmount(0.1 + 0.2)).toBe(0.3);
  });

  it("refuses zero, because that is an abandoned row and not a cheap one", () => {
    expect(toPositiveAmount(0)).toBeNull();
    expect(toPositiveAmount("0")).toBeNull();
  });

  it("refuses negatives, which would read as income once summed", () => {
    expect(toPositiveAmount(-500)).toBeNull();
  });

  it("refuses anything that is not a number", () => {
    expect(toPositiveAmount("")).toBeNull();
    expect(toPositiveAmount("abc")).toBeNull();
    expect(toPositiveAmount(null)).toBeNull();
    expect(toPositiveAmount(undefined)).toBeNull();
    expect(toPositiveAmount(NaN)).toBeNull();
    expect(toPositiveAmount(Infinity)).toBeNull();
  });
});

describe("toDateString", () => {
  it("takes a real calendar date", () => {
    expect(toDateString("2026-09-01")).toBe("2026-09-01");
    expect(toDateString("2024-02-29")).toBe("2024-02-29");
  });

  it("refuses a day that does not exist, which Date would roll forward", () => {
    expect(toDateString("2026-02-31")).toBeNull();
    expect(toDateString("2026-13-01")).toBeNull();
    expect(toDateString("2025-02-29")).toBeNull();
  });

  it("refuses anything that is not a plain date string", () => {
    expect(toDateString("01-09-2026")).toBeNull();
    expect(toDateString("2026-9-1")).toBeNull();
    expect(toDateString("2026-09-01T10:00:00Z")).toBeNull();
    expect(toDateString(20260901)).toBeNull();
    expect(toDateString(null)).toBeNull();
  });
});

describe("toDescription", () => {
  it("trims what was typed", () => {
    expect(toDescription("  August electricity  ")).toBe("August electricity");
  });

  it("treats blank and whitespace as nothing written", () => {
    expect(toDescription("")).toBeNull();
    expect(toDescription("   ")).toBeNull();
    expect(toDescription(null)).toBeNull();
    expect(toDescription(undefined)).toBeNull();
  });

  it("caps a paste rather than letting it fill the column", () => {
    const long = "x".repeat(MAX_DESCRIPTION + 50);
    expect(toDescription(long)).toHaveLength(MAX_DESCRIPTION);
  });
});
