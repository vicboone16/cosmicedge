/**
 * write-pick edge function — Phase 3
 * Handles picks create / update / delete with:
 * - Auth verification
 * - Input schema validation
 * - Idempotency (via idempotency_key header)
 * - Audit log entries
 * - Structured logs with correlation_id
 * - Standardized error format
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-idempotency-key, x-correlation-id, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Idempotency cache (in-memory, per cold-start) ────────────────────────────
const idempotencyCache = new Map<string, { result: unknown; ts: number }>();
const IDEMPOTENCY_TTL = 60_000; // 60s

function mkError(code: string, message: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, code, message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function mkOk(data: unknown, status = 200) {
  return new Response(JSON.stringify({ ok: true, data }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── Schema validators ────────────────────────────────────────────────────────
const CREATE_REQUIRED = ["game_id", "market_type", "selection", "odds"] as const;
const UPDATE_REQUIRED = ["id"] as const;
const DELETE_REQUIRED = ["id"] as const;

function validate(body: Record<string, unknown>, required: readonly string[]) {
  const missing = required.filter((k) => body[k] === undefined || body[k] === null);
  return missing;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const t0 = Date.now();
  const correlationId = req.headers.get("x-correlation-id") ?? `cid_${Date.now()}`;
  const idempotencyKey = req.headers.get("x-idempotency-key");

  const log = (level: string, msg: string, meta?: Record<string, unknown>) =>
    console.log(JSON.stringify({ level, msg, correlationId, ...meta, ts: new Date().toISOString() }));

  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return mkError("AUTH_MISSING", "Authorization header required", 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      log("warn", "auth:failed", { error: authError?.message });
      return mkError("AUTH_EXPIRED", "Session expired or invalid", 401);
    }

    // ── Idempotency ─────────────────────────────────────────────────────────
    if (idempotencyKey) {
      const cached = idempotencyCache.get(idempotencyKey);
      if (cached && Date.now() - cached.ts < IDEMPOTENCY_TTL) {
        log("info", "idempotency:hit", { idempotencyKey });
        return mkOk(cached.result);
      }
    }

    // ── Parse body ──────────────────────────────────────────────────────────
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      return mkError("INVALID_JSON", "Request body is not valid JSON");
    }

    const action = (body.action as string) ?? "create";
    log("info", `pick:${action}:start`, { user_id: user.id });

    // ── Dispatch ────────────────────────────────────────────────────────────
    let result: unknown;

    if (action === "create") {
      const missing = validate(body, CREATE_REQUIRED);
      if (missing.length > 0)
        return mkError("SCHEMA_MISMATCH", `Missing fields: ${missing.join(", ")}`);

      const record = {
        user_id:     user.id,
        game_id:     body.game_id,
        market_type: body.market_type,
        selection:   body.selection,
        odds:        body.odds,
        stake:       body.stake ?? null,
        stake_amount: body.stake_amount ?? null,
        stake_unit:  body.stake_unit ?? "units",
        line:        body.line ?? null,
        side:        body.side ?? null,
        book:        body.book ?? null,
        notes:       body.notes ?? null,
        why_summary: body.why_summary ?? null,
        confidence:  body.confidence ?? null,
        status:      "open",
      };

      const { data, error } = await supabase.from("bets").insert(record).select().single();
      if (error) {
        log("error", "pick:create:db_error", { code: error.code, message: error.message });
        return mkError("DB_ERROR", "An internal error occurred.", 500);
      }

      // Audit log
      await supabase.from("audit_log" as any).insert({
        user_id: user.id,
        action: "pick:create",
        entity_type: "bet",
        entity_id: data.id,
        after_data: data,
        correlation_id: correlationId,
      });

      result = data;

    } else if (action === "update") {
      const missing = validate(body, UPDATE_REQUIRED);
      if (missing.length > 0)
        return mkError("SCHEMA_MISMATCH", `Missing fields: ${missing.join(", ")}`);

      // Fetch before-state for audit
      const { data: before } = await supabase.from("bets").select("*").eq("id", body.id).eq("user_id", user.id).single();
      if (!before) return mkError("NOT_FOUND", "Pick not found or access denied", 404);

      const allowedFields = ["stake", "stake_amount", "stake_unit", "notes", "result", "result_notes", "status", "book", "confidence", "why_summary"];
      const updates: Record<string, unknown> = {};
      for (const f of allowedFields) {
        if (body[f] !== undefined) updates[f] = body[f];
      }
      updates.updated_at = new Date().toISOString();

      const { data, error } = await supabase.from("bets").update(updates).eq("id", body.id).eq("user_id", user.id).select().single();
      if (error) {
        log("error", "pick:update:db_error", { code: error.code, message: error.message });
        return mkError("DB_ERROR", "An internal error occurred.", 500);
      }

      await supabase.from("audit_log" as any).insert({
        user_id: user.id,
        action: "pick:update",
        entity_type: "bet",
        entity_id: body.id as string,
        before_data: before,
        after_data: data,
        correlation_id: correlationId,
      });

      result = data;

    } else if (action === "delete") {
      const missing = validate(body, DELETE_REQUIRED);
      if (missing.length > 0)
        return mkError("SCHEMA_MISMATCH", `Missing fields: ${missing.join(", ")}`);

      const { data: before } = await supabase.from("bets").select("*").eq("id", body.id).eq("user_id", user.id).single();
      if (!before) return mkError("NOT_FOUND", "Pick not found or access denied", 404);

      const { error } = await supabase.from("bets").delete().eq("id", body.id).eq("user_id", user.id);
      if (error) {
        log("error", "pick:delete:db_error", { code: error.code, message: error.message });
        return mkError("DB_ERROR", "An internal error occurred.", 500);
      }

      await supabase.from("audit_log" as any).insert({
        user_id: user.id,
        action: "pick:delete",
        entity_type: "bet",
        entity_id: body.id as string,
        before_data: before,
        correlation_id: correlationId,
      });

      result = { deleted: true, id: body.id };

    } else {
      return mkError("UNKNOWN_ACTION", `Unknown action: ${action}`);
    }

    // ── Cache idempotency result ─────────────────────────────────────────────
    if (idempotencyKey) {
      idempotencyCache.set(idempotencyKey, { result, ts: Date.now() });
    }

    const duration_ms = Date.now() - t0;
    log("info", `pick:${action}:success`, { duration_ms });

    return mkOk(result);

  } catch (err) {
    const duration_ms = Date.now() - t0;
    log("error", "write-pick:unhandled", { error: String(err), duration_ms });
    return mkError("INTERNAL_ERROR", "Internal server error", 500);
  }
});
