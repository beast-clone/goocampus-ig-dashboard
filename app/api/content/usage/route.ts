import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase";
import { getSessionIsAdmin } from "@/lib/auth";
import { getUserById } from "@/lib/users";

// GET /api/content/usage?days=30
//   Every AI run Content Studio has made — Playbooks and Create — with what was asked,
//   whether the framework was overridden, what it cost and how long it took.
//
// Admin only, agreed with Praveen L. It carries free text the team typed and the money
// each run spent; neither is something everyone needs to read over each other's
// shoulders. See sql/024_ai_usage_detail.sql.

export const dynamic = "force-dynamic";

type Row = {
  id: string; created_at: string; feature: string; actor: string | null; model: string;
  prompt_tokens: number; completion_tokens: number; cost_usd: number | null; ok: boolean;
  error: string | null; slug: string | null; label: string | null; task_text: string | null;
  used_custom: boolean; custom_prompt: string | null; duration_ms: number | null;
};

// The three things Content Studio does. Anything else in ai_usage belongs to another
// part of the dashboard and would only pad this report.
const STUDIO_FEATURES = ["playbook", "studio-factcheck", "studio-write"];
const WHERE_LABEL: Record<string, string> = {
  playbook: "Playbooks",
  "studio-factcheck": "Create · fact-check",
  "studio-write": "Create · write",
};

export async function GET(req: Request) {
  if (!getSessionIsAdmin()) return NextResponse.json({ error: "Admins only" }, { status: 403 });
  try {
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

    const days = Math.min(365, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 30));
    const from = new Date(Date.now() - days * 86_400_000).toISOString();

    const { data, error } = await sb
      .from("ai_usage")
      .select("id, created_at, feature, actor, model, prompt_tokens, completion_tokens, cost_usd, ok, error, slug, label, task_text, used_custom, custom_prompt, duration_ms")
      .in("feature", STUDIO_FEATURES)
      .gte("created_at", from)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) {
      // The detail columns arrive with sql/024. Until it is run the select fails, and a
      // report that says why is more use than a 502.
      return NextResponse.json(
        { error: error.message, needsMigration: /column .* does not exist/i.test(error.message) },
        { status: 502 },
      );
    }

    const rows = (data as Row[] | null) || [];
    const runs = rows.map((r) => ({
      id: r.id,
      at: r.created_at,
      where: WHERE_LABEL[r.feature] || r.feature,
      what: r.label || r.slug || "—",
      task: r.task_text,
      usedCustom: r.used_custom === true,
      customPrompt: r.custom_prompt,
      tokens: (r.prompt_tokens || 0) + (r.completion_tokens || 0),
      promptTokens: r.prompt_tokens || 0,
      completionTokens: r.completion_tokens || 0,
      cost: r.cost_usd,
      seconds: r.duration_ms != null ? Math.round(r.duration_ms / 100) / 10 : null,
      by: r.actor ? getUserById(r.actor)?.name || r.actor : null,
      model: r.model,
      ok: r.ok,
      error: r.error,
    }));

    return NextResponse.json({
      runs,
      totals: {
        runs: runs.length,
        tokens: runs.reduce((n, r) => n + r.tokens, 0),
        cost: runs.reduce((n, r) => n + (r.cost || 0), 0),
        failed: runs.filter((r) => !r.ok).length,
        custom: runs.filter((r) => r.usedCustom).length,
      },
      days,
    });
  } catch (err) {
    return NextResponse.json(safeError(err, "Couldn't load the usage report"), { status: 502 });
  }
}
