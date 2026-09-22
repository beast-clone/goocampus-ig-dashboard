import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { createTask, missingForCreate, type TaskInput } from "@/lib/task-create";
import { requireCapability, requireSection } from "@/lib/api-guard";
import { getSessionUserId } from "@/lib/auth";

// POST /api/marketing-hub/create
// Creates ONE row in mh_posts (Supabase).
//
// Safety: CREATE only. No PATCH/DELETE.

type CreateBody = TaskInput;

export async function POST(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  try {
    const denied = await requireCapability("create_tasks");
    if (denied) return denied;

    const body = (await req.json()) as CreateBody;

    // Completeness gate — same 422 { error, missing, gate } shape the update route
    // uses, so every caller renders the one shared missing-fields popup.
    //
    // Only title + SBU are required HERE. A row with no brand can't be routed,
    // filtered or reported on by anyone, so it must never exist. Publishing date
    // and collaborators are deliberately NOT required at creation — a task is often
    // opened before those are known, and the approve gate in /update already blocks
    // the handoff until they're filled in.
    const missing = missingForCreate(body);
    if (missing.length) {
      return NextResponse.json(
        { error: "Can't create the task — some required fields are missing.", missing, gate: "create" },
        { status: 422 },
      );
    }

    const data = await createTask(body, getSessionUserId() || null, "dashboard-form");

    return NextResponse.json({
      id: data.id,
      fields: {
        Particulars: data.particulars,
        Status: data.status,
        Owner: data.owner_key,
        "Publishing Date": data.publishing_date,
      },
      createdAt: data.created_at,
    });
  } catch (err) {
    return NextResponse.json(safeError(err, "Task creation failed"), { status: 502 });
  }
}
