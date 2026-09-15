import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { readOnboarding, writeOnboarding, EMPTY_STATE, TAB_INTRO } from "@/lib/onboarding";
import { safeError } from "@/lib/errors";

// Which tab intros this person has dismissed, and whether they want them shown
// every time anyway.
//
//   GET                       → { seen, always, intro }   (intro = copy for ?tab=)
//   POST { tab }              → mark that tab's intro as dismissed
//   POST { always: boolean }  → show every intro every visit, or stop
//   POST { reset: true }      → clear everything, so all intros come back
//
// No section guard: an intro explains a tab the person can already open, and the
// state is scoped to their own session either way.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const userId = getSessionUserId();
    const tab = new URL(req.url).searchParams.get("tab") || "";
    const intro = TAB_INTRO[tab] ?? null;
    // An identity-less legacy session has nowhere to store a preference, so it
    // just never sees intros rather than seeing them on every single load.
    if (!userId) return NextResponse.json({ ...EMPTY_STATE, seen: [tab], intro });
    const state = await readOnboarding(userId);
    return NextResponse.json({ ...state, intro });
  } catch (err) {
    return NextResponse.json(safeError(err, "Could not read onboarding state"), { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const userId = getSessionUserId();
    if (!userId) return NextResponse.json({ ok: false, error: "No session" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as { tab?: string; always?: boolean; reset?: boolean };
    if (body.reset === true) {
      const ok = await writeOnboarding(userId, EMPTY_STATE);
      return NextResponse.json({ ok, ...EMPTY_STATE });
    }

    const state = await readOnboarding(userId);
    if (typeof body.always === "boolean") state.always = body.always;
    if (typeof body.tab === "string" && body.tab && !state.seen.includes(body.tab)) {
      state.seen.push(body.tab);
    }
    const ok = await writeOnboarding(userId, state);
    return NextResponse.json({ ok, ...state });
  } catch (err) {
    return NextResponse.json(safeError(err, "Could not save onboarding state"), { status: 500 });
  }
}
