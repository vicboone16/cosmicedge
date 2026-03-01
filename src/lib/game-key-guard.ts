/**
 * Dev-only guard: warns if a non-UUID value is used as a game_key filter.
 * UUID v4 pattern: 8-4-4-4-12 hex chars
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertGameKeyUUID(value: unknown, context?: string): void {
  if (import.meta.env.DEV && typeof value === "string" && !UUID_RE.test(value)) {
    console.error(
      `[game-key-guard] Expected UUID game_key, got provider_game_id or invalid value: "${value}"` +
        (context ? ` (context: ${context})` : "")
    );
  }
}
