// Reset a dashboard user's personal password from the terminal.
//
//   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/set-password.ts info@goocampus.in
//
// Asks for the new password twice with typing hidden, then stores only its hash in
// ind_users.password_hash (same hashing the Change-password screen uses). The
// password is never printed, logged or sent anywhere else. For when someone is
// locked out and no admin can use the dashboard's own reset.
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { getSupabase } from "@/lib/supabase";
import { hashPassword } from "@/lib/passwords";

const MIN_LEN = 8; // same rule as /api/account/change-password

function askHidden(question: string): Promise<string> {
  let muted = false;
  const out = new Writable({ write(chunk, _enc, cb) { if (!muted) process.stdout.write(chunk); cb(); } });
  const rl = createInterface({ input: process.stdin, output: out, terminal: true });
  return new Promise((resolve) => {
    rl.question(question, (answer) => { rl.close(); process.stdout.write("\n"); resolve(answer); });
    muted = true;
  });
}

(async () => {
  const email = (process.argv[2] || "").trim().toLowerCase();
  if (!email) { console.error("Usage: set-password.ts <email>"); process.exit(1); }

  const sb = getSupabase();
  if (!sb) { console.error("Supabase isn't configured (run with --env-file=.env.local)."); process.exit(1); }

  const { data: user, error } = await sb.from("ind_users").select("id, name, email").ilike("email", email).maybeSingle();
  if (error) { console.error(`Couldn't read users: ${error.message}`); process.exit(1); }
  if (!user) { console.error(`No dashboard user with the email ${email}.`); process.exit(1); }

  console.log(`Setting a new password for ${user.name || user.id} (${user.email}).`);
  const first = await askHidden("New password: ");
  if (first.length < MIN_LEN) { console.error(`Too short — at least ${MIN_LEN} characters. Nothing changed.`); process.exit(1); }
  const second = await askHidden("Type it again: ");
  if (first !== second) { console.error("The two didn't match. Nothing changed."); process.exit(1); }

  const { error: upErr } = await sb.from("ind_users").update({ password_hash: hashPassword(first) }).eq("id", user.id);
  if (upErr) { console.error(`Couldn't save: ${upErr.message}`); process.exit(1); }
  console.log("Done. Sign in with the new password (and update the one Chrome has saved).");
})();
