// Single source of truth: which brand has which platform CONNECTED to the
// dashboard. Profile mode grays out (never navigates to) platforms a brand
// doesn't have, so one brand's numbers can never appear inside another's
// profile. Update here when a new page/channel gets connected.

// Dashboard account id → LinkedIn page key. Both live: the same member token
// (info@goocampus) is Super Admin of BOTH pages — main GooCampus (org 3358713)
// and World (org 107157863). Each resolves via its own LINKEDIN_ORG_URN_* env var
// (LINKEDIN_ORG_URN_GOOCAMPUS / LINKEDIN_ORG_URN_GCWORLD); both must be set for the
// data to be correct.
export const LI_PAGE: Record<string, string | null> = {
  goocampus: "goocampus",
  goocampusworld: "gcworld",
  "12thplusdotcom": null,
  samvaya_matrimony: null,
};

// Dashboard account id → YouTube channel key.
// NOTE (Maheen, 2026-07-12): GooCampus World has NO YouTube channel. The
// "Study Abroad" channel is a separate GooCampus channel — reachable via the
// channel switcher/pills in MAIN mode only, attached to no brand profile.
export const YT_CHANNEL: Record<string, string | null> = {
  goocampus: "goocampus",
  goocampusworld: null,
  "12thplusdotcom": "twelfthplus",
  samvaya_matrimony: null,
};

// All YouTube channels — pills shown on YouTube pages in MAIN mode only.
export const YT_CHANNEL_PILLS = [
  { key: "goocampus", label: "GooCampus" },
  { key: "twelfthplus", label: "12thplus" },
  // Study Abroad (goocampusworld) removed — nothing is published there.
];

export type PlatformKey = "instagram" | "facebook" | "linkedin" | "youtube";

// Every brand has an Instagram account + a Facebook page connected.
export function hasPlatform(accountId: string, platform: PlatformKey): boolean {
  if (platform === "instagram" || platform === "facebook") return true;
  if (platform === "linkedin") return !!LI_PAGE[accountId];
  if (platform === "youtube") return !!YT_CHANNEL[accountId];
  return false;
}
