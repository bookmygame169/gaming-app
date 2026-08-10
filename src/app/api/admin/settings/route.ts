import { NextRequest, NextResponse } from "next/server";
import { requireAdminContext } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

/**
 * The admin's own sign-in credentials.
 *
 * These were sent from the browser straight into profiles, which the cafés' ISP
 * blocks — and which meant the row that governs admin access was writable by
 * whatever the page happened to put in the request.
 *
 * Two things this route does not fix, both worth knowing:
 *
 * 1. admin_password is stored as plain text, because verify_admin_login
 *    compares it with `p.admin_password = p_password`. Hashing it means
 *    changing that function and migrating the existing values in the same
 *    breath — get it wrong and nobody can sign in to the admin panel — so it
 *    is deliberately a separate, staged change rather than a side effect of
 *    moving this endpoint.
 *
 * 2. Only the caller's own credentials can be changed here. An admin resetting
 *    another admin's password is a different operation with different rules.
 */
export async function PUT(request: NextRequest) {
  const { context, response } = await requireAdminContext(request);
  if (response) return response;

  const { currentPassword, newUsername, newPassword } = await request
    .json()
    .catch(() => ({}));

  if (!newUsername && !newPassword) {
    return NextResponse.json(
      { error: "Enter a new username or password" },
      { status: 400 }
    );
  }

  if (newPassword && String(newPassword).length < 6) {
    return NextResponse.json(
      { error: "Password must be at least 6 characters" },
      { status: 400 }
    );
  }

  const supabase = context.supabase;

  // Re-checked here rather than only in the page. A session cookie is enough to
  // reach this route, so without this an unattended logged-in browser is enough
  // to take the account over.
  const { data: current, error: readError } = await supabase
    .from("profiles")
    .select("admin_password")
    .eq("id", context.adminId)
    .maybeSingle();

  if (readError) {
    return NextResponse.json({ error: "Could not verify your password" }, { status: 500 });
  }

  if (!current?.admin_password || current.admin_password !== currentPassword) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 403 });
  }

  const updates: Record<string, string> = {};
  if (newUsername) updates.admin_username = String(newUsername).trim();
  if (newPassword) updates.admin_password = String(newPassword);

  const { error } = await supabase.from("profiles").update(updates).eq("id", context.adminId);

  if (error) {
    // 23505 is the unique index on admin_username.
    if (error.code === "23505") {
      return NextResponse.json({ error: "That username is already taken." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
