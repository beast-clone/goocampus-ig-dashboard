"use client";
import { IconLink } from "@tabler/icons-react";
import { showToast } from "./Toast";

// Copy a link to a task or post, to paste in WhatsApp or Slack (Praveen, 30 Oct: "wherever
// it needs to be shared"). `path` is site-relative (made absolute) or a full URL.
export const taskLinkPath = (id: string) => `/dashboard/preview/marketing-hub?tab=master&open=${encodeURIComponent(id)}`;
export const postLinkPath = (id: string) => `/dashboard/preview/scheduler?post=${encodeURIComponent(id)}`;

export async function copyLink(path: string) {
  const url = /^https?:\/\//.test(path) ? path : `${window.location.origin}${path}`;
  try { await navigator.clipboard.writeText(url); showToast({ who: "Link copied", body: "Anyone on the team can open it with this link.", av: "✓" }); }
  catch { window.prompt("Copy this link:", url); }
}

/** `iconOnly` for tight rows; otherwise an outlined "Copy link" button. */
export function CopyLink({ path, iconOnly, className = "" }: { path: string; iconOnly?: boolean; className?: string }) {
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); void copyLink(path); }} title="Copy a link to this — paste it in WhatsApp or Slack"
      className={`flex items-center justify-center gap-1.5 font-medium text-[#4A5468] border border-gray-200 rounded-lg hover:border-brand hover:text-brand ${iconOnly ? "w-8 h-8" : "text-sm px-3 py-2"} ${className}`}>
      <IconLink size={15} stroke={1.9} />{iconOnly ? null : "Copy link"}
    </button>
  );
}
