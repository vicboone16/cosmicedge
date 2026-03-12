import { supabase } from "@/integrations/supabase/client";

const PLAYER_ID_PATTERN = /^Player (\d+)$/;
const NUMERIC_ONLY = /^\d+$/;

/**
 * Batch-resolve "Player XXXX" or raw numeric player names from bdl_player_cache.
 * Returns the input array with player_name updated where possible.
 */
export async function resolveOverlayPlayerNames<T extends { player_name?: string; player_id?: string }>(
  rows: T[]
): Promise<T[]> {
  if (rows.length === 0) return rows;

  // Collect BDL IDs that need resolution
  const idsToResolve = new Set<string>();
  for (const r of rows) {
    const name = r.player_name;
    if (!name) continue;
    const match = name.match(PLAYER_ID_PATTERN);
    if (match) {
      idsToResolve.add(match[1]);
    } else if (NUMERIC_ONLY.test(name.trim())) {
      idsToResolve.add(name.trim());
    }
  }

  if (idsToResolve.size === 0) return rows;

  // Also try player_id field for numeric-only names
  for (const r of rows) {
    const name = r.player_name;
    if (name && (PLAYER_ID_PATTERN.test(name) || NUMERIC_ONLY.test(name.trim())) && r.player_id) {
      idsToResolve.add(r.player_id);
    }
  }

  // Fetch from bdl_player_cache
  const { data: cached } = await supabase
    .from("bdl_player_cache" as any)
    .select("bdl_id,first_name,last_name")
    .in("bdl_id", [...idsToResolve]);

  if (!cached || cached.length === 0) return rows;

  const nameMap = new Map<string, string>();
  for (const c of cached as any[]) {
    const fullName = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
    if (fullName) nameMap.set(String(c.bdl_id), fullName);
  }

  // Apply resolution
  return rows.map(r => {
    const name = r.player_name;
    if (!name) return r;

    // Check "Player XXXX" pattern
    const match = name.match(PLAYER_ID_PATTERN);
    if (match && nameMap.has(match[1])) {
      return { ...r, player_name: nameMap.get(match[1])! };
    }

    // Check pure numeric
    if (NUMERIC_ONLY.test(name.trim()) && nameMap.has(name.trim())) {
      return { ...r, player_name: nameMap.get(name.trim())! };
    }

    // Try player_id as fallback
    if ((match || NUMERIC_ONLY.test(name.trim())) && r.player_id && nameMap.has(r.player_id)) {
      return { ...r, player_name: nameMap.get(r.player_id)! };
    }

    // Final fallback: replace pure numeric with "Unknown Player"
    if (NUMERIC_ONLY.test(name.trim())) {
      return { ...r, player_name: "Unknown Player" };
    }

    return r;
  });
}
