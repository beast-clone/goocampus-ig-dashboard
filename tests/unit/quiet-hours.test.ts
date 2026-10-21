import { describe, it, expect } from "vitest";
import { istHour, isQuietHours, QUIET_FROM_HOUR, QUIET_TO_HOUR } from "@/lib/quiet-hours";

// The stop zone is a business rule with a cost attached: 52 n8n workflows were
// windowed to 6-23 on the strength of it, and the browser side defers to this
// file. The boundaries are where it will go wrong, so they are what is tested.
//
// IST = UTC+5:30 with no DST, which is the only reason this arithmetic is safe.

const at = (iso: string) => new Date(iso);

describe("istHour", () => {
  it.each([
    ["2026-10-04T00:00:00Z", 5],  // 05:30 IST
    ["2026-10-04T04:30:00Z", 10], // 10:00 IST
    ["2026-10-04T18:30:00Z", 0],  // 00:00 IST next day — the rollover
    ["2026-10-04T18:29:00Z", 23], // 23:59 IST — one minute before it
  ])("%s -> %i IST", (iso, hour) => {
    expect(istHour(at(iso))).toBe(hour);
  });
});

describe("isQuietHours", () => {
  it("is quiet at exactly midnight IST", () => {
    expect(isQuietHours(at("2026-10-04T18:30:00Z"))).toBe(true);
  });

  it("is NOT quiet at exactly 06:00 IST — the window is half-open", () => {
    // 06:00 IST = 00:30 UTC. Getting this wrong by one hour either way is the
    // difference between the 6am catch-up running and not running.
    expect(isQuietHours(at("2026-10-05T00:30:00Z"))).toBe(false);
  });

  it("is quiet one minute before 06:00 IST", () => {
    expect(isQuietHours(at("2026-10-05T00:29:00Z"))).toBe(true);
  });

  it("is NOT quiet during the working day", () => {
    for (const utc of ["03:30", "06:30", "11:00", "15:00", "18:00"]) {
      expect(isQuietHours(at(`2026-10-04T${utc}:00Z`))).toBe(false);
    }
  });

  it("covers every hour the constants claim, and no others", () => {
    const quiet: number[] = [];
    for (let h = 0; h < 24; h++) {
      // Build an instant at h:30 IST by going back 5h30 to UTC.
      const utcMs = Date.UTC(2026, 9, 4, h, 30) - 5.5 * 3_600_000;
      if (isQuietHours(new Date(utcMs))) quiet.push(h);
    }
    expect(quiet).toEqual([0, 1, 2, 3, 4, 5]);
    expect(quiet[0]).toBe(QUIET_FROM_HOUR);
    expect(quiet.at(-1)).toBe(QUIET_TO_HOUR - 1);
  });
});
