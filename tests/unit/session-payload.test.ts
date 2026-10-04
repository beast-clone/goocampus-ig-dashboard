import { describe, it, expect } from "vitest";
import { endOfISTDaySec, buildPayload, readPayload } from "@/lib/session-payload";

// Everyone's access to the dashboard runs through these three functions. A
// mistake here is either "nobody can log in" or "an old cookie still works",
// so the cases below are the ones that would actually bite, not a coverage
// exercise.
//
// Every test passes its own instant. Nothing here reads the wall clock, so the
// suite behaves the same at 09:00 as at 23:59 — which matters for a file whose
// entire subject is midnight.

const at = (iso: string) => new Date(iso); // IST = UTC+5:30
const istOf = (sec: number) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", dateStyle: "short", timeStyle: "medium" })
    .format(new Date(sec * 1000));

describe("endOfISTDaySec", () => {
  it("expires at the next 00:00 IST", () => {
    // 10:00 IST on 4 Oct
    expect(istOf(endOfISTDaySec(at("2026-10-04T04:30:00Z")))).toBe("05/10/2026, 00:00:00");
  });

  it("gives a full working day to someone signing in at 09:00", () => {
    const now = at("2026-10-04T03:30:00Z"); // 09:00 IST
    const hours = (endOfISTDaySec(now) - now.getTime() / 1000) / 3600;
    expect(hours).toBeCloseTo(15, 5);
  });

  it("does not hand out a two-minute session at 23:58", () => {
    // The footgun: without a floor, signing in just before midnight would expire
    // almost immediately.
    const now = at("2026-10-04T18:28:00Z"); // 23:58 IST
    const mins = (endOfISTDaySec(now) - now.getTime() / 1000) / 60;
    expect(mins).toBeCloseTo(30, 5);
  });

  it("still ends the day for someone who signed in just after midnight", () => {
    const now = at("2026-10-04T18:31:00Z"); // 00:01 IST on the 5th
    const hours = (endOfISTDaySec(now) - now.getTime() / 1000) / 3600;
    expect(hours).toBeGreaterThan(23);
    expect(hours).toBeLessThanOrEqual(24);
  });

  it("is never in the past", () => {
    for (const h of [0, 3, 6, 12, 18, 23]) {
      const now = at(`2026-10-04T${String(h).padStart(2, "0")}:17:00Z`);
      expect(endOfISTDaySec(now)).toBeGreaterThan(Math.floor(now.getTime() / 1000));
    }
  });
});

describe("readPayload", () => {
  const now = at("2026-10-04T04:30:00Z");
  const nowSec = Math.floor(now.getTime() / 1000);

  it("round-trips a user and the admin flag", () => {
    const admin = readPayload(buildPayload("nikhil", true, "tok", now), nowSec);
    expect(admin).toMatchObject({ userId: "nikhil", isAdmin: true });

    const plain = readPayload(buildPayload("nandu", false, "tok", now), nowSec);
    expect(plain).toMatchObject({ userId: "nandu", isAdmin: false });
  });

  it("accepts a session one second before it expires and rejects it one second after", () => {
    const p = buildPayload("nikhil", true, "tok", now);
    const exp = readPayload(p, nowSec)!.exp;
    expect(readPayload(p, exp - 1)).not.toBeNull();
    expect(readPayload(p, exp + 1)).toBeNull();
  });

  it("rejects a session that expired at exactly the boundary", () => {
    const p = buildPayload("nikhil", true, "tok", now);
    const exp = readPayload(p, nowSec)!.exp;
    expect(readPayload(p, exp)).toBeNull();
  });

  // The cutover. These three shapes were valid before sessions had an expiry;
  // refusing them is what logs everyone out once, deliberately. If someone
  // "helpfully" makes these parse again, the expiry is gone and nobody notices.
  describe("pre-expiry sessions are refused", () => {
    it.each([
      ["anonymous", "justatoken"],
      ["user", "nikhil:sometoken"],
      ["admin", "nikhil:a:sometoken"],
    ])("%s", (_label, payload) => {
      expect(readPayload(payload)).toBeNull();
    });
  });

  describe("malformed input is not a session", () => {
    it.each([
      ["empty", ""],
      ["non-numeric exp", "x:a:notanumber:tok"],
      ["too many fields", "a:b:c:d:e"],
      ["exp of zero", "x:a:0:tok"],
      ["negative exp", "x:a:-5:tok"],
      ["NaN-ish exp", "x:a:Infinity:tok"],
      ["only separators", ":::"],
    ])("%s", (_label, payload) => {
      expect(readPayload(payload)).toBeNull();
    });
  });

  it("treats a missing userId as anonymous rather than the literal dash", () => {
    const p = buildPayload(null, false, "tok", now);
    expect(readPayload(p, nowSec)).toMatchObject({ userId: null });
  });
});
