import { eachDayOfInterval, parseISO, format } from "date-fns";

export function mockInsights(accountId: string, from: string, to: string) {
  const days = eachDayOfInterval({ start: parseISO(from), end: parseISO(to) });
  const seed = accountId.length + days.length;
  const series = days.map((d, i) => {
    const base = 1000 + (seed * 17) + i * 30;
    return {
      date: format(d, "MMM d"),
      followers: base + Math.round(Math.sin(i / 3) * 80),
      reach: 5000 + (seed * 50) + Math.round(Math.sin(i / 2) * 1500) + i * 100,
      engagement: 400 + Math.round(Math.cos(i / 2) * 120) + i * 8,
    };
  });
  const last = series[series.length - 1];
  const first = series[0];
  const pct = (a: number, b: number) => (b === 0 ? 0 : ((a - b) / b) * 100);

  return {
    totals: {
      followers: last.followers,
      reach: series.reduce((s, x) => s + x.reach, 0),
      engagement: series.reduce((s, x) => s + x.engagement, 0),
      profileVisits: Math.round(series.reduce((s, x) => s + x.engagement, 0) * 0.35),
    },
    deltas: {
      followers: pct(last.followers, first.followers),
      reach: pct(last.reach, first.reach),
      engagement: pct(last.engagement, first.engagement),
      profileVisits: pct(last.engagement, first.engagement) * 0.8,
    },
    series,
    latestPost: {
      id: "demo-1",
      caption: "Placeholder caption — real captions will load once Airtable + Meta Graph API are connected.",
      mediaUrl: "",
      permalink: "https://instagram.com",
      type: "REEL" as const,
      timestamp: new Date().toISOString(),
      likes: 1284, comments: 92, shares: 47, saves: 218, reach: 18420, views: 27300,
    },
  };
}
