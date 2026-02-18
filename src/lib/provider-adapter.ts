/**
 * Provider Adapter Layer — Phase 2 + Phase 2.5
 * Centralized fetch wrapper with:
 * - Kill switches (env flags + Supabase provider_flags table)
 * - Retry / exponential backoff for 429 / 5xx
 * - Payload validation at ingestion boundary
 * - Structured logging + breadcrumbs
 * - Typed error returns (never throws uncaught)
 */

import { logger, generateRequestId, addBreadcrumb } from "./logger";

// ─── Provider names ───────────────────────────────────────────────────────────
export type ProviderName =
  | "odds"
  | "stats"
  | "injuries"
  | "news"
  | "astro"
  | "supabase"
  | "live_scores";

// ─── Kill switch env flags ────────────────────────────────────────────────────
// These map to VITE_ env vars; all default ON so we're safe without them.
const ENV_FLAGS: Record<ProviderName, string> = {
  odds:        "VITE_PROVIDER_ODDS_ENABLED",
  stats:       "VITE_PROVIDER_STATS_ENABLED",
  injuries:    "VITE_PROVIDER_INJURIES_ENABLED",
  news:        "VITE_PROVIDER_NEWS_ENABLED",
  astro:       "VITE_PROVIDER_ASTRO_ENABLED",
  supabase:    "VITE_PROVIDER_SUPABASE_ENABLED",
  live_scores: "VITE_PROVIDER_LIVE_SCORES_ENABLED",
};

const MASTER_FLAG = "VITE_PROVIDERS_ALL_ENABLED";

// Runtime cache for DB flag overrides (refreshed every 60s)
const _flagCache: { flags: Record<string, boolean>; ts: number } = { flags: {}, ts: 0 };
const FLAG_TTL_MS = 60_000;

async function fetchProviderFlags(): Promise<Record<string, boolean>> {
  const now = Date.now();
  if (now - _flagCache.ts < FLAG_TTL_MS) return _flagCache.flags;
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase
      .from("provider_flags" as any)
      .select("provider_name, enabled");
    if (data) {
      const map: Record<string, boolean> = {};
      for (const row of data as any[]) map[row.provider_name] = row.enabled;
      _flagCache.flags = map;
      _flagCache.ts = now;
    }
  } catch {
    // table may not exist yet — silently skip
  }
  return _flagCache.flags;
}

function envBool(key: string, defaultVal = true): boolean {
  const v = import.meta.env[key];
  if (v === undefined || v === "") return defaultVal;
  return v !== "false" && v !== "0";
}

async function isProviderEnabled(provider: ProviderName): Promise<boolean> {
  if (!envBool(MASTER_FLAG)) return false;
  if (!envBool(ENV_FLAGS[provider])) return false;
  const dbFlags = await fetchProviderFlags();
  if (provider in dbFlags) return dbFlags[provider];
  return true;
}

// ─── Result types ─────────────────────────────────────────────────────────────
export type ProviderSuccess<T> = { ok: true; data: T; cached?: boolean };
export type ProviderError = {
  ok: false;
  code:
    | "PROVIDER_DISABLED"
    | "RATE_LIMITED"
    | "UPSTREAM_ERROR"
    | "TIMEOUT"
    | "INVALID_JSON"
    | "SCHEMA_MISMATCH"
    | "NETWORK_ERROR"
    | "AUTH_EXPIRED"
    | "RLS_DENIED"
    | "CONSTRAINT_VIOLATION"
    | "UNKNOWN";
  provider: ProviderName | "supabase";
  message: string;
  status?: number;
  retries?: number;
};
export type ProviderResult<T> = ProviderSuccess<T> | ProviderError;

// ─── Retry helpers ────────────────────────────────────────────────────────────
function jitter(base: number) {
  return base + Math.random() * base * 0.3;
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Core fetch wrapper ───────────────────────────────────────────────────────
interface ProviderFetchOptions {
  provider: ProviderName;
  url: string;
  init?: RequestInit;
  maxRetries?: number;
  timeoutMs?: number;
  /** Optional last-known-good cache getter */
  fallback?: () => unknown;
  /** Validate parsed JSON */
  validate?: (data: unknown) => { valid: boolean; missing?: string[] };
}

export async function providerFetch<T = unknown>(
  opts: ProviderFetchOptions
): Promise<ProviderResult<T>> {
  const {
    provider,
    url,
    init,
    maxRetries = 3,
    timeoutMs = 15_000,
    fallback,
    validate,
  } = opts;

  const request_id = generateRequestId();

  // ── Kill switch check ────────────────────────────────────────────────────
  const enabled = await isProviderEnabled(provider);
  if (!enabled) {
    logger.warn("provider:disabled", { provider, url, request_id });
    addBreadcrumb({ type: "provider", message: `${provider} disabled`, data: { provider, url } });
    if (fallback) {
      const cached = fallback();
      if (cached !== undefined)
        return { ok: true, data: cached as T, cached: true };
    }
    return {
      ok: false,
      code: "PROVIDER_DISABLED",
      provider,
      message: `Provider ${provider} disabled by configuration.`,
    };
  }

  let attempt = 0;
  let lastError: ProviderError | null = null;

  while (attempt <= maxRetries) {
    const t0 = performance.now();
    let status: number | string = "timeout";

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      status = response.status;
      const duration_ms = Math.round(performance.now() - t0);

      logger.network({ provider, url, status, duration_ms, request_id, retries: attempt });

      // ── 429 rate limit ───────────────────────────────────────────────────
      if (status === 429) {
        const retryAfter = parseInt(response.headers.get("retry-after") ?? "2", 10);
        const wait = jitter(retryAfter * 1000 * Math.pow(2, attempt));
        logger.warn("provider:rate_limited", { provider, wait, attempt });
        if (attempt < maxRetries) { await sleep(wait); attempt++; continue; }
        lastError = { ok: false, code: "RATE_LIMITED", provider, message: "Rate limited", status, retries: attempt };
        break;
      }

      // ── 5xx upstream ─────────────────────────────────────────────────────
      if (status >= 500) {
        const wait = jitter(1000 * Math.pow(2, attempt));
        logger.warn("provider:upstream_error", { provider, status, attempt });
        if (attempt < maxRetries) { await sleep(wait); attempt++; continue; }
        lastError = { ok: false, code: "UPSTREAM_ERROR", provider, message: `Upstream error ${status}`, status, retries: attempt };
        break;
      }

      // ── Non-OK ───────────────────────────────────────────────────────────
      if (!response.ok) {
        lastError = { ok: false, code: "UPSTREAM_ERROR", provider, message: `HTTP ${status}`, status };
        break;
      }

      // ── Parse JSON ───────────────────────────────────────────────────────
      let data: unknown;
      try {
        data = await response.json();
      } catch {
        logger.error("provider:invalid_json", { provider, url, status });
        lastError = { ok: false, code: "INVALID_JSON", provider, message: "Response was not valid JSON" };
        break;
      }

      // ── Payload validation ───────────────────────────────────────────────
      if (validate) {
        const { valid, missing } = validate(data);
        if (!valid) {
          const keys = Object.keys(typeof data === "object" && data !== null ? data : {}).slice(0, 20);
          logger.error("provider:schema_mismatch", { provider, missing, payload_keys: keys });
          lastError = {
            ok: false,
            code: "SCHEMA_MISMATCH",
            provider,
            message: `Schema mismatch — missing: ${(missing ?? []).join(", ")}`,
          };
          break;
        }
      }

      return { ok: true, data: data as T };

    } catch (err: unknown) {
      const duration_ms = Math.round(performance.now() - t0);

      if ((err as Error)?.name === "AbortError") {
        logger.error("provider:timeout", { provider, url, duration_ms, request_id });
        lastError = { ok: false, code: "TIMEOUT", provider, message: "Request timed out" };
        break;
      }

      logger.error("provider:network_error", { provider, url, error: String(err), request_id });
      lastError = { ok: false, code: "NETWORK_ERROR", provider, message: String(err) };
      break;
    }
  }

  // ── Fallback to cached data ───────────────────────────────────────────────
  if (fallback) {
    const cached = fallback();
    if (cached !== undefined) {
      logger.warn("provider:fallback_cache", { provider, reason: lastError?.code });
      return { ok: true, data: cached as T, cached: true };
    }
  }

  return lastError ?? { ok: false, code: "UNKNOWN", provider, message: "Unknown error" };
}

// ─── Supabase error decoder ───────────────────────────────────────────────────
export function decodeSupabaseError(error: { code?: string; message?: string; details?: string }): ProviderError {
  const msg = error.message ?? "Supabase error";
  const code = error.code ?? "";

  let label: ProviderError["code"] = "UNKNOWN";
  if (code === "PGRST301" || msg.includes("JWT expired") || msg.includes("not authenticated"))
    label = "AUTH_EXPIRED";
  else if (code === "42501" || msg.includes("row-level security"))
    label = "RLS_DENIED";
  else if (code === "23505" || msg.includes("duplicate key") || msg.includes("unique constraint"))
    label = "CONSTRAINT_VIOLATION";
  else if (code === "42P01" || msg.includes("does not exist"))
    label = "SCHEMA_MISMATCH";

  logger.error("supabase:error", { code, label, message: msg, details: error.details });
  return { ok: false, code: label, provider: "supabase", message: msg };
}

// ─── Simple payload validator factory ────────────────────────────────────────
export function requireFields(
  requiredFields: string[],
  typeChecks?: Record<string, "string" | "number" | "boolean">
) {
  return (data: unknown): { valid: boolean; missing?: string[] } => {
    if (!data || typeof data !== "object") return { valid: false, missing: ["<root>"] };
    const obj = data as Record<string, unknown>;
    const missing = requiredFields.filter((f) => obj[f] === undefined || obj[f] === null);
    if (typeChecks) {
      for (const [field, type] of Object.entries(typeChecks)) {
        if (obj[field] !== undefined && typeof obj[field] !== type)
          missing.push(`${field}(type:${type})`);
      }
    }
    return { valid: missing.length === 0, missing };
  };
}
