/**
 * Global error capture — Phase 1 Production Visibility.
 * Catches window errors, unhandled promise rejections, and React errors.
 * Attaches correlation_id + last 20 breadcrumbs to every report.
 */

import { logger, getLastBreadcrumbs, getCorrelationId, monitor } from "./logger";

export interface ErrorReport {
  correlation_id: string;
  timestamp: string;
  message: string;
  stack?: string;
  breadcrumbs: ReturnType<typeof getLastBreadcrumbs>;
  route: string;
  user_agent: string;
}

function buildReport(message: string, stack?: string): ErrorReport {
  return {
    correlation_id: getCorrelationId(),
    timestamp: new Date().toISOString(),
    message,
    stack,
    breadcrumbs: getLastBreadcrumbs(),
    route: window.location.pathname,
    user_agent: navigator.userAgent,
  };
}

let _initialized = false;

export function initErrorCapture() {
  if (_initialized) return;
  _initialized = true;

  // ─── window.onerror ────────────────────────────────────────────────────────
  window.onerror = (message, source, lineno, colno, error) => {
    const report = buildReport(
      `[onerror] ${message} at ${source}:${lineno}:${colno}`,
      error?.stack
    );
    logger.error("global:onerror", report as unknown as Record<string, unknown>);
    monitor.captureException(error ?? message, report as unknown as Record<string, unknown>);
    return false; // don't suppress default
  };

  // ─── unhandledrejection ────────────────────────────────────────────────────
  window.onunhandledrejection = (event) => {
    const err = event.reason;
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    const report = buildReport(`[unhandledrejection] ${message}`, stack);
    logger.error("global:unhandledrejection", report as unknown as Record<string, unknown>);
    monitor.captureException(err, report as unknown as Record<string, unknown>);
  };

  logger.info("error-capture:initialized");
}

/** Call from React error boundaries to funnel through same pipeline */
export function captureReactError(error: Error, info: { componentStack: string }) {
  const report = buildReport(error.message, error.stack + "\n" + info.componentStack);
  logger.error("react:error-boundary", report as unknown as Record<string, unknown>);
  monitor.captureException(error, { component_stack: info.componentStack, ...report });
}
