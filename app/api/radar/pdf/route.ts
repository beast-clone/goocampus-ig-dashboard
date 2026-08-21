import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { requireSection } from "@/lib/api-guard";
import net from "node:net";
import { lookup } from "node:dns/promises";

// PDF proxy for the in-dashboard reader. Some publishers (e.g. natboard.edu.in's
// viewNotice.php) serve PDFs only to a real browser UA and block Google's viewer,
// so we can't embed via docs.google.com/gview. Instead we fetch the PDF server-side
// (same trusted path as /api/radar/article) and stream the bytes back same-origin,
// letting Chrome's built-in PDF viewer render it in the iframe. SSRF-guarded.
export const dynamic = "force-dynamic";

const MAX_URL_LEN = 2000;
const MAX_PDF_BYTES = 25 * 1024 * 1024; // 25MB cap

function isPrivateIp(ip: string): boolean {
  const v = ip.replace(/^::ffff:/i, "");
  if (net.isIPv4(v)) {
    const p = v.split(".").map(Number);
    if (p[0] === 10 || p[0] === 127 || p[0] === 0) return true;
    if (p[0] === 169 && p[1] === 254) return true;
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true;
    return false;
  }
  const l = ip.toLowerCase();
  return l === "::1" || l === "::" || l.startsWith("fe80") || l.startsWith("fc") || l.startsWith("fd");
}

async function assertPublicUrl(urlStr: string): Promise<void> {
  const u = new URL(urlStr);
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("blocked protocol");
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("blocked host");
  if (net.isIP(host)) { if (isPrivateIp(host)) throw new Error("blocked ip"); return; }
  const addrs = await lookup(host, { all: true });
  for (const a of addrs) if (isPrivateIp(a.address)) throw new Error("blocked resolved ip");
}

export async function GET(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  const target = new URL(req.url).searchParams.get("url") || "";
  if (!target || target.length > MAX_URL_LEN) return new Response("bad url", { status: 400 });
  try { new URL(target); } catch { return new Response("bad url", { status: 400 }); }
  try { await assertPublicUrl(target); } catch { return new Response("blocked", { status: 400 }); }

  try {
    const r = await fetchWithTimeout(target, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
        "Accept": "application/pdf,*/*",
        "Accept-Language": "en-IN,en;q=0.9",
      },
      timeoutMs: 25_000,
      redirect: "follow",
    });
    if (!r.ok) return new Response("fetch failed", { status: 502 });
    await assertPublicUrl(r.url || target); // re-check after redirects

    const buf = await r.arrayBuffer();
    if (buf.byteLength > MAX_PDF_BYTES) return new Response("pdf too large", { status: 413 });

    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline",
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("pdf proxy error", { status: 502 });
  }
}
