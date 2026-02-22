/**
 * Performance monitoring utilities for Cosmic Edge.
 * Tracks slow renders, slow network requests, and duplicate renders.
 */

const renderCounts = new Map<string, { count: number; lastRender: number }>();
const SLOW_RENDER_MS = 16; // > 1 frame at 60fps
const SLOW_NETWORK_MS = 2000;

/** Track component render frequency */
export function trackRender(componentName: string) {
  if (process.env.NODE_ENV === "production") return;
  
  const now = performance.now();
  const entry = renderCounts.get(componentName);
  
  if (entry) {
    entry.count++;
    const gap = now - entry.lastRender;
    if (gap < 100) {
      // Rendered twice within 100ms — likely unnecessary
      console.warn(`[perf] ${componentName} rendered ${entry.count}x (${gap.toFixed(0)}ms gap)`);
    }
    entry.lastRender = now;
  } else {
    renderCounts.set(componentName, { count: 1, lastRender: now });
  }
}

/** Measure and log async operation duration */
export async function measureAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    const result = await fn();
    const duration = performance.now() - start;
    if (duration > SLOW_NETWORK_MS) {
      console.warn(`[perf:slow] ${label}: ${duration.toFixed(0)}ms`);
    }
    return result;
  } catch (e) {
    const duration = performance.now() - start;
    console.error(`[perf:error] ${label}: ${duration.toFixed(0)}ms`, e);
    throw e;
  }
}

/** Reset render counts (useful for testing) */
export function resetRenderCounts() {
  renderCounts.clear();
}

/** Get render stats summary */
export function getRenderStats(): Record<string, number> {
  const stats: Record<string, number> = {};
  renderCounts.forEach((v, k) => { stats[k] = v.count; });
  return stats;
}
