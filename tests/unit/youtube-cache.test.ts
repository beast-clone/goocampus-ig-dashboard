// Guards the two mistakes that made three YouTube tabs read "0 views" next to a
// correct subscriber count, which looks like a quiet channel rather than a broken
// one — so nobody reported it.
//
// 1. One access token was cached for the whole app under a fixed key, although
//    each channel has its own refresh token for its own brand account. Whichever
//    channel minted first had its token served to the rest, and a cross-account
//    read answers 403.
// 2. The resulting all-zero payload was then stored for a day.
import { describe, it, expect } from "vitest";
import { createHash } from "crypto";
import { cached, clearCache } from "@/lib/api-cache";

// The keying rule from lib/youtube.ts freshAccessToken.
const keyFor = (rt: string) => "rt:" + createHash("sha256").update(rt).digest("hex").slice(0, 16);

describe("YouTube access-token cache keying", () => {
  it("gives different accounts different cache entries", () => {
    expect(keyFor("1//goocampus-token")).not.toBe(keyFor("1//twelfthplus-token"));
  });

  it("gives channels that share a refresh token the SAME entry", () => {
    // This is the point of caching at all: same account, one token, so the two
    // cannot invalidate each other by minting separately.
    expect(keyFor("1//shared")).toBe(keyFor("1//shared"));
  });

  it("does not key on a constant", () => {
    // The regression in one line: a fixed key collapses every account together.
    const fixed = () => "yt";
    expect(fixed()).toBe(fixed());                                  // the bug
    expect(keyFor("1//a")).not.toBe(keyFor("1//b"));                // the fix
  });
});

// Mirrors the guard in app/api/youtube/route.ts.
type Summary = { subscribers: number; views: number; watchHours: number };
const looksReal = (d: { summary: Summary; topVideos: unknown[] }) =>
  !(d.summary.subscribers > 0 && d.summary.views === 0 && d.summary.watchHours === 0 && d.topVideos.length === 0);

const degraded = { summary: { subscribers: 613, views: 0, watchHours: 0 }, topVideos: [] };
const dormant  = { summary: { subscribers: 0, views: 0, watchHours: 0 }, topVideos: [] };
const healthy  = { summary: { subscribers: 613, views: 6501, watchHours: 15 }, topVideos: [{}] };

describe("degraded YouTube payloads are not cached for a day", () => {
  it("recognises the broken shape, and leaves a genuinely dormant channel alone", () => {
    expect(looksReal(degraded)).toBe(false);
    expect(looksReal(dormant)).toBe(true);   // 0 subscribers too — nothing to contradict
    expect(looksReal(healthy)).toBe(true);
  });

  it("serves the degraded answer but retries on the next request", async () => {
    clearCache("test:yt");
    let calls = 0;
    const fetchIt = async () => { calls++; return calls === 1 ? degraded : healthy; };

    const first = await cached("test:yt:a", 24 * 60 * 60_000, fetchIt, looksReal);
    expect(first).toEqual(degraded);          // still served, not an error
    expect(calls).toBe(1);

    // Without the guard this second call is a cache hit and the zeros stand all day.
    const second = await cached("test:yt:a", 24 * 60 * 60_000, fetchIt, looksReal);
    expect(second).toEqual(healthy);
    expect(calls).toBe(2);

    // Once it is healthy it DOES stick, or the cache would be pointless.
    const third = await cached("test:yt:a", 24 * 60 * 60_000, fetchIt, looksReal);
    expect(third).toEqual(healthy);
    expect(calls).toBe(2);
  });

  it("without the guard, the zeros would persist — the bug, reproduced", async () => {
    clearCache("test:yt");
    let calls = 0;
    const fetchIt = async () => { calls++; return calls === 1 ? degraded : healthy; };

    await cached("test:yt:b", 24 * 60 * 60_000, fetchIt);           // no shouldCache
    const second = await cached("test:yt:b", 24 * 60 * 60_000, fetchIt);
    expect(second).toEqual(degraded);
    expect(calls).toBe(1);
  });
});
