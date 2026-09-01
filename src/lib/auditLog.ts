// src/lib/auditLog.ts
/**
 * The record of what an admin did.
 *
 * Both calls go through /api/admin/audit-logs rather than Supabase directly.
 * The browser has no Supabase session — the admin portal signs in with its own
 * HMAC cookie — so a direct read is refused by the table's RLS policy and a
 * direct write is the call the café's ISP blocks. See the route for the whole
 * account of it.
 */

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "activate"
  | "deactivate"
  | "feature"
  | "unfeature"
  | "change_role"
  | "approve"
  | "reject"
  | "enable_maintenance"
  | "disable_maintenance";

export type EntityType = "cafe" | "user" | "booking" | "announcement" | "settings";

export interface AuditLogEntry {
  action: AuditAction;
  entityType: EntityType;
  entityId?: string;
  details?: Record<string, unknown>;
  /**
   * Kept so the call sites did not all have to change, and deliberately not
   * sent. Who did it is read from the session cookie on the server: a browser
   * that can name the admin can name a different one, in the one table whose
   * entire purpose is saying who did what.
   */
  adminId?: string | null;
}

export type AuditLogRecord = {
  id: string;
  admin_id: string;
  admin_name: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

/**
 * Record an admin action.
 *
 * Never throws. A café that cannot be deleted because the note about deleting
 * it could not be written would be the wrong way round — but the failure is
 * reported to the console rather than swallowed silently, which is how the
 * previous version stayed broken from the day it was written.
 */
export async function logAdminAction({
  action,
  entityType,
  entityId,
  details,
}: AuditLogEntry): Promise<void> {
  try {
    const res = await fetch("/api/admin/audit-logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action, entityType, entityId, details }),
    });

    if (!res.ok) {
      console.error(`Audit entry not recorded (${res.status}):`, action, entityType);
    }
  } catch (err) {
    console.error("Audit entry not recorded:", err);
  }
}

/** Recent admin actions, newest first, with the name of whoever did each one. */
export async function fetchAuditLogs(): Promise<AuditLogRecord[]> {
  try {
    const res = await fetch("/api/admin/audit-logs", { credentials: "include" });

    if (!res.ok) {
      console.error("Could not load audit logs:", res.status);
      return [];
    }

    const json = await res.json();
    return (json?.logs as AuditLogRecord[]) || [];
  } catch (err) {
    console.error("Could not load audit logs:", err);
    return [];
  }
}
