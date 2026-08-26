import { describe, expect, it } from "vitest";
import { allAssignedStationsUnlocked } from "@/lib/stationSchedule";

describe("allAssignedStationsUnlocked", () => {
  it("does not skip a booking when only one of two PCs is unlocked", () => {
    expect(
      allAssignedStationsUnlocked(
        ["pc-1", "pc-2"],
        [
          { station_name: "pc-1", session_id: "b1", status: "unlocked", cafe_id: "cafe" },
          { station_name: "pc-2", session_id: "b1", status: "locked", cafe_id: "cafe" },
        ],
        "b1",
        "cafe"
      )
    ).toBe(false);
  });

  it("skips only when every assigned PC is unlocked for this booking", () => {
    expect(
      allAssignedStationsUnlocked(
        ["pc-1", "pc-2"],
        [
          { station_name: "pc-1", session_id: "b1", status: "unlocked", cafe_id: "cafe" },
          { station_name: "pc-2", session_id: "b1", status: "unlocked", cafe_id: "cafe" },
        ],
        "b1",
        "cafe"
      )
    ).toBe(true);
  });

  it("does not skip when assigned stations are unknown", () => {
    expect(
      allAssignedStationsUnlocked(
        [],
        [{ station_name: "pc-1", session_id: "b1", status: "unlocked" }],
        "b1"
      )
    ).toBe(false);
  });
});
