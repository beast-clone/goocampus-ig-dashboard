import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { safeError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase";

// POST /api/marketing-hub/attach
// multipart/form-data:
//   postId:       string (required)
//   uploadedBy:   member key (required)
//   file:         File   (required)
//
// Uploads to the scheduler-media bucket under mh-creatives/<postId>/<uuid>-<filename>,
// then inserts a row into mh_attachments and returns it.

const VALID_KEYS = new Set(["manya", "praveen", "nikhil", "nandu", "maheen"]);
const MAX_MB = 25;

export async function POST(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  try {
    const form = await req.formData();
    const postId = form.get("postId");
    const uploadedBy = form.get("uploadedBy");
    const file = form.get("file");
    const kind = form.get("kind") === "reference" ? "reference" : "creative";

    if (typeof postId !== "string" || !postId) return NextResponse.json({ error: "postId required" }, { status: 400 });
    if (typeof uploadedBy !== "string" || !VALID_KEYS.has(uploadedBy)) {
      return NextResponse.json({ error: "uploadedBy must be manya|praveen|nikhil|nandu|maheen" }, { status: 400 });
    }
    if (!(file instanceof File)) return NextResponse.json({ error: "file required" }, { status: 400 });
    if (file.size > MAX_MB * 1024 * 1024) return NextResponse.json({ error: `file exceeds ${MAX_MB}MB` }, { status: 413 });

    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

    // postId lands in the storage key — must be a UUID (blocks path traversal and
    // catches bad ids BEFORE the file is uploaded and orphaned).
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(postId))) {
      return NextResponse.json({ error: "postId must be a valid task id" }, { status: 400 });
    }
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const objectPath = `mh-creatives/${postId}/${Date.now()}-${safeName}`;

    const buf = Buffer.from(await file.arrayBuffer());
    const up = await sb.storage.from("scheduler-media").upload(objectPath, buf, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
    if (up.error) throw new Error(`upload: ${up.error.message}`);

    const publicUrl = sb.storage.from("scheduler-media").getPublicUrl(objectPath).data.publicUrl;

    const { data, error } = await sb
      .from("mh_attachments")
      .insert({
        post_id: postId,
        filename: file.name,
        storage_path: publicUrl,
        mime_type: file.type || null,
        size_bytes: file.size,
        uploaded_by: uploadedBy,
        kind,
      })
      .select("id, filename, storage_path, mime_type, size_bytes, uploaded_by, uploaded_at, kind")
      .single();

    if (error) throw new Error(`db insert: ${error.message}`);

    // Log to the task Activity feed so an upload is visible there.
    await sb.from("mh_activity").insert({
      post_id: postId,
      actor_key: uploadedBy,
      action: kind === "reference" ? "reference_added" : "creative_added",
      to_value: file.name,
    });

    return NextResponse.json({ attachment: data });
  } catch (err) {
    return NextResponse.json(safeError(err, "Upload failed"), { status: 502 });
  }
}

// DELETE /api/marketing-hub/attach?id=<uuid>
// Removes the storage object AND the mh_attachments row.
export async function DELETE(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

    const row = await sb.from("mh_attachments").select("storage_path, post_id, filename, kind").eq("id", id).single();
    if (row.error) throw new Error(row.error.message);

    const publicUrl: string = row.data.storage_path;
    const marker = "/scheduler-media/";
    const idx = publicUrl.indexOf(marker);
    if (idx >= 0) {
      const objectPath = publicUrl.slice(idx + marker.length);
      await sb.storage.from("scheduler-media").remove([objectPath]);
    }

    const { error } = await sb.from("mh_attachments").delete().eq("id", id);
    if (error) throw new Error(error.message);

    // Log the removal to the task Activity feed.
    await sb.from("mh_activity").insert({
      post_id: row.data.post_id,
      action: row.data.kind === "reference" ? "reference_removed" : "creative_removed",
      to_value: row.data.filename,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(safeError(err, "Delete failed"), { status: 502 });
  }
}
