import { corsHeaders } from "./cors.ts";

/**
 * Validates that a request comes from an authorized cron/internal caller.
 * Checks for x-cron-secret header matching the CRON_SECRET env var.
 * Also allows requests with a valid Authorization Bearer token (user-initiated admin calls).
 * Returns null if authorized, or a 403 Response if unauthorized.
 */
export function verifyCronAuth(req: Request): Response | null {
  const cronSecret = Deno.env.get("CRON_SECRET");

  // If CRON_SECRET is not configured, allow all (graceful degradation)
  if (!cronSecret) return null;

  // Check x-cron-secret header
  const headerSecret = req.headers.get("x-cron-secret");
  if (headerSecret === cronSecret) return null;

  // Allow if there's a valid Authorization header (admin-triggered calls)
  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) return null;

  return new Response(JSON.stringify({ error: "Forbidden" }), {
    status: 403,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
