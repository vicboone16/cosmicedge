import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { CANONICAL } from "../_shared/team-mappings.ts";

const BDL_BASE = "https://api.balldontlie.io/v1";

interface BdlPlayer {
  id: number;
  first_name: string;
  last_name: string;
  position: string;
  team: {
    id: number;
    abbreviation: string;
    full_name: string;
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const BDL_KEY = Deno.env.get("BALLDONTLIE_KEY")!;
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Build reverse lookup: full_name → abbreviation from canonical
    const nameToAbbr: Record<string, string> = {};
    for (const [name, abbr] of Object.entries(CANONICAL.NBA)) {
      nameToAbbr[name] = abbr;
    }

    // Fetch all NBA players from BDL (paginated)
    const allPlayers: BdlPlayer[] = [];
    let cursor: number | null = null;
    let page = 0;
    const maxPages = 20;

    while (page < maxPages) {
      const url = new URL(`${BDL_BASE}/players`);
      url.searchParams.set("per_page", "100");
      if (cursor) url.searchParams.set("cursor", String(cursor));

      const res = await fetch(url.toString(), {
        headers: { Authorization: BDL_KEY },
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error(`BDL players page ${page} failed: ${res.status} ${errText}`);
        break;
      }

      const json = await res.json();
      const data = json.data as BdlPlayer[];
      if (!data?.length) break;

      allPlayers.push(...data);
      cursor = json.meta?.next_cursor;
      if (!cursor) break;
      page++;

      // Rate limit protection
      await new Promise(r => setTimeout(r, 200));
    }

    console.log(`[sync-rosters] Fetched ${allPlayers.length} players from BDL across ${page + 1} pages`);

    // Build a map: bdl_id → { name, team_abbr, position }
    const bdlMap = new Map<number, { name: string; team_abbr: string; position: string }>();
    for (const p of allPlayers) {
      if (!p.team?.abbreviation) continue;
      const name = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
      if (!name) continue;

      // Normalize team abbreviation
      let teamAbbr = p.team.abbreviation;
      // Try canonical lookup by full name first
      if (p.team.full_name && nameToAbbr[p.team.full_name]) {
        teamAbbr = nameToAbbr[p.team.full_name];
      }

      bdlMap.set(p.id, { name, team_abbr: teamAbbr, position: p.position || "" });
    }

    // Also update bdl_player_cache for name resolution
    const cacheUpserts: any[] = [];
    for (const p of allPlayers) {
      if (!p.first_name && !p.last_name) continue;
      cacheUpserts.push({
        bdl_id: String(p.id),
        first_name: p.first_name || null,
        last_name: p.last_name || null,
        team: p.team?.abbreviation || null,
        fetched_at: new Date().toISOString(),
      });
    }

    // Batch upsert to bdl_player_cache (skip full_name — it's generated)
    if (cacheUpserts.length > 0) {
      for (let i = 0; i < cacheUpserts.length; i += 100) {
        const batch = cacheUpserts.slice(i, i + 100);
        await sb.from("bdl_player_cache").upsert(batch, { onConflict: "bdl_id" });
      }
      console.log(`[sync-rosters] Upserted ${cacheUpserts.length} rows to bdl_player_cache`);
    }

    // Now match BDL players to our players table by name and update teams
    const stats = { updated: 0, created: 0, skipped: 0, errors: 0, details: [] as string[] };

    // Get all existing NBA players
    const { data: existingPlayers } = await sb
      .from("players")
      .select("id, name, team, position, league")
      .eq("league", "NBA");

    // Build name → player map (handle duplicates by preferring non-null team)
    const nameMap = new Map<string, any[]>();
    for (const p of existingPlayers || []) {
      const key = p.name.toLowerCase().trim();
      if (!nameMap.has(key)) nameMap.set(key, []);
      nameMap.get(key)!.push(p);
    }

    // Track which names we've already processed
    const processed = new Set<string>();

    for (const [bdlId, bdlPlayer] of bdlMap) {
      const nameKey = bdlPlayer.name.toLowerCase().trim();
      if (processed.has(nameKey)) continue;
      processed.add(nameKey);

      const existing = nameMap.get(nameKey);

      if (existing?.length) {
        // Update existing player(s) — if team or position changed
        for (const ep of existing) {
          if (ep.team !== bdlPlayer.team_abbr || (bdlPlayer.position && ep.position !== bdlPlayer.position)) {
            const updatePayload: any = { team: bdlPlayer.team_abbr };
            if (bdlPlayer.position) updatePayload.position = bdlPlayer.position;

            const { error } = await sb
              .from("players")
              .update(updatePayload)
              .eq("id", ep.id);

            if (error) {
              stats.errors++;
              stats.details.push(`❌ ${bdlPlayer.name}: ${error.message}`);
            } else {
              if (ep.team !== bdlPlayer.team_abbr) {
                stats.details.push(`✅ ${bdlPlayer.name}: ${ep.team} → ${bdlPlayer.team_abbr}`);
              }
              stats.updated++;
            }
          } else {
            stats.skipped++;
          }
        }
      } else {
        // Create new player
        const { error } = await sb.from("players").insert({
          name: bdlPlayer.name,
          team: bdlPlayer.team_abbr,
          position: bdlPlayer.position || null,
          league: "NBA",
        });

        if (error) {
          // Might be duplicate constraint
          stats.skipped++;
        } else {
          stats.created++;
          stats.details.push(`🆕 ${bdlPlayer.name} (${bdlPlayer.team_abbr})`);
        }
      }
    }

    // Also backfill game_ids for any bet_slip_picks missing them
    const { data: nullPicks } = await sb
      .from("bet_slip_picks")
      .select("id, player_id, player_name_raw")
      .is("game_id", null);

    const gameIdFixes: string[] = [];

    if (nullPicks?.length) {
      const playerIds = [...new Set(nullPicks.map(p => p.player_id).filter(Boolean))];
      const { data: players } = await sb
        .from("players")
        .select("id, team")
        .in("id", playerIds as string[]);

      const teamLookup: Record<string, string> = {};
      players?.forEach(p => { if (p.team) teamLookup[p.id] = p.team; });

      const today = new Date().toISOString().slice(0, 10);
      const { data: todayGames } = await sb
        .from("games")
        .select("id, home_abbr, away_abbr, status")
        .gte("start_time", `${today}T00:00:00Z`)
        .lte("start_time", `${today}T23:59:59Z`);

      if (todayGames?.length) {
        for (const pick of nullPicks) {
          if (!pick.player_id) continue;
          const team = teamLookup[pick.player_id];
          if (!team) continue;

          const game = todayGames.find(g =>
            (g.home_abbr === team || g.away_abbr === team) &&
            (g.status === "live" || g.status === "in_progress")
          ) || todayGames.find(g =>
            g.home_abbr === team || g.away_abbr === team
          );

          if (game) {
            await sb.from("bet_slip_picks").update({ game_id: game.id }).eq("id", pick.id);
            gameIdFixes.push(`${pick.player_name_raw} → ${game.id.slice(0, 8)}`);
          }
        }
      }
    }

    console.log(`[sync-rosters] Done: ${stats.updated} updated, ${stats.created} created, ${stats.skipped} unchanged, ${stats.errors} errors`);

    return new Response(JSON.stringify({
      ok: true,
      bdl_players_fetched: allPlayers.length,
      updated: stats.updated,
      created: stats.created,
      skipped: stats.skipped,
      errors: stats.errors,
      game_id_fixes: gameIdFixes,
      changes: stats.details.slice(0, 100), // cap output
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
