import nodemailer, { type Transporter } from "nodemailer";

// Transactional email via Gmail SMTP. Uses a Gmail / Google Workspace address plus
// an APP PASSWORD (Google Account → Security → 2-Step Verification → App passwords),
// NOT the normal account password. Set:
//   GMAIL_USER=info@goocampus.in
//   GMAIL_APP_PASSWORD=xxxxxxxxxxxxxxxx   (16-char app password, no spaces)
const USER = process.env.GMAIL_USER || "";
const PASS = (process.env.GMAIL_APP_PASSWORD || "").replace(/\s+/g, "");
const FROM_NAME = process.env.GMAIL_FROM_NAME || "GooCampus Dashboard";

export function hasEmail(): boolean {
  return !!(USER && PASS);
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
  if (!hasEmail()) throw new Error("Email is not configured — set GMAIL_USER and GMAIL_APP_PASSWORD.");
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
