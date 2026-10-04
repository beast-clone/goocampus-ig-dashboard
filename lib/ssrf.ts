// Refuse to let the server fetch a URL that points back inside the network.
//
// Several features take a URL from a person and fetch it server-side: the Radar
// article reader, the watchers (a notice board anyone on the team can register),
// and the PDF summariser that follows links found on those boards. Without a
// check, each of those turns a Netlify function into a request proxy into the
// platform's private ranges and the cloud metadata endpoint at 169.254.169.254
// — and the watchers reflect the fetched page's links and anchor text straight
// back in the response, so it would not even be blind.
//
// This logic was written once for app/api/radar/article; it lives here so the
// other two call sites share it rather than each growing their own version.
//
// Two things worth keeping in mind when editing:
//   - DNS is resolved and every returned address checked, because a public
//     hostname is free to resolve to 127.0.0.1.
//   - A pass here is only good for the URL as given. Anything following
//     redirects has to re-check each hop, or an allowed host can 302 straight
//     to an internal address.

import net from "node:net";
import { lookup } from "node:dns/promises";

export function isPrivateIp(ip: string): boolean {
  const v = ip.replace(/^::ffff:/i, "");
  if (net.isIPv4(v)) {
    const p = v.split(".").map(Number);
    if (p[0] === 10 || p[0] === 127 || p[0] === 0) return true;
    if (p[0] === 169 && p[1] === 254) return true;              // link-local + cloud metadata
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true; // CGNAT
    return false;
  }
  const l = ip.toLowerCase();
  return l === "::1" || l === "::" || l.startsWith("fe80") || l.startsWith("fc") || l.startsWith("fd");
}

/** Throws when the URL is not a public http(s) address. */
export async function assertPublicUrl(urlStr: string): Promise<void> {
  const u = new URL(urlStr);
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("blocked protocol");
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("blocked host");
  }
  if (net.isIP(host)) { if (isPrivateIp(host)) throw new Error("blocked ip"); return; }
  const addrs = await lookup(host, { all: true });
  for (const a of addrs) if (isPrivateIp(a.address)) throw new Error("blocked resolved ip");
}

/** True when the URL is safe to fetch. For call sites that prefer to skip quietly. */
export async function isPublicUrl(urlStr: string): Promise<boolean> {
  try { await assertPublicUrl(urlStr); return true; } catch { return false; }
}
