"use client";
import useSWR, { type SWRConfiguration } from "swr";

// Shared JSON fetcher. Called with either a string URL or a [url, init] tuple.
// Handles auth failures by throwing a labelled error so SWR surfaces it cleanly
// rather than trying to parse HTML as JSON (which would blow up the UI).
async function fetcher<T = unknown>(input: string | [string, RequestInit]): Promise<T> {
  const [url, init] = typeof input === "string" ? [input, undefined] : input;
  const res = await fetch(url, init);
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(`Non-JSON response (${res.status}) — likely an auth redirect or 404`);
  }
  const json = await res.json();
  if (!res.ok) throw new Error((json as { error?: string })?.error || `HTTP ${res.status}`);
  return json as T;
}

// Defaults geared for a live analytics dashboard:
//   dedupingInterval — collapses back-to-back identical requests (tab switches, remounts)
//   revalidateOnFocus — refresh when the user returns from another tab/window
//   revalidateIfStale — keep showing cached data while a background refresh runs
//   errorRetryCount — don't hammer Meta on repeated failures
const DEFAULT_CONFIG: SWRConfiguration = {
  dedupingInterval: 60_000,       // 60s — a repeat click within a minute uses the cache
  revalidateOnFocus: true,
  revalidateIfStale: true,
  errorRetryCount: 2,
  errorRetryInterval: 3000,
  keepPreviousData: true,          // don't flash "loading" when navigating between similar keys
};

/**
 * Wrapper around useSWR with sensible defaults for this dashboard.
 * Pass `null` as the key to skip the request (e.g. while inputs are being prepared).
 */
export function useApi<T = unknown>(
  key: string | null,
  config?: SWRConfiguration,
) {
  const swr = useSWR<T>(key, fetcher as (k: string) => Promise<T>, { ...DEFAULT_CONFIG, ...config });
  return {
    data: swr.data,
    error: swr.error as Error | undefined,
    isLoading: swr.isLoading,
    isValidating: swr.isValidating,
    refresh: () => swr.mutate(),
    mutate: swr.mutate,
  };
}
