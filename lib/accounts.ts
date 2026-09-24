export type PlatformKey = "instagram" | "facebook" | "linkedin" | "youtube";

export type IGAccount = {
  id: string;
  handle: string;
  label: string;
  igUserId?: string;
  // Which platform tabs this brand actually has a connected channel for.
  // Omitted = all four (the long-standing GooCampus brands). Anything listed
  // here is a whitelist: tabs outside it are not offered, because several
  // platform clients fall back to DEMO data for an unknown account and that
  // demo would read as the brand's real numbers.
  platforms?: PlatformKey[];
};

export const ACCOUNTS: IGAccount[] = [
  { id: "goocampus", handle: "@goocampus", label: "GooCampus", igUserId: "17841407196182440" },
  { id: "goocampusworld", handle: "@goocampusworld", label: "GooCampus World", igUserId: "17841473429363077" },
  { id: "12thplusdotcom", handle: "@12thplusdotcom", label: "12thPlus.com", igUserId: "17841451240960832" },
  // Samvaya is a separate business, but Maheen and Nandu both asked for its
  // dashboards (comments, 22 Sep). It was pulled out previously because it had
  // no token and showed mock data as "live" — it now has a working page token,
  // verified live against the Graph API. Instagram and Facebook only: Samvaya
  // has no LinkedIn org and no YouTube channel in lib/youtube-channels.ts, and
  // YouTube serves demo data for unknown channels.
  { id: "samvaya_matrimony", handle: "@samvaya_matrimony", label: "Samvaya Matrimony", igUserId: "17841444879120174", platforms: ["instagram", "facebook"] },
];

export const DEFAULT_ACCOUNT_ID = "goocampus";
