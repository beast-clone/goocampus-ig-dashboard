// Dashboard reads this to populate the DM threads list.
// Also classifies each thread as a Verified Lead by reading inbound message content.
import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { listThreads, listAllInbound, type DMMessage, type DMThread } from "@/lib/dm";
import { classifyThread } from "@/lib/lead-detection";

type EnrichedThread = DMThread & {
  is_verified_lead: boolean;
  lead_kind?: "phone" | "email" | "whatsapp" | "telegram" | "intent";
  lead_evidence?: string;
};

export async function GET(req: Request) {
  const __denied = await requireSection("sales");
  if (__denied) return __denied;

  const url = new URL(req.url);
  const account = url.searchParams.get("account") || undefined;
  const onlyLeads = url.searchParams.get("onlyLeads") === "1";

  const [threads, inbound] = await Promise.all([
    listThreads(account),
    listAllInbound(account),
  ]);

  // Group inbound messages by (account, sender_id)
  const bySender = new Map<string, DMMessage[]>();
  for (const m of inbound) {
    const key = `${m.account}:${m.sender_id}`;
    const arr = bySender.get(key) || [];
    arr.push(m);
    bySender.set(key, arr);
  }

  const enriched: EnrichedThread[] = threads.map((t) => {
    const msgs = bySender.get(`${t.account}:${t.sender_id}`) || [];
    const verdict = classifyThread(msgs);
    return verdict.matched
      ? { ...t, is_verified_lead: true, lead_kind: verdict.kind, lead_evidence: verdict.evidence }
      : { ...t, is_verified_lead: false };
  });

  enriched.sort((a, b) => b.last_message_at.localeCompare(a.last_message_at));

  const verifiedCount = enriched.filter((t) => t.is_verified_lead).length;
  const visible = onlyLeads ? enriched.filter((t) => t.is_verified_lead) : enriched;

  return NextResponse.json({
    threads: visible,
    counts: {
      total: enriched.length,
      unread: enriched.reduce((s, t) => s + (t.unread_count || 0), 0),
      human_mode: enriched.filter((t) => t.mode === "human").length,
      verified_leads: verifiedCount,
      verified_pct: enriched.length > 0 ? (verifiedCount / enriched.length) * 100 : 0,
    },
  });
}
