"use client";
import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";

type Story = { id: string; caption: string; mediaUrl: string; permalink: string; timestamp: string };

export default function StoriesPage() {
  return (
    <DashboardShell title="Stories">
      {({ accountId }) => <StoriesView accountId={accountId} />}
    </DashboardShell>
  );
}

function StoriesView({ accountId }: { accountId: string }) {
  const [stories, setStories] = useState<Story[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStories(null); setError(null);
    fetch(`/api/posts?accountId=${accountId}&limit=50&insights=false`)
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setStories((d.posts ?? []).filter((p: { type: string }) => p.type === "STORY"))))
      .catch((e) => setError(String(e)));
  }, [accountId]);

  return (
    <>
      <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 mb-6 text-sm">
        ⚠️ <strong>Stories expire from Meta's API 24 hours after posting.</strong> To capture historical story metrics, we need an n8n webhook subscribed to <code>story_insights</code> that writes them to Airtable before they expire. Until that's wired up, this tab only shows currently-active stories.
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-3 text-sm">Couldn’t load: {error}</div>}
      {!stories && !error && <div className="text-sm text-gray-500">Loading…</div>}
      {stories && stories.length === 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <div className="text-4xl mb-3">📭</div>
          <div className="text-sm font-medium">No active stories right now</div>
          <div className="text-xs text-gray-500 mt-1">Once n8n webhook capture is set up, expired stories will appear here too.</div>
        </div>
      )}
      {stories && stories.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {stories.map((s) => (
            <a key={s.id} href={s.permalink} target="_blank" className="aspect-[9/16] bg-gray-100 rounded-xl overflow-hidden hover:ring-2 hover:ring-brand">
              {s.mediaUrl && <img src={s.mediaUrl} alt="" className="w-full h-full object-cover" />}
            </a>
          ))}
        </div>
      )}
    </>
  );
}
