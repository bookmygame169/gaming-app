import { NextRequest, NextResponse } from "next/server";
import { requireAdminContext } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

/**
 * GET/POST /api/admin/audit-logs
 *
 * The record of what an admin did, moved off the browser.
 *
 * Both halves were written as direct Supabase calls from the admin dashboard
 * against the anon key, and neither could work:
 *
 *   - The read was refused. `audit_logs` has RLS on, and its SELECT policy asks
 *     that `auth.uid()` be an admin profile. The admin portal signs in with its
 *     own HMAC cookie and holds no Supabase session, so `auth.uid()` is null on
 *     every request. The tab could never have shown a row, whatever was in the
 *     table.
 *   - The write went straight from the café's browser to Supabase, which is the
 *     call the café's ISP blocks, and the failure was logged to the console and
 *     swallowed. Every admin action reported success and recorded nothing.
 *
 * The table has been empty since it was created, and an empty audit log reads
 * as "nobody has done anything" rather than "this has never worked" — which is
 * the more dangerous of the two, because it is the reassuring one.
 *
 * Who did it is taken from the session cookie here, never from the request
 * body. The old helper accepted an adminId from the browser, so any caller
 * could have written an entry under somebody else's name — in a table whose
 * only purpose is saying who did what.
 */

/** One page of history. Enough to scroll, small enough to send at once. */
const PAGE_SIZE = 200;

const ACTIONS = new Set([
  "create",
  "update",
  "delete",
  "activate",
  "deactivate",
  "feature",
  "unfeature",
  "change_role",
  "approve",
  "reject",
  "enable_maintenance",
  "disable_maintenance",
]);

const ENTITY_TYPES = new Set(["cafe", "user", "booking", "announcement", "settings"]);

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminContext(request);
    if (auth.response) return auth.response;
    const { supabase } = auth.context;

    const { data, error } = await supabase
      .from("audit_logs")
      .select("id, admin_id, action, entity_type, entity_id, details, created_at")
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = data || [];

    // Names resolved in a second query rather than an embed: there is no
    // foreign key from audit_logs to profiles, so PostgREST has no relationship
    // to follow and would answer with an error rather than a join.
    const adminIds = [...new Set(rows.map((row) => row.admin_id).filter(Boolean))];
    const names = new Map<string, string>();

    if (adminIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, admin_username")
        .in("id", adminIds);

      for (const profile of profiles || []) {
        const full = [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim();
        names.set(profile.id, full || profile.admin_username || "");
      }
    }

    return NextResponse.json({
      logs: rows.map((row) => ({
        ...row,
        // Falls back to the id rather than to "Unknown": a deleted admin is
        // still a specific one, and the id is the only thing left that says
        // which.
        admin_name: names.get(row.admin_id) || row.admin_id,
      })),
    });
  } catch (err) {
    console.error("Could not load audit logs:", err);
    return NextResponse.json({ error: "Could not load the audit log" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminContext(request);
    if (auth.response) return auth.response;
    const { adminId, supabase } = auth.context;

    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || "");
    const entityType = String(body?.entityType || "");
    const entityId = body?.entityId ? String(body.entityId) : null;

    if (!ACTIONS.has(action)) {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
    if (!ENTITY_TYPES.has(entityType)) {
      return NextResponse.json({ error: "Unknown entity type" }, { status: 400 });
    }

    const { error } = await supabase.from("audit_logs").insert({
      admin_id: adminId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      details: body?.details ?? null,
    });

    if (error) {
      // Loud on the server, because this is the failure that hid for as long as
      // it did. The caller is still told it worked: refusing to delete a café
      // because the note about deleting it could not be written would be the
      // wrong way round.
      console.error("Could not write the audit entry:", error.message, { action, entityType });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Could not write the audit entry:", err);
    return NextResponse.json({ error: "Could not record that action" }, { status: 500 });
  }
}
