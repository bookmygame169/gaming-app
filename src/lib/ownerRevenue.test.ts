import { describe, expect, it } from "vitest";
import {
  getBookingGamingTotal,
  getBookingRevenueTotal,
  getBookingSnackTotal,
  getOwnerPaymentBucket,
  isBillableRevenueBooking,
  toOwnerAmount,
} from "./ownerRevenue";

/**
 * What the reports say the cafe earned.
 *
 * These are the numbers the owner reconciles the till against, so a change
 * here that nobody notices is a change to what the business believes it made.
 */

describe("toOwnerAmount", () => {
  // PostgREST sends `numeric` columns as strings. Every total in this app is
  // numeric, so a helper that forgot this would concatenate instead of add and
  // turn 150 + 200 into "150200".
  it("reads the strings PostgREST actually sends for numeric columns", () => {
    expect(toOwnerAmount("150.50")).toBe(150.5);
    expect(toOwnerAmount("0")).toBe(0);
  });

  it("adds rather than concatenates when totals arrive as strings", () => {
    expect(toOwnerAmount("150") + toOwnerAmount("200")).toBe(350);
  });

  it("treats anything unusable as nothing rather than NaN", () => {
    // A NaN loose in a total silently poisons every sum it reaches.
    expect(toOwnerAmount(null)).toBe(0);
    expect(toOwnerAmount(undefined)).toBe(0);
    expect(toOwnerAmount("")).toBe(0);
    expect(toOwnerAmount("abc")).toBe(0);
    expect(toOwnerAmount(Number.NaN)).toBe(0);
    expect(toOwnerAmount(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("getBookingRevenueTotal", () => {
  it("counts a gaming session plus the snacks bought during it", () => {
    expect(
      getBookingRevenueTotal({
        booking_items: [{ price: 200 }, { price: 100 }],
        booking_orders: [{ total_price: 60 }],
      })
    ).toBe(360);
  });

  it("counts an over-the-counter snack sale, which has no session on it", () => {
    // A snack sale is stored as a booking with no booking_items. Reading it
    // through the session path would report the cafe earned nothing.
    expect(
      getBookingRevenueTotal({
        booking_items: [],
        booking_orders: [{ total_price: 40 }, { total_price: 35 }],
      })
    ).toBe(75);
  });

  it("falls back to the booking's own total when there is nothing itemised", () => {
    expect(getBookingRevenueTotal({ total_amount: "250" })).toBe(250);
  });

  it("does not count the snacks twice when the session items carry no price", () => {
    // Older bookings stored the whole bill on total_amount and left the item
    // prices at zero. The snack total has to come back out of it, or the same
    // 200 rupees is reported as both a snack and part of the session.
    const booking = {
      booking_items: [{ price: 0 }],
      booking_orders: [{ total_price: 200 }],
      total_amount: 500,
    };
    expect(getBookingGamingTotal(booking)).toBe(300);
    expect(getBookingRevenueTotal(booking)).toBe(500);
  });

  it("keeps the session total when it is somehow below the snack total", () => {
    // Subtracting here would report negative gaming revenue.
    const booking = {
      booking_items: [{ price: 0 }],
      booking_orders: [{ total_price: 400 }],
      total_amount: 100,
    };
    expect(getBookingGamingTotal(booking)).toBe(100);
  });

  it("adds up snacks that arrive as strings", () => {
    expect(
      getBookingSnackTotal({ booking_orders: [{ total_price: "40" }, { total_price: "35.5" }] })
    ).toBe(75.5);
  });
});

describe("isBillableRevenueBooking", () => {
  it("counts an ordinary completed booking", () => {
    expect(isBillableRevenueBooking({ status: "completed", payment_mode: "cash" })).toBe(true);
  });

  it.each([
    ["deleted", { deleted_at: "2026-09-01T10:00:00Z" }],
    ["cancelled", { status: "cancelled" }],
    ["still unpaid", { status: "pending" }],
    ["the owner's own machine time", { payment_mode: "owner" }],
  ])("leaves out a booking that is %s", (_label, booking) => {
    expect(isBillableRevenueBooking(booking)).toBe(false);
  });

  it("recognises those regardless of casing or stray spacing", () => {
    // Status and payment mode are free text in the database.
    expect(isBillableRevenueBooking({ status: "  CANCELLED " })).toBe(false);
    expect(isBillableRevenueBooking({ payment_mode: " Owner " })).toBe(false);
  });
});

describe("getOwnerPaymentBucket", () => {
  it("splits the day's takings into the two the owner counts", () => {
    expect(getOwnerPaymentBucket("upi")).toBe("upi");
    expect(getOwnerPaymentBucket("gpay")).toBe("upi");
    expect(getOwnerPaymentBucket("card")).toBe("upi");
    expect(getOwnerPaymentBucket("cash")).toBe("cash");
  });

  it("counts an unrecorded payment as cash, which is what is in the drawer", () => {
    expect(getOwnerPaymentBucket(null)).toBe("cash");
    expect(getOwnerPaymentBucket("")).toBe("cash");
    expect(getOwnerPaymentBucket("something new")).toBe("cash");
  });

  it("is not fooled by casing or spacing", () => {
    expect(getOwnerPaymentBucket(" UPI ")).toBe("upi");
  });
});
