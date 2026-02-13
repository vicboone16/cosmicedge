import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SDIO_API_BASE = "https://api.sportsdata.io/v3";
const LEAGUE_SLUGS: Record<string, string> = { NBA: "nba", NFL: "nfl", MLB: "mlb", NHL: "nhl" };
const BATCH = 100;
const THROTTLE_MS = 1200;

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const league = (url.searchParams.get("league") || "NBA").toUpperCase();
    const mode = url.searchParams.get("mode") || "injuries"; // injuries | depth_charts | both

    const sdioKey = Deno.env.get("SPORTSDATAIO_API_KEY");
    if (!sdioKey) throw new Error("SPORTSDATAIO_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const slug = LEAGUE_SLUGS[league] || "nba";
    const meta: Record<string, any> = { league, mode };

    // ── Pre-fetch player external_id → UUID mapping ──
    const { data: allPlayers } = await supabase
      .from("players")
      .select("id, external_id, name")
      .eq("league", league)
      .not("external_id", "is", null);

    const playerByExtId = new Map<string, string>();
    const playerByName = new Map<string, string>();
    for (const p of allPlayers || []) {
      if (p.external_id) playerByExtId.set(p.external_id, p.id);
      playerByName.set(p.name.toLowerCase(), p.id);
    }

    function resolvePlayerId(extId: string | number | null, name: string): string | null {
      if (extId) {
        const id = playerByExtId.get(String(extId));
        if (id) return id;
      }
      return playerByName.get(name.toLowerCase()) || null;
    }

    // ── INJURIES ──
    // NBA/NHL/MLB/NFL injuries are in the Players endpoint with InjuryStatus field
    if (mode === "injuries" || mode === "both") {
      const resp = await fetch(`${SDIO_API_BASE}/${slug}/scores/json/Players?key=${sdioKey}`);
      if (!resp.ok) throw new Error(`Players API error: ${resp.status}`);
      const players = await resp.json();

      // Filter to only injured players
      const injured = players.filter((p: any) =>
        p.InjuryStatus && p.InjuryStatus !== "" && p.InjuryStatus !== null
      );

      const records = injured.map((p: any) => {
        const name = `${p.FirstName || ""} ${p.LastName || ""}`.trim();
        return {
          player_name: name,
          team_abbr: p.Team || "",
          league,
          status: p.InjuryStatus || null,
          body_part: p.InjuryBodyPart || null,
          notes: p.InjuryNotes || null,
          start_date: p.InjuryStartDate ? p.InjuryStartDate.split("T")[0] : null,
          external_player_id: p.PlayerID ? String(p.PlayerID) : null,
          player_id: resolvePlayerId(p.PlayerID, name),
        };
      });

      // Clear old injuries for this league and insert fresh
      await supabase.from("injuries").delete().eq("league", league);
      for (let i = 0; i < records.length; i += BATCH) {
        const batch = records.slice(i, i + BATCH);
        const { error } = await supabase.from("injuries").insert(batch);
        if (error) console.error("Injuries insert error:", error.message);
      }
      meta.injuries_upserted = records.length;
    }

    // ── DEPTH CHARTS ──
    if (mode === "depth_charts" || mode === "both") {
      if (mode === "both") await sleep(THROTTLE_MS);

      // Try the DepthCharts endpoint (available for NFL always, NBA/MLB/NHL varies)
      const resp = await fetch(`${SDIO_API_BASE}/${slug}/scores/json/DepthCharts?key=${sdioKey}`);
      if (!resp.ok) {
        console.warn(`DepthCharts endpoint not available: ${resp.status}`);
        meta.depth_chart_entries = 0;
        meta.depth_chart_note = `DepthCharts endpoint returned ${resp.status}`;
      } else {
        const depthCharts = await resp.json();

        const records: any[] = [];
        for (const dc of depthCharts) {
          const teamAbbr = dc.Team || dc.Key || "";
          // Handle different response structures across leagues
          const positions = dc.DepthCharts || dc.Positions || [];
          for (const pos of positions) {
            const posName = pos.Position || pos.Name || "";
            const players = pos.Players || pos.DepthChartPlayers || [];
            for (const p of players) {
              const name = p.Name || `${p.FirstName || ""} ${p.LastName || ""}`.trim();
              records.push({
                team_abbr: teamAbbr,
                league,
                position: posName,
                depth_order: p.DepthOrder || p.Order || 1,
                player_name: name,
                external_player_id: p.PlayerID ? String(p.PlayerID) : null,
                player_id: resolvePlayerId(p.PlayerID, name),
              });
            }
          }
        }

        // Clear + insert fresh
        await supabase.from("depth_charts").delete().eq("league", league);
        for (let i = 0; i < records.length; i += BATCH) {
          const batch = records.slice(i, i + BATCH);
          const { error } = await supabase.from("depth_charts").insert(batch);
          if (error) console.error("Depth charts insert error:", error.message);
        }
        meta.depth_chart_entries = records.length;
      }
    }

    return new Response(
      JSON.stringify({ success: true, meta, fetched_at: new Date().toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("fetch-injuries-lineups error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
