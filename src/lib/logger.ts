/**
 * Structured logger with correlation_id, breadcrumbs, and provider labeling.
 * Phase 1 — Production Visibility
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  route: string;
  user_id?: string | null;
  session_id?: string | null;
  correlation_id: string;
  request_id?: string;
  data_source?: string;
  duration_ms?: number;
  status?: number | string;
  message: string;
  meta?: Record<string, unknown>;
}

export type Breadcrumb = {
  timestamp: string;
  type: "navigation" | "action" | "network" | "error" | "provider";
  message: string;
  data?: Record<string, unknown>;
};

// ─── In-memory breadcrumb ring buffer ───────────────────────────────────────
const MAX_BREADCRUMBS = 20;
const breadcrumbs: Breadcrumb[] = [];

export function addBreadcrumb(crumb: Omit<Breadcrumb, "timestamp">) {
  breadcrumbs.push({ ...crumb, timestamp: new Date().toISOString() });
  if (breadcrumbs.length > MAX_BREADCRUMBS) breadcrumbs.shift();
}

export function getLastBreadcrumbs(): Breadcrumb[] {
  return [...breadcrumbs];
}

// ─── Correlation ID generation ───────────────────────────────────────────────
export function generateCorrelationId(): string {
  return `cid_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function generateRequestId(): string {
  return `rid_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// Per-session correlation id that persists across a user's session actions
let _activeCorrelationId = generateCorrelationId();
export function getCorrelationId() {
  return _activeCorrelationId;
}
export function rotateCorrelationId() {
  _activeCorrelationId = generateCorrelationId();
  return _activeCorrelationId;
}

// ─── Monitoring adapter (Sentry/LogRocket stub) ──────────────────────────────
interface MonitoringAdapter {
  captureException(err: unknown, context?: Record<string, unknown>): void;
  captureMessage(msg: string, level?: LogLevel): void;
  setUser(id: string | null): void;
}

const noopMonitor: MonitoringAdapter = {
  captureException: () => {},
  captureMessage: () => {},
  setUser: () => {},
};

// STUB: replace with real Sentry/LogRocket wiring when env var is available
function buildMonitor(): MonitoringAdapter {
  // TODO: if (import.meta.env.VITE_SENTRY_DSN) { init Sentry }
  // TODO: if (import.meta.env.VITE_LOGROCKET_ID) { init LogRocket }
  return noopMonitor;
}

export const monitor = buildMonitor();

// ─── Core logger ────────────────────────────────────────────────────────────
function getCurrentRoute(): string {
  try {
    return window.location.pathname;
  } catch {
    return "unknown";
  }
}

function getUserId(): string | null {
  try {
    const raw = localStorage.getItem("sb-gwfgmlfggeyxexclwybk-auth-token");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.user?.id ?? null;
  } catch {
    return null;
  }
}

function emit(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    route: getCurrentRoute(),
    user_id: getUserId(),
    session_id: sessionStorage.getItem("session_id"),
    correlation_id: getCorrelationId(),
    message,
    ...(meta ?? {}),
  };

  // Add as breadcrumb (non-error)
  if (level !== "error") {
    addBreadcrumb({ type: "action", message, data: meta });
  }

  switch (level) {
    case "debug":
      console.debug("[CE]", entry);
      break;
    case "info":
      console.info("[CE]", entry);
      break;
    case "warn":
      console.warn("[CE]", entry);
      break;
    case "error":
      console.error("[CE]", entry);
      monitor.captureMessage(message, "error");
      break;
  }

  return entry;
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => emit("debug", msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => emit("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => emit("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => emit("error", msg, meta),
  /** Log a network call result */
  network: (opts: {
    provider: string;
    url: string;
    status: number | string;
    duration_ms: number;
    request_id?: string;
    retries?: number;
    error_label?: string;
  }) => {
    const level: LogLevel = String(opts.status).startsWith("2") ? "info" : "warn";
    addBreadcrumb({
      type: "network",
      message: `${opts.provider} → ${opts.url} [${opts.status}] ${opts.duration_ms}ms`,
      data: opts,
    });
    return emit(level, `network:${opts.provider}`, {
      ...opts,
      correlation_id: getCorrelationId(),
      request_id: opts.request_id ?? generateRequestId(),
    });
  },
};

// ─── Session bootstrap ───────────────────────────────────────────────────────
if (!sessionStorage.getItem("session_id")) {
  sessionStorage.setItem("session_id", `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
}
