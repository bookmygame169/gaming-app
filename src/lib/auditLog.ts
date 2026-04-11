// src/lib/auditLog.ts
/**
 * Audit logging utility for tracking admin actions
 */

import { supabase } from "./supabaseClient";

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
}

/**
 * Log an admin action to the audit_logs table
 */
export async function logAdminAction({
  action,
  entityType,
  entityId,
  details,
}: AuditLogEntry): Promise<void> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      console.error("Cannot log audit action: No authenticated user");
      return;
    }

    const { error } = await supabase.from("audit_logs").insert({
      admin_id: user.id,
      action,
      entity_type: entityType,
      entity_id: entityId,
      details,
    });

    if (error) {
      console.error("Failed to log audit action:", error);
    }
  } catch (err) {
    console.error("Error logging audit action:", err);
  }
}

/**
 * Fetch recent audit logs
 */
export async function fetchAuditLogs(limit = 100) {
  try {
    const { data, error } = await supabase
      .from("audit_logs")
      .select(
        `
        id,
        action,
        entity_type,
        entity_id,
        details,
        created_at,
        admin_id
      `
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    return data || [];
  } catch (err) {
    console.error("Error fetching audit logs:", err);
    return [];
  }
}
