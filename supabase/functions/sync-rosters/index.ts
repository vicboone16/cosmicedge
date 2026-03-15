import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { CANONICAL } from "../_shared/team-mappings.ts";

const BDL_BASE = "https://api.balldontlie.io/v1";

interface BdlPlayer {
  id: number;
  first_name: string;
  last_name: string;
  position: string;
  team: { id: number; abbreviation: string; full_name: string };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const BDL_KEY_RAW = Deno.env.get("BALLDONTLIE_KEY")!;
    const BDL_KEY = BDL_KEY_RAW.trim().replace(/^Bearer\s+/i, "");
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const startCursor = body.cursor ?? null;
    const maxPages = body.max_pages ?? 8; // ~800 players per run

    // Build reverse lookup: full_name → abbreviation
    const nameToAbbr: Record<string, string> = {};
    for (const [name, abbr] of Object.entries(CANONICAL.NBA)) {
      nameToAbbr[name] = abbr;
    }

    // Fetch NBA players from BDL (paginated)
    const allPlayers: BdlPlayer[] = [];
    let cursor: number | null = startCursor;
    let page = 0;

    while (page < maxPages) {
      const url = new URL(`${BDL_BASE}/players`);
      url.searchParams.set("per_page", "100");
      if (cursor) url.searchParams.set("cursor", String(cursor));

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${BDL_KEY}`, "X-Api-Key": BDL_KEY },
      });

      if (res.status === 429) {
        console.warn(`[sync-rosters] Rate limited at page ${page}, stopping`);
        break;
      }

      if (!res.ok) {
        console.error(`[sync-rosters] BDL page ${page}: ${res.status}`);
        break;
      }

      const json = await res.json();
      const data = json.data as BdlPlayer[];
      if (!data?.length) break;

      allPlayers.push(...data);
      cursor = json.meta?.next_cursor ?? null;
      if (!cursor) { cursor = null; break; }
      page++;

      await new Promise(r => setTimeout(r, 150));
    }

    console.log(`[sync-rosters] Fetched ${allPlayers.length} players, ${page + 1} pages`);

    // Upsert bdl_player_cache
    const cacheRows = allPlayers
      .filter(p => p.first_name || p.last_name)
      .map(p => ({
        bdl_id: String(p.id),
        first_name: p.first_name || null,
        last_name: p.last_name || null,
        team: p.team?.abbreviation || null,
        fetched_at: new Date().toISOString(),
      }));

    for (let i = 0; i < cacheRows.length; i += 200) {
      await sb.from("bdl_player_cache").upsert(cacheRows.slice(i, i + 200), { onConflict: "bdl_id" });
    }

    // Get all existing NBA players
    const { data: existing } = await sb
      .from("players")
      .select("id, name, team, position")
      .eq("league", "NBA");

    const nameMap = new Map<string, any[]>();
    for (const p of existing || []) {
      const key = p.name.toLowerCase().trim();
      if (!nameMap.has(key)) nameMap.set(key, []);
      nameMap.get(key)!.push(p);
    }

    const stats = { updated: 0, created: 0, skipped: 0, errors: 0 };
    const changes: string[] = [];
    const processed = new Set<string>();

    for (const p of allPlayers) {
      if (!p.team?.abbreviation) continue;
      const name = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
      if (!name) continue;
      const nameKey = name.toLowerCase().trim();
      if (processed.has(nameKey)) continue;
      processed.add(nameKey);

      let teamAbbr = p.team.abbreviation;
      if (p.team.full_name && nameToAbbr[p.team.full_name]) {
        teamAbbr = nameToAbbr[p.team.full_name];
      }

      const matches = nameMap.get(nameKey);

      if (matches?.length) {
        for (const ep of matches) {
          const needsUpdate = ep.team !== teamAbbr || (p.position && ep.position !== p.position);
          if (!needsUpdate) { stats.skipped++; continue; }

          const payload: any = { team: teamAbbr };
          if (p.position) payload.position = p.position;

          const { error } = await sb.from("players").update(payload).eq("id", ep.id);
          if (error) {
            stats.errors++;
          } else {
            if (ep.team !== teamAbbr) {
              changes.push(`${name}: ${ep.team} → ${teamAbbr}`);
            }
            stats.updated++;
          }
        }
      } else {
        // Skip creating players not already in our DB — they're likely retired/historical
        stats.skipped++;
      }
    }

    // Backfill game_ids for bet_slip_picks
    const { data: nullPicks } = await sb
      .from("bet_slip_picks")
      .select("id, player_id, player_name_raw")
      .is("game_id", null);

    const gameIdFixes: string[] = [];
    if (nullPicks?.length) {
      const playerIds = [...new Set(nullPicks.map(p => p.player_id).filter(Boolean))];
      const { data: players } = await sb.from("players").select("id, team").in("id", playerIds as string[]);
      const teamLookup: Record<string, string> = {};
      players?.forEach(p => { if (p.team) teamLookup[p.id] = p.team; });

      const today = new Date().toISOString().slice(0, 10);
      const { data: todayGames } = await sb.from("games").select("id, home_abbr, away_abbr, status")
        .gte("start_time", `${today}T00:00:00Z`).lte("start_time", `${today}T23:59:59Z`);

      if (todayGames?.length) {
        for (const pick of nullPicks) {
          if (!pick.player_id) continue;
          const team = teamLookup[pick.player_id];
          if (!team) continue;
          const game = todayGames.find(g =>
            (g.home_abbr === team || g.away_abbr === team) &&
            (g.status === "live" || g.status === "in_progress")
          ) || todayGames.find(g => g.home_abbr === team || g.away_abbr === team);
          if (game) {
            await sb.from("bet_slip_picks").update({ game_id: game.id }).eq("id", pick.id);
            gameIdFixes.push(`${pick.player_name_raw} → ${game.id.slice(0, 8)}`);
          }
        }
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      bdl_fetched: allPlayers.length,
      pages: page + 1,
      next_cursor: cursor,
      ...stats,
      game_id_fixes: gameIdFixes,
      changes: changes.slice(0, 150),
    }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[sync-rosters] Error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
