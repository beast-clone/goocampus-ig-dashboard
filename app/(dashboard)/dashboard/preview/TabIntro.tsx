"use client";
import { useEffect, useState } from "react";
import { IconBulb, IconX, IconCheck } from "@tabler/icons-react";

type Intro = { title: string; body: string; points?: string[] };
type State = { seen: string[]; always: boolean; intro: Intro | null };

// The "what is this tab" card that sits above a tab the first time you open it.
//
// Rendered once by PreviewDashboardShell rather than added to each page: the
// shell already knows which tab is active, so every tab gets one for free and a
// new tab cannot forget to include it.
//
// Renders nothing at all until the state is known. Showing the card and then
// yanking it away a moment later — for someone who dismissed it last week — is
// worse than it appearing a beat late.
export function TabIntro({ tab }: { tab: string }) {
  const [state, setState] = useState<State | null>(null);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState(null);
    fetch(`/api/onboarding?tab=${encodeURIComponent(tab)}`, { credentials: "same-origin" })
      .then((r) => r.json())
      .then((d: State) => { if (!cancelled) setState(d); })
      // If this fails, say nothing. An intro is a nicety; a red error where the
      // explanation should be would be worse than no explanation.
      .catch(() => { if (!cancelled) setState({ seen: [tab], always: false, intro: null }); });
    return () => { cancelled = true; };
  }, [tab]);

  if (!state?.intro) return null;
  if (closing) return null;
  if (!state.always && state.seen.includes(tab)) return null;

  const save = (body: Record<string, unknown>) =>
    fetch("/api/onboarding", {
      method: "POST", headers: { "Content-Type": "application/json" },
      credentials: "same-origin", body: JSON.stringify(body),
    }).catch(() => {});

  const dismiss = () => {
    setClosing(true);          // close immediately; the write can land late
    save({ tab });
  };

  const toggleAlways = (next: boolean) => {
    setState((s) => (s ? { ...s, always: next } : s));
    save({ always: next });
  };

  const { intro } = state;
  return (
    <div className="relative rounded-2xl border border-brand/20 bg-brand-light px-5 py-4 mb-4">
      <button
        onClick={dismiss}
        aria-label="Close"
        className="absolute top-3 right-3 text-brand/50 hover:text-brand rounded-lg p-1 hover:bg-white/60"
      >
        <IconX size={16} stroke={2} />
      </button>

      <div className="flex items-start gap-3 pr-8">
        <span className="w-8 h-8 rounded-lg bg-brand text-white grid place-items-center shrink-0">
          <IconBulb size={17} stroke={1.8} />
        </span>
        <div className="min-w-0">
          <h2 className="text-[14.5px] font-medium text-[#232D42]">{intro.title}</h2>
          <p className="text-[13px] leading-relaxed text-[#2138B0] mt-1 max-w-[80ch]">{intro.body}</p>

          {intro.points && intro.points.length > 0 && (
            <ul className="mt-2.5 flex flex-col gap-1.5">
              {intro.points.map((p) => (
                <li key={p} className="flex items-start gap-2 text-[12.5px] text-[#2138B0]">
                  <IconCheck size={14} stroke={2.2} className="text-brand mt-[2px] shrink-0" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center gap-4 mt-3.5 flex-wrap">
            <button
              onClick={dismiss}
              className="text-[12.5px] font-medium bg-brand text-white rounded-lg px-3.5 py-1.5 hover:bg-brand-dark"
            >
              Got it
            </button>
            <label className="flex items-center gap-2 text-[12px] text-[#2138B0] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={state.always}
                onChange={(e) => toggleAlways(e.target.checked)}
                className="w-[14px] h-[14px] accent-[#3A57E8]"
              />
              Show these every time I open a tab
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
