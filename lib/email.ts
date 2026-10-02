import nodemailer, { type Transporter } from "nodemailer";
import { hasGmailApi, gmailSender, sendViaGmail } from "@/lib/gmail-api";

// Every email the dashboard sends goes through sendMail below, which has two ways
// out and prefers the first:
//
//  1. The Gmail API, on the same Google OAuth client as "Sign in with Google",
//     connected from the Watchers tab. Nothing to create, nothing to store in an
//     env var, and it can be revoked from the Google account like any other app.
//
//  2. Gmail SMTP with an APP PASSWORD (Google Account → Security → 2-Step
//     Verification → App passwords) — NOT the normal account password:
//       GMAIL_USER=info@goocampus.in
//       GMAIL_APP_PASSWORD=xxxxxxxxxxxxxxxx   (16 chars, no spaces)
const USER = process.env.GMAIL_USER || "";
const PASS = (process.env.GMAIL_APP_PASSWORD || "").replace(/\s+/g, "");
const FROM_NAME = process.env.GMAIL_FROM_NAME || "GooCampus Dashboard";

// Async because the connected account lives in Supabase, not in the environment.
export async function hasEmail(): Promise<boolean> {
  if (await hasGmailApi()) return true;
  return !!(USER && PASS);
}

// Which address mail goes out as, and by which route — for the UI to say so
// plainly instead of a bare green tick.
export async function emailStatus(): Promise<{ ok: boolean; via: "gmail" | "smtp" | null; from: string | null }> {
  if (await hasGmailApi()) return { ok: true, via: "gmail", from: await gmailSender() };
  if (USER && PASS) return { ok: true, via: "smtp", from: USER };
  return { ok: false, via: null, from: null };
}

let transporter: Transporter | null = null;
function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: USER, pass: PASS },
    });
  }
  return transporter;
}

export async function sendMail({ to, subject, text, html }: { to: string; subject: string; text?: string; html?: string }): Promise<void> {
  // The connected account wins when there is one, so switching from an app
  // password to the Gmail API needs no change at any call site.
  if (await hasGmailApi()) return sendViaGmail({ to, subject, text, html, fromName: FROM_NAME });
  if (!(USER && PASS)) throw new Error("No email account is connected — connect Gmail from the Watchers tab, or set GMAIL_USER and GMAIL_APP_PASSWORD.");
  await getTransporter().sendMail({
    from: `"${FROM_NAME}" <${USER}>`,
    to,
    subject,
    text,
    html,
  });
}

// Mask an email for display in API responses / the UI (never echo the full address).
export function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!domain) return email;
  const shown = name.length <= 2 ? name[0] : name.slice(0, 2);
  return `${shown}${"*".repeat(Math.max(1, name.length - shown.length))}@${domain}`;
}
