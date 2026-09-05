import { describe, expect, it } from "vitest";
import { summariseLoyaltyLedger, summariseWalletLedger } from "./ledgerTotals";

/**
 * Neither ledger has ever had a row in production, so nothing here has been
 * checked against real data. These tests are the whole of the verification,
 * which is why they lean on the cases that would be wrong in a way nobody
 * would notice: money counted twice, a customer split across two rows because
 * their number was typed differently, a window that quietly includes everything.
 */

const NOW = new Date("2026-09-04T12:00:00Z");
const daysAgo = (n: number) =>
  new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

describe("summariseWalletLedger", () => {
  it("counts money in and money out separately", () => {
    // Netting these would report the same figure for a customer who topped up
    // 2,000 and spent 1,800 as for one who topped up 200 and spent nothing.
    const totals = summariseWalletLedger([
      { customer_phone: "9876543210", amount: 2000, created_at: daysAgo(3) },
      { customer_phone: "9876543210", amount: -1800, created_at: daysAgo(1) },
    ]);
    const entry = totals.get("9876543210")!;
    expect(entry.toppedUp).toBe(2000);
    expect(entry.spent).toBe(1800);
  });

  it("reports spending as a positive number", () => {
    // It is rendered straight onto the screen; a negative here shows as "-₹500
    // spent", which reads as a refund.
    const totals = summariseWalletLedger([
      { customer_phone: "9876543210", amount: -500, created_at: daysAgo(1) },
    ]);
    expect(totals.get("9876543210")!.spent).toBe(500);
  });

  it("keeps the most recent movement, whatever order the rows arrive in", () => {
    const totals = summariseWalletLedger([
      { customer_phone: "9876543210", amount: 100, created_at: daysAgo(1) },
      { customer_phone: "9876543210", amount: 100, created_at: daysAgo(9) },
    ]);
    expect(totals.get("9876543210")!.lastAt).toBe(daysAgo(1));
  });

  it("treats one customer as one customer however their number was typed", () => {
    // The app stores numbers with and without the country code in different
    // places. Without normalising, a regular appears twice with half their
    // money each.
    const totals = summariseWalletLedger([
      { customer_phone: "9876543210", amount: 500, created_at: daysAgo(2) },
      { customer_phone: "+91 98765 43210", amount: 300, created_at: daysAgo(1) },
    ]);
    expect(totals.size).toBe(1);
    expect([...totals.values()][0].toppedUp).toBe(800);
  });

  it("skips rows with no usable number rather than inventing a holder", () => {
    const totals = summariseWalletLedger([
      { customer_phone: null, amount: 500, created_at: daysAgo(1) },
      { customer_phone: "", amount: 500, created_at: daysAgo(1) },
    ]);
    expect(totals.size).toBe(0);
  });

  it("adds up amounts that arrive as strings", () => {
    const totals = summariseWalletLedger([
      { customer_phone: "9876543210", amount: "500", created_at: daysAgo(2) },
      { customer_phone: "9876543210", amount: "250", created_at: daysAgo(1) },
    ]);
    expect(totals.get("9876543210")!.toppedUp).toBe(750);
  });

  it("is empty for an empty ledger, which is what production has today", () => {
    expect(summariseWalletLedger([]).size).toBe(0);
  });
});

describe("summariseLoyaltyLedger", () => {
  it("nets the balance but keeps earned and redeemed apart", () => {
    const totals = summariseLoyaltyLedger(
      [
        { customer_phone: "9876543210", points: 120, created_at: daysAgo(40) },
        { customer_phone: "9876543210", points: -50, created_at: daysAgo(2) },
      ],
      NOW
    );
    const entry = totals.get("9876543210")!;
    expect(entry.balance).toBe(70);
    expect(entry.earned).toBe(120);
    expect(entry.redeemed).toBe(50);
  });

  it("counts only the last 30 days as earned in the window", () => {
    const totals = summariseLoyaltyLedger(
      [
        { customer_phone: "9876543210", points: 100, created_at: daysAgo(45) },
        { customer_phone: "9876543210", points: 30, created_at: daysAgo(29) },
        { customer_phone: "9876543210", points: 10, created_at: daysAgo(1) },
      ],
      NOW
    );
    const entry = totals.get("9876543210")!;
    expect(entry.earned30d).toBe(40);
    expect(entry.earned).toBe(140);
  });

  it("does not let a redemption reduce what was earned in the window", () => {
    // A regular who collects and then spends their points is the café's best
    // customer. Subtracting the redemption would show them as inactive.
    const totals = summariseLoyaltyLedger(
      [
        { customer_phone: "9876543210", points: 60, created_at: daysAgo(5) },
        { customer_phone: "9876543210", points: -60, created_at: daysAgo(1) },
      ],
      NOW
    );
    const entry = totals.get("9876543210")!;
    expect(entry.earned30d).toBe(60);
    expect(entry.balance).toBe(0);
  });

  it("is zero in the window for somebody who has not played in months", () => {
    const totals = summariseLoyaltyLedger(
      [{ customer_phone: "9876543210", points: 500, created_at: daysAgo(200) }],
      NOW
    );
    expect(totals.get("9876543210")!.earned30d).toBe(0);
    expect(totals.get("9876543210")!.balance).toBe(500);
  });

  it("keeps each member's totals to themselves", () => {
    const totals = summariseLoyaltyLedger(
      [
        { customer_phone: "9876543210", points: 100, created_at: daysAgo(1) },
        { customer_phone: "9000000001", points: 40, created_at: daysAgo(1) },
      ],
      NOW
    );
    expect(totals.get("9876543210")!.balance).toBe(100);
    expect(totals.get("9000000001")!.balance).toBe(40);
  });

  it("merges the same member written two ways", () => {
    const totals = summariseLoyaltyLedger(
      [
        { customer_phone: "9876543210", points: 100, created_at: daysAgo(2) },
        { customer_phone: "+919876543210", points: 25, created_at: daysAgo(1) },
      ],
      NOW
    );
    expect(totals.size).toBe(1);
    expect([...totals.values()][0].balance).toBe(125);
  });
});
