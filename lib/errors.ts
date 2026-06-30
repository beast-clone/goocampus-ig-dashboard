// Sanitize error messages for client-facing JSON responses.
// Server logs the full error; the client only sees a generic message + a request ID.

import { randomUUID } from "crypto";

const TOKEN_FRAGMENT_RE = /(EAA[\w]{10,}|sb_secret_\w+|sk-proj-[\w-]+|apify_api_[\w]+|pat[\w.]+|sp_sk_\w+|nfp_[\w]+)/g;

export type SafeError = { error: string; ref?: string };

export function safeError(err: unknown, fallbackMessage = "An unexpected error occurred"): SafeError {
  const ref = randomUUID().slice(0, 8);
  const raw = err instanceof Error ? err.message : String(err);
  // Always log full detail server-side for debugging
  console.error(`[err:${ref}]`, err);

  // Only surface short, token-safe messages to the client
  if (!raw) return { error: fallbackMessage, ref };
  const stripped = raw.replace(TOKEN_FRAGMENT_RE, "[redacted]");

  // If the message is suspiciously long, or still looks like a Meta/OpenAI raw error, return a generic one
  if (stripped.length > 200) return { error: fallbackMessage, ref };
  if (/access[_ ]token|app[_ ]secret|api[_ ]key/i.test(stripped)) return { error: "Upstream auth error — check server logs", ref };
  return { error: stripped, ref };
}
