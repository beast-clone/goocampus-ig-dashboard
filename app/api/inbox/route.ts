import { NextResponse } from "next/server";
import OpenAI from "openai";
import {
  getAccount,
  fetchRecentMedia, fetchMediaComments, replyToComment, checkDmCapability,
  type IGAccountConfig,
} from "@/lib/instagram";
import { getSupabase } from "@/lib/supabase";

const INBOX_TTL_MS = 10 * 60 * 1000;          // 10 min — comments don't change much minute-to-minute
const MEDIA_PER_ACCOUNT = 12;                  // scan the 12 most recent posts per account for comments
const COMMENTS_PER_MEDIA = 25;

type Mood = "positive" | "neutral" | "negative";
type InboxItem = {
  account: string;
  handle: string;
  commentId: string;
  text: string;
  username: string;
  timestamp: string;
  likeCount: number;
  mediaId: string;
  permalink: string;
  caption: string;
  mood: Mood;
  isLead: boolean;
  reason: string;
};

// ---- Supabase cache (reuses the discover_cache table) ----
async function cacheGet(key: string): Promise<{ payload: unknown; ageMs: number } | null> {
  const db = getSupabase();
  if (!db) return null;
  const { data, error } = await db
    .from("discover_cache")
    .select("last_fetched, payload")
    .eq("cache_key", key)
    .maybeSingle();
  if (error || !data) return null;
  return { payload: data.payload, ageMs: Date.now() - new Date(data.last_fetched as string).getTime() };
}
async function cacheSet(key: string, payload: unknown): Promise<void> {
  const db = getSupabase();
  if (!db) return;
  await db.from("discover_cache").upsert(
    { cache_key: key, source: "inbox", last_fetched: new Date().toISOString(), payload },
    { onConflict: "cache_key" },
  );
}

// ---- Lead detection: deterministic (free + reliable for keyword funnels) ----
// GooCampus funnels ask followers to comment a keyword. A short comment that IS a
// funnel keyword = a lead. The brand's OWN CTA comments ("Comment X to…", "DM us…") are NOT leads.
const FUNNEL_KEYWORDS = [
  "amc", "global", "handbook", "blueprint", "blue print", "guide", "uae", "als",
  "match", "info", "plab", "usmle", "neetpg", "neet", "fmge", "ukmla", "ielts", "oet",
];
const CTA_MARKERS = [
  "comment ", "dm us", "dm me for", "join our", "join the", "link in bio", "book your",
  "book a", "call us", "visit ", "follow ", "save this", "take the free", "we'll help",
  "we will help", "secure your copy", "to register", "to know more", "to get your",
];
const INTENT_RE = /\b(interested|want to (join|know|apply|register)|how (do|can) i|sign me up|register me|my number|whatsapp me|dm me)\b|\+?\d{10}|[\w.]+@[\w.]+/i;

function detectLead(text: string): { isLead: boolean; reason: string } {
  const t = (text || "").trim().toLowerCase();
  if (!t) return { isLead: false, reason: "" };
  if (CTA_MARKERS.some((m) => t.startsWith(m) || t.includes(m))) return { isLead: false, reason: "brand CTA" };
  const words = t.split(/\s+/);
  if (words.length <= 3 && FUNNEL_KEYWORDS.some((k) => t.includes(k))) return { isLead: true, reason: "funnel keyword" };
  if (INTENT_RE.test(t)) return { isLead: true, reason: "buying intent" };
  return { isLead: false, reason: "" };
}

// ---- Mood via OpenAI, in small batches so the JSON never gets truncated (cheap: gpt-4o-mini) ----
async function classifyMood(items: { id: string; text: string }[]): Promise<Map<string, Mood>> {
  const out = new Map<string, Mood>();
  const key = process.env.OPENAI_API_KEY;
  if (!key || items.length === 0) { for (const it of items) out.set(it.id, "neutral"); return out; }
  const client = new OpenAI({ apiKey: key });
  const sys = `Label the mood of each Instagram comment as "positive", "neutral", or "negative". Return ONLY JSON: {"results":[{"id":"...","mood":"..."}]}`;

  const BATCH = 40;
  const chunks: { id: string; text: string }[][] = [];
  for (let i = 0; i < items.length; i += BATCH) chunks.push(items.slice(i, i + BATCH));

  await Promise.all(chunks.map(async (chunk) => {
    try {
      const resp = await client.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 1500,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: sys }, { role: "user", content: JSON.stringify(chunk) }],
      });
      const parsed = JSON.parse(resp.choices[0]?.message?.content || "{}") as { results?: { id: string; mood: Mood }[] };
      for (const r of parsed.results ?? []) out.set(r.id, r.mood);
    } catch { /* leave as neutral default */ }
  }));
  for (const it of items) if (!out.has(it.id)) out.set(it.id, "neutral");
  return out;
}

async function buildInbox(accountId: string): Promise<{ items: InboxItem[]; dmAvailable: boolean; dmReason?: string }> {
  // One brand at a time — the account dropdown controls which. Brands are kept separate, never mixed.
  const acc = getAccount(accountId);
  const accounts = acc ? [acc] : [];

  // Fetch recent media + their comments for the selected account
  const perAccount = await Promise.all(accounts.map(async (acc) => {
    const media = await fetchRecentMedia(acc, MEDIA_PER_ACCOUNT);
    const withComments = media.filter((m) => (m.comments_count ?? 0) > 0);
    const commentLists = await Promise.all(
      withComments.map(async (m) => ({ m, comments: await fetchMediaComments(acc, m.id, COMMENTS_PER_MEDIA) })),
    );
    const items: Omit<InboxItem, "mood" | "isLead" | "reason">[] = [];
    for (const { m, comments } of commentLists) {
      for (const c of comments) {
        items.push({
          account: acc.id, handle: acc.handle,
          commentId: c.id, text: c.text || "", username: c.username || "unknown",
          timestamp: c.timestamp, likeCount: c.like_count || 0,
          mediaId: m.id, permalink: m.permalink, caption: (m.caption || "").slice(0, 120),
        });
      }
    }
    return items;
  }));

  const flat = perAccount.flat().sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Leads: deterministic keyword/intent match. Mood: AI in small batches.
  const moods = await classifyMood(flat.map((i) => ({ id: i.commentId, text: i.text })));
  const items: InboxItem[] = flat.map((i) => {
    const lead = detectLead(i.text);
    return { ...i, mood: moods.get(i.commentId) || "neutral", isLead: lead.isLead, reason: lead.reason };
  });

  // DM capability (will be false until Meta approves instagram_manage_messages)
  const dm = accounts.length ? await checkDmCapability(accounts[0]) : { available: false };
  return { items, dmAvailable: dm.available, dmReason: dm.reason };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const accountId = url.searchParams.get("accountId") || "goocampus";
  const force = url.searchParams.get("force") === "1";
  const t0 = Date.now();
  const cacheKey = `inbox:${accountId}`;

  if (!force) {
    const cached = await cacheGet(cacheKey);
    if (cached && cached.ageMs < INBOX_TTL_MS) {
      const p = cached.payload as Record<string, unknown>;
      return NextResponse.json({ ...p, cached: true, cacheAgeMs: cached.ageMs, latencyMs: Date.now() - t0 });
    }
  }
  try {
    const result = await buildInbox(accountId);
    await cacheSet(cacheKey, result);
    return NextResponse.json({ ...result, cached: false, latencyMs: Date.now() - t0 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const body = await req.json() as {
    action: "reply" | "save_lead";
    account?: string;
    commentId?: string;
    message?: string;
    lead?: Record<string, unknown>;
  };

  if (body.action === "reply") {
    const acc = getAccount(body.account || "");
    if (!acc) return NextResponse.json({ error: "Unknown account" }, { status: 400 });
    if (!body.commentId || !body.message) return NextResponse.json({ error: "Missing commentId/message" }, { status: 400 });
    const res = await replyToComment(acc as IGAccountConfig, body.commentId, body.message);
    if (!res.success) return NextResponse.json({ error: res.error }, { status: 502 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "save_lead") {
    const db = getSupabase();
    if (!db) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    const { error } = await db.from("leads").insert({
      source: "instagram_comment",
      created_at: new Date().toISOString(),
      ...body.lead,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 502 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
