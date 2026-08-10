import { NextRequest, NextResponse } from "next/server";
import { requireAdminContext } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

/**
 * Platform announcements, from the admin panel.
 *
 * Written straight to Supabase from the browser before, which the cafés' ISP
 * blocks.
 */

const ALLOWED_FIELDS = new Set([
  "title",
  "message",
  "type",
  "target_audience",
  "expires_at",
  "is_active",
]);

function pick(updates: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updates || {})) {
    if (ALLOWED_FIELDS.has(key)) safe[key] = value;
  }
  return safe;
}

/** POST /api/admin/announcements — body: { announcement } */
export async function POST(request: NextRequest) {
  const { context, response } = await requireAdminContext(request);
  if (response) return response;

  const body = await request.json().catch(() => ({}));
  const safe = pick(body.announcement || body);

  if (!String(safe.title || "").trim() || !String(safe.message || "").trim()) {
    return NextResponse.json({ error: "A title and message are required" }, { status: 400 });
  }

  const { data, error } = await context.supabase
    .from("platform_announcements")
    .insert({ ...safe, is_active: safe.is_active !== false })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ announcement: data }, { status: 201 });
}

/** PUT /api/admin/announcements — body: { id, updates } */
export async function PUT(request: NextRequest) {
  const { context, response } = await requireAdminContext(request);
  if (response) return response;

  const { id, updates } = await request.json().catch(() => ({}));

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const safe = pick(updates || {});
  if (Object.keys(safe).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { error } = await context.supabase
    .from("platform_announcements")
    .update(safe)
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

/** DELETE /api/admin/announcements — body: { id } */
export async function DELETE(request: NextRequest) {
  const { context, response } = await requireAdminContext(request);
  if (response) return response;

  const { id } = await request.json().catch(() => ({}));
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const { error } = await context.supabase
    .from("platform_announcements")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
