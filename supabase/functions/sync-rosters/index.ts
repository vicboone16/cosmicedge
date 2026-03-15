import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { CANONICAL } from "../_shared/team-mappings.ts";

const BDL_BASE = "https://api.balldontlie.io/v1";

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
    const mode = body.mode ?? "full"; // "full" | "cache_only" | "search"
    const searchNames: string[] = body.search_names ?? [];

    // Build canonical lookup
    const nameToAbbr: Record<string, string> = {};
    for (const [name, abbr] of Object.entries(CANONICAL.NBA)) {
      nameToAbbr[name] = abbr;
    }

    const stats = { updated: 0, skipped: 0, errors: 0 };
    const changes: string[] = [];

    // ── Mode: search — look up specific players by name via BDL ──
    if (mode === "search" && searchNames.length > 0) {
      for (const searchName of searchNames.slice(0, 30)) {
        try {
          const url = `${BDL_BASE}/players?search=${encodeURIComponent(searchName)}&per_page=5`;
          const res = await fetch(url, {
            headers: { Authorization: `Bearer ${BDL_KEY}`, "X-Api-Key": BDL_KEY },
          });
          if (!res.ok) continue;
          const json = await res.json();
          const players = json.data || [];

          for (const p of players) {
            if (!p.team?.abbreviation) continue;
            const fullName = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
            if (!fullName) continue;

            let teamAbbr = p.team.abbreviation;
            if (p.team.full_name && nameToAbbr[p.team.full_name]) {
              teamAbbr = nameToAbbr[p.team.full_name];
            }

            // Update in our DB
            const { data: matches } = await sb
              .from("players")
              .select("id, name, team, position")
              .eq("league", "NBA")
              .ilike("name", fullName);

            for (const m of matches || []) {
              if (m.team === teamAbbr) { stats.skipped++; continue; }
              const { error } = await sb.from("players")
                .update({ team: teamAbbr, position: p.position || m.position })
                .eq("id", m.id);
              if (error) { stats.errors++; }
              else {
                changes.push(`${m.name}: ${m.team} → ${teamAbbr}`);
                stats.updated++;
              }
            }

            // Also update bdl_player_cache
            await sb.from("bdl_player_cache").upsert({
              bdl_id: String(p.id),
              first_name: p.first_name,
              last_name: p.last_name,
              team: teamAbbr,
              fetched_at: new Date().toISOString(),
            }, { onConflict: "bdl_id" });
          }
          await new Promise(r => setTimeout(r, 200));
        } catch (e) {
          console.warn(`Search failed for ${searchName}:`, e);
        }
      }

      return new Response(JSON.stringify({ ok: true, mode, ...stats, changes }, null, 2), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Mode: full or cache_only — use BDL paginated fetch ──
    if (mode === "full") {
      // Fetch all BDL players (paginated)
      let cursor: number | null = body.cursor ?? null;
      let page = 0;
      const maxPages = body.max_pages ?? 30;
      const allPlayers: any[] = [];

      while (page < maxPages) {
        const url = new URL(`${BDL_BASE}/players`);
        url.searchParams.set("per_page", "100");
        if (cursor) url.searchParams.set("cursor", String(cursor));

        const res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${BDL_KEY}`, "X-Api-Key": BDL_KEY },
        });

        if (res.status === 429) { console.warn("[sync-rosters] Rate limited"); break; }
        if (!res.ok) { console.error(`[sync-rosters] BDL ${res.status}`); break; }

        const json = await res.json();
        const data = json.data || [];
        if (!data.length) break;
        allPlayers.push(...data);
        cursor = json.meta?.next_cursor ?? null;
        if (!cursor) break;
        page++;
        await new Promise(r => setTimeout(r, 150));
      }

      // Upsert to bdl_player_cache
      const cacheRows = allPlayers
        .filter((p: any) => p.first_name || p.last_name)
        .map((p: any) => ({
          bdl_id: String(p.id),
          first_name: p.first_name || null,
          last_name: p.last_name || null,
          team: p.team?.abbreviation || null,
          fetched_at: new Date().toISOString(),
        }));

      for (let i = 0; i < cacheRows.length; i += 200) {
        await sb.from("bdl_player_cache").upsert(cacheRows.slice(i, i + 200), { onConflict: "bdl_id" });
      }

      console.log(`[sync-rosters] Cached ${cacheRows.length} BDL players`);
    }

    // ── Cross-reference bdl_player_cache with players table ──
    // Get all BDL cache entries with team info
    const { data: cacheEntries } = await sb
      .from("bdl_player_cache")
      .select("bdl_id, first_name, last_name, team")
      .not("team", "is", null)
      .not("first_name", "is", null);

    // Get all our NBA players
    const { data: ourPlayers } = await sb
      .from("players")
      .select("id, name, team, position")
      .eq("league", "NBA");

    if (cacheEntries?.length && ourPlayers?.length) {
      // Build name → BDL team map
      const bdlTeamMap = new Map<string, string>();
      for (const c of cacheEntries) {
        const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim().toLowerCase();
        if (!name || !c.team) continue;
        // Normalize team abbreviation
        let teamAbbr = c.team;
        // Cross-check with canonical (BDL uses standard abbreviations)
        bdlTeamMap.set(name, teamAbbr);
      }

      // Update mismatched players
      for (const p of ourPlayers) {
        const bdlTeam = bdlTeamMap.get(p.name.toLowerCase().trim());
        if (!bdlTeam || bdlTeam === p.team) { stats.skipped++; continue; }

        const { error } = await sb.from("players")
          .update({ team: bdlTeam })
          .eq("id", p.id);

        if (error) { stats.errors++; }
        else {
          changes.push(`${p.name}: ${p.team} → ${bdlTeam}`);
          stats.updated++;
        }
      }
    }

    // ── Backfill game_ids for bet_slip_picks ──
    const { data: nullPicks } = await sb
      .from("bet_slip_picks")
      .select("id, player_id, player_name_raw")
      .is("game_id", null);

    const gameIdFixes: string[] = [];
    if (nullPicks?.length) {
      const playerIds = [...new Set(nullPicks.map(p => p.player_id).filter(Boolean))];
      const { data: plrs } = await sb.from("players").select("id, team").in("id", playerIds as string[]);
      const teamLookup: Record<string, string> = {};
      plrs?.forEach(p => { if (p.team) teamLookup[p.id] = p.team; });

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
      mode,
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
