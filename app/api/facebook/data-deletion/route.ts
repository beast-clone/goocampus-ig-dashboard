// Meta Data Deletion Callback.
// Configured in the app dashboard as: https://<host>/api/facebook/data-deletion
//
// Meta POSTs form-encoded `signed_request` from its own servers, so this route
// is deliberately public (see PUBLIC_API_ROUTES in middleware.ts) — the request
// authenticates itself via an HMAC signed with META_APP_SECRET, not a cookie.
import { NextResponse } from "next/server";
import { parseSignedRequest, deleteUserData } from "@/lib/fb-deletion";

// Reads request headers/body, so it can never be statically rendered.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) {
    return NextResponse.json({ error: "Server not configured (META_APP_SECRET missing)" }, { status: 500 });
  }

  // Meta sends application/x-www-form-urlencoded, but accept JSON too so the
  // endpoint can be exercised by hand without crafting a form body.
  let signed = "";
  const contentType = req.headers.get("content-type") || "";
  try {
    if (contentType.includes("application/json")) {
      const body = (await req.json()) as { signed_request?: string };
      signed = body.signed_request || "";
    } else {
      const form = await req.formData();
      signed = String(form.get("signed_request") || "");
    }
  } catch {
    return NextResponse.json({ error: "Malformed request body" }, { status: 400 });
  }

  if (!signed) return NextResponse.json({ error: "Missing signed_request" }, { status: 400 });

  const parsed = parseSignedRequest(signed, appSecret);
  if (!parsed) return NextResponse.json({ error: "Invalid signed_request" }, { status: 400 });

  const record = await deleteUserData(parsed.user_id);

  // Meta expects exactly these two fields, and shows the URL to the person who
  // asked so they can confirm the deletion actually happened.
  const origin = new URL(req.url).origin;
  return NextResponse.json({
    url: `${origin}/data-deletion?code=${record.confirmation_code}`,
    confirmation_code: record.confirmation_code,
  });
}

// Meta's automated checker sometimes GETs the callback to see that it is alive.
export function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "Meta data deletion callback",
    usage: "POST signed_request (form-encoded) from Meta",
  });
}
