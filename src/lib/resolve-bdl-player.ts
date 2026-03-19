import { supabase } from "@/integrations/supabase/client";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMERIC_RE = /^\d+$/;

/**
 * Returns true if the value looks like a BDL numeric player ID rather than an internal UUID.
 */
export function isBdlId(playerId: string | null | undefined): boolean {
  if (!playerId) return false;
  return NUMERIC_RE.test(playerId.trim()) || playerId.startsWith("Player ");
}

/**
 * Resolve a BDL numeric player_id to the internal players.id UUID.
 * Bridge: bdl_player_cache.bdl_id → full_name → players.name → players.id
 * Returns null if unresolvable.
 */
export async function resolveBdlToInternalId(
  bdlId: string,
  opts?: { playerName?: string | null; gameId?: string | null }
): Promise<string | null> {
  const cleanId = bdlId.replace(/^Player\s+/i, "").trim();
  if (!NUMERIC_RE.test(cleanId)) {
    // Already a UUID?
    if (UUID_RE.test(bdlId)) return bdlId;
    return null;
  }

  // Step 1: Get full name from bdl_player_cache
  let fullName = opts?.playerName || null;
  if (!fullName || /^Player\s+\d+$/.test(fullName) || NUMERIC_RE.test(fullName)) {
    const { data: cached } = await supabase
      .from("bdl_player_cache" as any)
      .select("full_name,first_name,last_name")
      .eq("bdl_id", cleanId)
      .limit(1)
      .maybeSingle();

    if (cached) {
      fullName = (cached as any).full_name
        || [((cached as any).first_name || ""), ((cached as any).last_name || "")].filter(Boolean).join(" ").trim()
        || null;
    }
  }

  if (!fullName) return null;

  // Step 2: Find canonical player by name
  const { data: players } = await supabase
    .from("players")
    .select("id")
    .ilike("name", fullName)
    .eq("league", "NBA")
    .limit(1);

  if (players && players.length > 0) return players[0].id;

  // Step 3: Fuzzy fallback using search function
  const { data: searched } = await supabase.rpc("search_players_unaccent", {
    search_query: fullName,
    max_results: 1,
  });

  if (searched && searched.length > 0) {
    return (searched[0] as any).player_id || null;
  }

  return null;
}

/**
 * If the given player_id looks like a BDL numeric ID, resolve it to an internal UUID.
 * If it's already a UUID, return it unchanged.
 */
export async function ensureInternalPlayerId(
  playerId: string | null | undefined,
  playerName?: string | null
): Promise<string | null> {
  if (!playerId) return null;
  if (UUID_RE.test(playerId)) return playerId;
  return resolveBdlToInternalId(playerId, { playerName });
}

/**
 * Batch resolve: given an array of player names (for a specific game),
 * return a map of name → internal UUID.
 */
export async function batchResolvePlayerNames(
  names: string[],
  league = "NBA"
): Promise<Map<string, string>> {
  const uniqueNames = [...new Set(names.filter(Boolean))];
  if (!uniqueNames.length) return new Map();

  const result = new Map<string, string>();

  // Batch query in chunks of 50
  for (let i = 0; i < uniqueNames.length; i += 50) {
    const batch = uniqueNames.slice(i, i + 50);
    const { data } = await supabase
      .from("players")
      .select("id, name")
      .eq("league", league)
      .in("name", batch);

    if (data) {
      for (const p of data) {
        result.set(p.name, p.id);
      }
    }
  }

  return result;
}
