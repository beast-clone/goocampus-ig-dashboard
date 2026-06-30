// Hardened fetch wrapper — every upstream call (Meta, Apify, OpenAI, HikerAPI,
// SendPulse, Supabase REST) should go through this so one hung connection can't
// freeze a route forever.
//
// Default timeout is 30s — generous enough for paginated Meta calls + OpenAI
// reasoning. Override per-call when you know the budget is tighter (e.g. inbox
// reply should fail fast at 10s).

export const DEFAULT_TIMEOUT_MS = 30_000;

export class FetchTimeoutError extends Error {
  constructor(public url: string, public timeoutMs: number) {
    super(`Upstream request timed out after ${timeoutMs}ms`);
    this.name = "FetchTimeoutError";
  }
}

export async function fetchWithTimeout(
  input: string | URL,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...rest, signal: controller.signal });
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") {
      throw new FetchTimeoutError(String(input), timeoutMs);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
