// SportsDataIO Player Headshots
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SDIO_API_BASE = "https://api.sportsdata.io/v3";
const LEAGUE_SLUGS: Record<string, string> = { NBA: "nba", NFL: "nfl", MLB: "mlb", NHL: "nhl" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const league = (url.searchParams.get("league") || "NBA").toUpperCase();

    const sdioKey = Deno.env.get("SPORTSDATAIO_API_KEY");
    if (!sdioKey) throw new Error("SPORTSDATAIO_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const slug = LEAGUE_SLUGS[league] || "nba";

    // SportsDataIO Headshots endpoint — try multiple known paths
    const paths = [
      `${SDIO_API_BASE}/${slug}/scores/json/Headshots?key=${sdioKey}`,
      `${SDIO_API_BASE}/${slug}/headshots/json/Headshots?key=${sdioKey}`,
    ];

    let headshots: any[] = [];
    let usedPath = "";
    for (const p of paths) {
      const resp = await fetch(p);
      if (resp.ok) {
        headshots = await resp.json();
        usedPath = p;
        break;
      }
    }

    if (headshots.length === 0) {
      // Fallback: extract PhotoUrl from Players endpoint
      const resp = await fetch(`${SDIO_API_BASE}/${slug}/scores/json/Players?key=${sdioKey}`);
      if (resp.ok) {
        const players = await resp.json();
        headshots = players
          .filter((p: any) => p.PhotoUrl)
          .map((p: any) => ({
            PlayerID: p.PlayerID,
            Name: `${p.FirstName || ""} ${p.LastName || ""}`.trim(),
            PreferredHostedHeadshotUrl: p.PhotoUrl,
          }));
        usedPath = "Players fallback";
      }
    }

    // Pre-fetch all players for this league
    const { data: players } = await supabase
      .from("players")
      .select("id, external_id, name")
      .eq("league", league);

    const playerByExtId = new Map<string, string>();
    const playerByName = new Map<string, string>();
    for (const p of players || []) {
      if (p.external_id) playerByExtId.set(p.external_id, p.id);
      playerByName.set(p.name.toLowerCase(), p.id);
    }

    let updated = 0;

    for (const hs of headshots) {
      const photoUrl = hs.PreferredHostedHeadshotUrl || hs.HostedUrl || hs.Url || hs.PhotoUrl || null;
      if (!photoUrl) continue;

      const name = hs.Name || `${hs.FirstName || ""} ${hs.LastName || ""}`.trim();
      const extId = hs.PlayerID ? String(hs.PlayerID) : null;

      let playerId: string | null = null;
      if (extId) playerId = playerByExtId.get(extId) || null;
      if (!playerId && name) playerId = playerByName.get(name.toLowerCase()) || null;

      if (playerId) {
        const { error } = await supabase
          .from("players")
          .update({ headshot_url: photoUrl } as any)
          .eq("id", playerId);
        if (!error) updated++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        meta: { league, used_path: usedPath, total_headshots: headshots.length, players_updated: updated },
        fetched_at: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("fetch-headshots error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
