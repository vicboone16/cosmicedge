/**
 * Audit log — Phase 5 scaffold.
 * Logs user actions to the audit_log table.
 * Expand action types as needed.
 */

import { supabase } from "@/integrations/supabase/client";
import { getCorrelationId } from "./logger";

export type AuditAction =
  | "pick:create"
  | "pick:update"
  | "pick:delete"
  | "alert:create"
  | "alert:delete"
  | "note:create"
  | "note:update"
  | "note:delete"
  | "watchlist:add"
  | "watchlist:remove"
  | "profile:update"
  | "admin:sync";

export interface AuditPayload {
  action: AuditAction;
  entity_type?: string;
  entity_id?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

export async function logAudit(payload: AuditPayload) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await (supabase.from("audit_log" as any).insert({
      user_id: user?.id ?? null,
      action: payload.action,
      entity_type: payload.entity_type ?? null,
      entity_id: payload.entity_id ?? null,
      before_data: payload.before ?? null,
      after_data: payload.after ?? null,
      correlation_id: getCorrelationId(),
      meta: payload.meta ?? null,
    }));
  } catch {
    // Audit failures are non-blocking — never crash the app
  }
}
