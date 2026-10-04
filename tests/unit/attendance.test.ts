import { describe, it, expect } from "vitest";
import { loginMinIST, clockIST } from "@/lib/attendance";

// What the attendance board shows as someone's start time. Sessions now end at
// midnight IST specifically so this is stamped fresh each morning, which makes
// these two functions the thing a manager actually reads.
//
// The day is anchored at 09:00 IST and login_min is minutes from there — NOT
// clamped, because someone who starts at 08:40 started at 08:40 and the board
// should say so.

const at = (iso: string) => new Date(iso); // IST = UTC+5:30

describe("loginMinIST", () => {
  it("is zero at exactly 09:00 IST", () => {
    expect(loginMinIST(at("2026-10-04T03:30:00Z"))).toBe(0);
  });

  it("is negative for an early start, rather than clamped to zero", () => {
    // 08:40 IST — twenty minutes early is a real fact about the day.
    expect(loginMinIST(at("2026-10-04T03:10:00Z"))).toBe(-20);
  });

  it("counts past the end of the day rather than capping at 7pm", () => {
    // 20:00 IST = 11 hours after 09:00
    expect(loginMinIST(at("2026-10-04T14:30:00Z"))).toBe(660);
  });

  it.each([
    ["09:30 IST", "2026-10-04T04:00:00Z", 30],
    ["12:00 IST", "2026-10-04T06:30:00Z", 180],
    ["19:00 IST", "2026-10-04T13:30:00Z", 600],
  ])("%s", (_label, iso, mins) => {
    expect(loginMinIST(at(iso))).toBe(mins);
  });

  it("reads the IST clock, not the server's", () => {
    // Same instant, and the answer must not depend on where the server sits.
    const instant = at("2026-10-04T03:30:00Z");
    expect(loginMinIST(instant)).toBe(0);
  });
});

describe("clockIST", () => {
  it("formats the IN column in 12-hour IST", () => {
    expect(clockIST(at("2026-10-04T03:10:00Z"))).toMatch(/^8:40\s?AM$/);
    expect(clockIST(at("2026-10-04T14:30:00Z"))).toMatch(/^8:00\s?PM$/);
  });

  it("renders midnight and noon the way a person expects", () => {
    expect(clockIST(at("2026-10-04T18:30:00Z"))).toMatch(/^12:00\s?AM$/);
    expect(clockIST(at("2026-10-04T06:30:00Z"))).toMatch(/^12:00\s?PM$/);
  });
});
