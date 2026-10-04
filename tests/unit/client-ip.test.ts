import { describe, it, expect } from "vitest";
import { getClientIp } from "@/lib/rate-limit";

// This decides what the login limiter counts against: 5 attempts per 15 minutes
// PER IP. Read the wrong element of X-Forwarded-For and an attacker simply sends
// a different fake value each request and the limit may as well not exist.
//
// The header is built left-to-right — each proxy APPENDS what it saw — so the
// LEFTMOST entry is whatever the client typed and the RIGHTMOST is what our own
// edge observed. This file exists because the code read [0].

const h = (o: Record<string, string>) => new Headers(o);

describe("getClientIp", () => {
  it("prefers Netlify's own header, which a client cannot forge", () => {
    expect(getClientIp(h({
      "x-nf-client-connection-ip": "203.0.113.9",
      "x-forwarded-for": "1.2.3.4, 203.0.113.9",
    }))).toBe("203.0.113.9");
  });

  it("takes the rightmost X-Forwarded-For entry, not the client-supplied one", () => {
    // The attack: client sends "1.2.3.4"; the edge appends the real address.
    expect(getClientIp(h({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("cannot be moved by stuffing extra hops on the left", () => {
    const spoofed = getClientIp(h({ "x-forwarded-for": "9.9.9.9, 8.8.8.8, 7.7.7.7, 203.0.113.9" }));
    expect(spoofed).toBe("203.0.113.9");
  });

  it("handles the ordinary single-entry case", () => {
    expect(getClientIp(h({ "x-forwarded-for": "203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("tolerates whitespace and empty segments", () => {
    expect(getClientIp(h({ "x-forwarded-for": " 1.2.3.4 , , 203.0.113.9 " }))).toBe("203.0.113.9");
  });

  it("falls back to x-real-ip, then cf-connecting-ip", () => {
    expect(getClientIp(h({ "x-real-ip": "203.0.113.1" }))).toBe("203.0.113.1");
    expect(getClientIp(h({ "cf-connecting-ip": "203.0.113.2" }))).toBe("203.0.113.2");
  });

  it("returns a constant when it knows nothing, so the limiter still has a key", () => {
    // Everyone sharing one bucket is wrong, but it is safe-wrong: it rate-limits
    // too much rather than not at all.
    expect(getClientIp(h({}))).toBe("unknown");
  });

  it("never returns the attacker's value for any hop count", () => {
    for (let hops = 1; hops <= 5; hops++) {
      const chain = [...Array(hops).keys()].map((i) => `10.0.0.${i + 1}`).concat("203.0.113.9").join(", ");
      expect(getClientIp(h({ "x-forwarded-for": chain }))).toBe("203.0.113.9");
    }
  });
});
