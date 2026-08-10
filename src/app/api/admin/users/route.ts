import { NextRequest, NextResponse } from "next/server";
import { requireAdminContext } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

/**
 * User roles and removal, from the admin panel.
 *
 * Written straight to Supabase from the browser before, which the cafés' ISP
 * blocks. Moving it here is also where the two guards below can exist at all —
 * the browser had no way to know who was making the request, so nothing stopped
 * an admin demoting or deleting their own account and locking themselves out of
 * the panel they were standing in.
 */

const ALLOWED_ROLES = new Set(["user", "owner", "admin", "super_admin"]);

/** PUT /api/admin/users — body: { userId, role } */
export async function PUT(request: NextRequest) {
  const { context, response } = await requireAdminContext(request);
  if (response) return response;

  const { userId, role } = await request.json().catch(() => ({}));

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  if (!ALLOWED_ROLES.has(role)) {
    return NextResponse.json({ error: `Unknown role: ${role}` }, { status: 400 });
  }

  if (userId === context.adminId && role !== context.role) {
    return NextResponse.json(
      { error: "You cannot change your own role — ask another admin." },
      { status: 400 }
    );
  }

  const { error } = await context.supabase
    .from("profiles")
    .update({ role })
    .eq("id", userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

/** DELETE /api/admin/users — body: { userId } */
export async function DELETE(request: NextRequest) {
  const { context, response } = await requireAdminContext(request);
  if (response) return response;

  const { userId } = await request.json().catch(() => ({}));

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  if (userId === context.adminId) {
    return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 });
  }

  const supabase = context.supabase;

  // An owner still attached to a café cannot go: cafes.owner_id points at this
  // profile, and removing it would leave a café nobody can sign in to manage.
  const { count: ownedCafes } = await supabase
    .from("cafes")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", userId);

  if ((ownedCafes ?? 0) > 0) {
    return NextResponse.json(
      {
        error: `This user owns ${ownedCafes} café${
          ownedCafes === 1 ? "" : "s"
        }. Reassign or delete those first.`,
      },
      { status: 409 }
    );
  }

  const { error } = await supabase.from("profiles").delete().eq("id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // The profile is a row hanging off an auth account; deleting only the row
  // leaves an account that can sign in and have a blank profile created again.
  const { error: authError } = await supabase.auth.admin.deleteUser(userId);
  if (authError) {
    console.error("Profile deleted but auth account remains:", authError.message);
  }

  return NextResponse.json({ success: true });
}
