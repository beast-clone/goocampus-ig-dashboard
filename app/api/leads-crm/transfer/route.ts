import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { requireSection } from "@/lib/api-guard";
import { getSessionUserId } from "@/lib/auth";
import { createTransferRequest, airtableList, TRANSFER_TABLE, pickName } from "@/lib/sales-hub";
import { getCounsellorRoster, pickUser } from "@/lib/lead-assignment";

// Revoke & reassign a lead.
//
//   GET  /api/leads-crm/transfer            → the 50 most recent requests + roster
//   POST /api/leads-crm/transfer            → raise ONE request
//        { leadId, toUserId, fromUserId?, notes }
//
// The POST does NOT move the lead. It appends a "Pending" row to the Transfer
// Ownership table with Confirm Transfer unticked — the same row the team creates
// by hand today. A human ticks the box in Airtable and the base's own automation
// performs the reassignment. That's the approved boundary: the dashboard never
// edits a CRM record. See the header of lib/sales-hub.ts.

export async function GET() {
  const denied = await requireSection("sales");
  if (denied) return denied;
  try {
    const [rows, roster] = await Promise.all([
      airtableList<Record<string, unknown>>(TRANSFER_TABLE, {
        fields: ["Request ID", "Full name", "Original Counsellor (Manual)", "New Owner", "Transfer Notes", "Confirm Transfer", "Status", "Created Date"],
        sort: [{ field: "Created Date", direction: "desc" }],
        pageSize: 50,
        maxRecords: 50,
      }),
      getCounsellorRoster(),
    ]);
    const requests = rows.map((r) => ({
      id: r.id,
      requestId: r.fields["Request ID"] ?? null,
      lead: pickName(r.fields["Full name"]),
      from: pickUser(r.fields["Original Counsellor (Manual)"])?.name || "",
      to: pickUser(r.fields["New Owner"])?.name || "",
      notes: pickName(r.fields["Transfer Notes"]),
      confirmed: r.fields["Confirm Transfer"] === true,
      status: pickName(r.fields["Status"]) || "Pending",
      createdAt: pickName(r.fields["Created Date"]),
    }));
    return NextResponse.json({ requests, roster });
  } catch (err) {
    return NextResponse.json(safeError(err, "Could not load transfer requests"), { status: 502 });
  }
}

export async function POST(req: Request) {
  const denied = await requireSection("sales");
  if (denied) return denied;

  try {
    const body = (await req.json()) as {
      leadId?: string; leadIds?: string[]; toUserId?: string; fromUserId?: string; notes?: string; leadName?: string;
    };

    // Bulk path — the Transfer tab hands over a whole selection at once. Each lead
    // still becomes its own Pending row, so a partial failure leaves the rest valid
    // and nothing is half-applied.
    if (Array.isArray(body.leadIds)) {
      const ids = body.leadIds.filter((x) => typeof x === "string");
      const missing: string[] = [];
      if (ids.length === 0) missing.push("At least one lead to reassign");
      if (!body.toUserId) missing.push("A counsellor to reassign them to");
      if (!body.notes || !body.notes.trim()) missing.push("A reason (it goes into Transfer Notes)");
      if (missing.length) {
        return NextResponse.json({ error: "Can't raise the transfers — some required fields are missing.", missing, gate: "create" }, { status: 422 });
      }
      // A cap, not a limit of the API: 200 rows is already a very large manual
      // action, and an accidental select-all over months shouldn't fire thousands.
      if (ids.length > 200) {
        return NextResponse.json({ error: `That's ${ids.length} leads. Narrow the range — 200 is the most that can go in one go.` }, { status: 400 });
      }

      const actorBulk = getSessionUserId();
      const noteBulk = actorBulk ? `${body.notes!.trim()} — raised by ${actorBulk} via dashboard` : body.notes!.trim();
      const results = await Promise.allSettled(ids.map((id) =>
        createTransferRequest({ leadRecordId: id, toUserId: body.toUserId!, fromUserId: body.fromUserId || undefined, notes: noteBulk })));

      const ok = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.filter((r) => r.status === "rejected");
      return NextResponse.json({
        ok: failed.length === 0,
        requested: ok,
        failed: failed.length,
        firstError: failed.length ? String((failed[0] as PromiseRejectedResult).reason).slice(0, 200) : null,
        pending: true,
        message: `${ok} transfer request${ok === 1 ? "" : "s"} raised. They move once the Airtable/n8n step runs.`,
      }, { status: failed.length && !ok ? 502 : 200 });
    }

    // Completeness gate — same 422 { error, missing, gate } shape the rest of the
    // dashboard uses, so the UI can list what's missing instead of a vague error.
    const missing: string[] = [];
    if (!body.leadId) missing.push("The lead to reassign");
    if (!body.toUserId) missing.push("A counsellor to reassign it to");
    if (!body.notes || !body.notes.trim()) missing.push("A reason (it goes into Transfer Notes)");
    if (missing.length) {
      return NextResponse.json(
        { error: "Can't raise the transfer — some required fields are missing.", missing, gate: "create" },
        { status: 422 },
      );
    }
    if (body.fromUserId && body.fromUserId === body.toUserId) {
      return NextResponse.json({ error: "That lead is already with this counsellor." }, { status: 400 });
    }

    // Attribute the request to whoever is signed in — "Requested by" in Airtable is
    // a createdBy field, so it would otherwise read as the API token's owner.
    const actor = getSessionUserId();
    const notes = actor ? `${body.notes!.trim()} — raised by ${actor} via dashboard` : body.notes!.trim();

    const result = await createTransferRequest({
      leadRecordId: body.leadId!,
      toUserId: body.toUserId!,
      fromUserId: body.fromUserId || undefined,
      notes,
    });

    return NextResponse.json({
      ok: true,
      id: result.id,
      requestId: result.requestId ?? null,
      pending: true,
      message: "Transfer requested. It moves once someone ticks Confirm Transfer in Airtable.",
    });
  } catch (err) {
    return NextResponse.json(safeError(err, "Could not raise the transfer request"), { status: 502 });
  }
}
