import { NextResponse } from "next/server";
import { guardRate, requireSection } from "@/lib/api-guard";
import { getSessionUserId } from "@/lib/auth";
import { fetchRoster } from "@/lib/team-db";
import { hasEmail, sendMail } from "@/lib/email";
import { safeError } from "@/lib/errors";

// Prove the mail account works, before a real notice depends on it.
//
//   POST /api/watchers/test-email
//
// Sends one message to the signed-in person's own address and nobody else's — a
// test that can reach a colleague is a test people stop running. Gmail's SMTP
// rejections are the useful part, so they are passed back as they come rather
// than flattened into "couldn't send".
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = await requireSection("content");
  if (denied) return denied;
  // Three a minute: enough to retry while fixing the password, not enough to
  // hammer Gmail into a temporary block.
  const limited = guardRate(req, "watchers-test-email", 3, 60_000);
  if (limited) return limited;

  if (!(await hasEmail())) {
    return NextResponse.json({
      ok: false,
      reason: "No mail account is set up yet. Add GMAIL_USER and GMAIL_APP_PASSWORD, then restart.",
    });
  }

  const uid = getSessionUserId();
  const me = uid ? (await fetchRoster()).find((u) => u.id === uid) : null;
  if (!me?.email) return NextResponse.json({ ok: false, reason: "Your account has no email address on it." }, { status: 400 });

  try {
    await sendMail({
      to: me.email,
      subject: "Watchers — test message",
      text: "This is a test from the Watchers tab. If you are reading it, new counselling notices can reach you by email.",
      html: `<!DOCTYPE html><html><body style="margin:0;padding:24px 12px;background:#F6F7FB">
  <table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" style="max-width:100%;background:#ffffff;border-radius:10px;overflow:hidden">
    <tr><td style="background:#3A57E8;padding:18px 20px;font-family:Arial,Helvetica,sans-serif;font-size:17px;color:#ffffff">Watchers — test message</td></tr>
    <tr><td style="padding:20px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#232D42">
      If you are reading this, the dashboard can send email.<br><br>
      New notices on the pages you watch will arrive looking like this, grouped by UG and PG, with a one-line summary and a link to each notice.
    </td></tr>
  </table></body></html>`,
    });
    return NextResponse.json({ ok: true, to: me.email });
  } catch (err) {
    return NextResponse.json(safeError(err, "Gmail refused the message"), { status: 502 });
  }
}
