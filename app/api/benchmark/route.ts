import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getAccount, fetchCompetitor, type CompetitorSnapshot } from "@/lib/instagram";
import { guardRate, requireSection } from "@/lib/api-guard";

type NicheConfig = { name: string; handles: string[] };
type CompetitorsFile = { niches: NicheConfig[] };

function loadNiches(): NicheConfig[] {
  try {
    const file = path.join(process.cwd(), "competitors.json");
    if (!fs.existsSync(file)) return [];
    const raw = fs.readFileSync(file, "utf8");
    return (JSON.parse(raw) as CompetitorsFile).niches || [];
  } catch {
    return [];
  }
}

export async function GET(req: Request) {
  const __denied = await requireSection("ads");
  if (__denied) return __denied;

  const limited = guardRate(req, "benchmark", 15, 300_000);
  if (limited) return limited;
  const url = new URL(req.url);
  const accountId = url.searchParams.get("accountId") || "goocampus";
  const nicheName = url.searchParams.get("niche") || "";
  const customHandles = (url.searchParams.get("handles") || "").split(",").map((s) => s.trim()).filter(Boolean);

  const account = getAccount(accountId);
  if (!account) return NextResponse.json({ error: `Unknown account: ${accountId}` }, { status: 404 });

  const niches = loadNiches();
  let handles: string[] = customHandles;
  let resolvedNiche: NicheConfig | null = null;
  if (!handles.length) {
    resolvedNiche = (nicheName && niches.find((n) => n.name.toLowerCase() === nicheName.toLowerCase()))
      || niches[0]
      || null;
    handles = resolvedNiche?.handles || [];
  }

  const t0 = Date.now();
  const results = await Promise.allSettled(handles.map((h) => fetchCompetitor(account, h)));
  const competitors: (CompetitorSnapshot | { error: string; username: string })[] = results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    return { error: (r.reason as Error).message, username: handles[i] };
  });

  return NextResponse.json({
    niche: resolvedNiche?.name || (customHandles.length ? "Custom" : ""),
    niches: niches.map((n) => n.name),
    queriedAt: new Date().toISOString(),
    latencyMs: Date.now() - t0,
    sourceAccount: { id: account.id, handle: account.handle },
    competitors,
  });
}
