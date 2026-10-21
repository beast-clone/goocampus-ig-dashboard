import { describe, it, expect } from "vitest";
import { isPrivateIp, assertPublicUrl } from "@/lib/ssrf";

// Several features fetch a URL a person typed — Radar, the PDF summariser, the
// watchers. Without this guard, "https://evil.test" resolving to 169.254.169.254
// turns the server into a proxy for cloud metadata, and the watchers would then
// reflect whatever came back onto a dashboard page.
//
// isPrivateIp is pure and gets the full treatment. assertPublicUrl resolves DNS,
// so only its pre-DNS rejections are exercised here — a unit suite must not
// depend on a nameserver.

describe("isPrivateIp", () => {
  it.each([
    "10.0.0.1", "10.255.255.255",
    "127.0.0.1", "127.1.2.3",
    "0.0.0.0",
    "169.254.169.254",            // AWS/GCP metadata — the classic SSRF target
    "172.16.0.1", "172.31.255.255",
    "192.168.1.1",
    "100.64.0.1", "100.127.255.255", // CGNAT
    "::1", "::",
    "fe80::1",
    "fc00::1", "fd12:3456::1",
    "::ffff:127.0.0.1",           // IPv4-mapped loopback
    "::ffff:169.254.169.254",
  ])("blocks %s", (ip) => {
    expect(isPrivateIp(ip)).toBe(true);
  });

  it.each([
    "8.8.8.8",
    "1.1.1.1",
    "203.0.113.9",
    "172.15.255.255",   // just below the private 172.16-31 block
    "172.32.0.1",       // just above it
    "100.63.255.255",   // just below CGNAT
    "100.128.0.1",      // just above it
    "169.253.0.1",      // not link-local
    "11.0.0.1",
    "2606:4700::1111",  // public IPv6
  ])("allows %s", (ip) => {
    expect(isPrivateIp(ip)).toBe(false);
  });

  it("gets the boundaries of the 172.16/12 block exactly right", () => {
    expect(isPrivateIp("172.15.0.1")).toBe(false);
    expect(isPrivateIp("172.16.0.0")).toBe(true);
    expect(isPrivateIp("172.31.255.255")).toBe(true);
    expect(isPrivateIp("172.32.0.0")).toBe(false);
  });
});

describe("assertPublicUrl — the checks that run before DNS", () => {
  it.each([
    ["file:", "file:///etc/passwd"],
    ["gopher:", "gopher://example.com/"],
    ["data:", "data:text/plain,hello"],
    ["ftp:", "ftp://example.com/x"],
  ])("rejects the %s scheme", async (_label, url) => {
    await expect(assertPublicUrl(url)).rejects.toThrow();
  });

  it.each([
    "http://localhost/x",
    "http://app.localhost/x",
    "http://printer.local/x",
    "http://metadata.internal/x",
  ])("rejects %s by hostname", async (url) => {
    await expect(assertPublicUrl(url)).rejects.toThrow();
  });

  it("rejects a literal private address without needing to resolve anything", async () => {
    await expect(assertPublicUrl("http://169.254.169.254/latest/meta-data/")).rejects.toThrow();
    await expect(assertPublicUrl("http://127.0.0.1:8080/")).rejects.toThrow();
  });
});
