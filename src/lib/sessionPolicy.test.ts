import { describe, expect, it } from "vitest";
import { decideStationSession, sessionDurationMinutes } from "@/lib/sessionPolicy";

describe("decideStationSession", () => {
  const start = new Date("2026-08-26T12:30:00.000Z");

  it("unlocks during a session", () => {
    const decision = decideStationSession({
      sessionId: "b1",
      status: "confirmed",
      durationMinutes: 60,
      startsAt: start,
      now: new Date(start.getTime() + 5 * 60_000),
    });

    expect(decision.action).toBe("unlock");
    if (decision.action === "unlock") {
      expect(decision.remainingSeconds).toBe(55 * 60);
    }
  });

  it("keeps the longer of stale ends_at and item duration", () => {
    const decision = decideStationSession({
      sessionId: "b1",
      status: "in-progress",
      durationMinutes: 180,
      startsAt: start,
      endsAt: new Date(start.getTime() + 60 * 60_000),
      now: new Date(start.getTime() + 90 * 60_000),
    });

    expect(decision.action).toBe("unlock");
  });

  it("locks when both the stored end and the item duration have passed", () => {
    const decision = decideStationSession({
      sessionId: "b1",
      status: "confirmed",
      durationMinutes: 60,
      startsAt: start,
      endsAt: new Date(start.getTime() + 60 * 60_000),
      now: new Date(start.getTime() + 61 * 60_000),
    });

    expect(decision).toMatchObject({ action: "lock", reason: "ended" });
  });

  it("does not unlock before start", () => {
    const decision = decideStationSession({
      sessionId: "b1",
      status: "confirmed",
      durationMinutes: 60,
      startsAt: start,
      now: new Date(start.getTime() - 1_000),
    });

    expect(decision).toMatchObject({ action: "lock", reason: "not_started" });
  });
});

describe("sessionDurationMinutes", () => {
  it("uses the longest positive part and falls back to 60", () => {
    expect(sessionDurationMinutes([0, null, 180, 60])).toBe(180);
    expect(sessionDurationMinutes([0, null])).toBe(60);
  });
});
