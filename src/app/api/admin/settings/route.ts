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
 * The password never reaches this code. Verifying the old one and writing the
 * new one both happen inside change_admin_credentials, so the plaintext is
 * compared where the hash lives rather than being fetched back here — which is
 * what this route used to do, putting the current password on the page.
 *
 * Only the caller's own credentials can be changed. An admin resetting another
 * admin's password is a different operation with different rules.
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

  // The current password is still required even though a session cookie got
  // this far: without it, an unattended logged-in browser is enough to take
  // the account over. It is checked inside the function, against the hash.
  const { data: changed, error } = await supabase.rpc("change_admin_credentials", {
    p_user_id: context.adminId,
    p_current_password: currentPassword ?? "",
    p_new_username: newUsername ?? null,
    p_new_password: newPassword ?? null,
  });

  if (error) {
    // 23505 is the unique index on admin_username.
    if (error.code === "23505") {
      return NextResponse.json({ error: "That username is already taken." }, { status: 409 });
    }

    if (error.message?.includes("change_admin_credentials")) {
      return NextResponse.json(
        {
          error:
            "Password changes are not set up yet. Run migration " +
            "20260810000006_hash_dashboard_passwords.sql in Supabase.",
        },
        { status: 500 }
      );
    }

    console.error("Credential change failed:", error.message);
    return NextResponse.json({ error: "Could not update your credentials" }, { status: 500 });
  }

  if (changed !== true) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 403 });
  }

  return NextResponse.json({ success: true });
}
