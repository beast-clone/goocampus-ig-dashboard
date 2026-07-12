import { NextResponse } from "next/server";

// GET /api/weather — current conditions for the office (Bengaluru).
// Proxies Open-Meteo (free, no key) so the client never hits an external host
// directly (keeps CSP simple). Cached in-process for 10 minutes.

const LAT = 12.9716;
const LON = 77.5946;
const TTL_MS = 10 * 60 * 1000;

let CACHE: { at: number; data: { tempC: number; code: number } } | null = null;

export async function GET() {
  try {
    if (CACHE && Date.now() - CACHE.at < TTL_MS) {
      return NextResponse.json({ ...CACHE.data, cached: true });
    }
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,weather_code&timezone=Asia%2FKolkata`;
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`open-meteo ${r.status}`);
    const j = await r.json();
    const data = {
      tempC: Math.round(j?.current?.temperature_2m ?? 0),
      code: Number(j?.current?.weather_code ?? 0),
    };
    CACHE = { at: Date.now(), data };
    return NextResponse.json({ ...data, cached: false });
  } catch {
    // Graceful: the bar just hides the weather chip if this fails.
    return NextResponse.json({ tempC: null, code: null }, { status: 200 });
  }
}
