// End-of-day report → the team's Telegram group (prototype D, 22 Oct). Sent in the
// background when someone ends their day; nobody has to approve or press send.
// The group is a setting: DAY_REPORT_TELEGRAM_CHAT (a chat id the bot is in).
// No setting, no bot, or Telegram down → nothing is sent and logout carries on.
import { getSupabase } from "@/lib/supabase";
import { hasTelegram, sendTelegram } from "@/lib/telegram";
import { rosterById } from "@/lib/team-db";

const IST = "Asia/Kolkata";
const dayIST = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: IST }).format(d);
const esc = (t: string) => t.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
const fmtMins = (m: number) => { const h = Math.floor(m / 60), mm = m % 60; return h ? `${h}h${mm ? ` ${mm}m` : ""}` : `${mm}m`; };

export async function postDayReport(person: string, inAt: string | null, outAt: string | null, rolled: { title: string; reason: string }[]): Promise<void> {
  const chat = (process.env.DAY_REPORT_TELEGRAM_CHAT || "").trim();
  const sb = getSupabase();
  if (!chat || !sb || !(await hasTelegram())) return;
  const today = dayIST(new Date());
  const from = new Date(`${today}T00:00:00+05:30`).toISOString();
  const { data } = await sb.from("mh_posts").select("particulars, start_at, end_at").eq("owner_key", person).gte("end_at", from).order("end_at", { ascending: true }).limit(100);
  const done = ((data || []) as { particulars: string | null; start_at: string | null; end_at: string }[]).map((r) => {
    let mins = 0;
    if (r.start_at && dayIST(new Date(r.start_at)) === today) {
      const a = new Date(r.start_at).getTime(), b = new Date(r.end_at).getTime();
      const l1 = new Date(`${today}T13:00:00+05:30`).getTime(), l2 = new Date(`${today}T14:00:00+05:30`).getTime();
      mins = Math.max(0, Math.round((b - a - Math.max(0, Math.min(b, l2) - Math.max(a, l1))) / 60000));
    }
    return { title: r.particulars || "Untitled", mins };
  });
  const who = (await rosterById(person))?.name || person;
  const nice = new Date().toLocaleDateString("en-GB", { timeZone: IST, weekday: "short", day: "numeric", month: "short" });
  const total = done.reduce((n, d) => n + d.mins, 0);
  const lines = [
    `<b>${esc(who)} — day report · ${esc(nice)}</b>`,
    `In ${esc(inAt || "—")} · Out ${esc(outAt || "—")}`,
    `${done.length} completed · ${fmtMins(total)} on tasks · ${rolled.length} rolled to tomorrow`,
  ];
  if (done.length) lines.push("", "<b>Completed</b>", ...done.map((d) => `• ${esc(d.title)}${d.mins ? ` (${fmtMins(d.mins)})` : ""}`));
  if (rolled.length) lines.push("", "<b>Rolled to tomorrow</b>", ...rolled.map((r) => `• ${esc(r.title)} — ${esc(r.reason || "no reason given")}`));
  const app = (process.env.APP_URL || process.env.URL || "").replace(/\/+$/, "");
  if (app) lines.push("", `<a href="${app}/dashboard/preview/attendance">Open in dashboard</a>`);
  await sendTelegram(chat, lines.join("\n"));
}
