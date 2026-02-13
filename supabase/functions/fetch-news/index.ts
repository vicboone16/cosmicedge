import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SDIO_API_BASE = "https://api.sportsdata.io/v3";
const LEAGUE_SLUGS: Record<string, string> = { NBA: "nba", NFL: "nfl", MLB: "mlb", NHL: "nhl" };
const BATCH = 100;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const league = (url.searchParams.get("league") || "NBA").toUpperCase();
    const mode = url.searchParams.get("mode") || "recent"; // recent | by_date | by_player
    const date = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
    const playerId = url.searchParams.get("player_id") || "";

    const sdioKey = Deno.env.get("SPORTSDATAIO_API_KEY");
    if (!sdioKey) throw new Error("SPORTSDATAIO_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const slug = LEAGUE_SLUGS[league] || "nba";

    // Try multiple endpoint formats
    let newsUrl: string;
    if (mode === "by_date") {
      // SportsDataIO format: YYYY-MMM-DD (e.g., 2026-FEB-14)
      const d = new Date(date + "T12:00:00Z");
      const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
      const formatted = `${d.getFullYear()}-${months[d.getMonth()]}-${String(d.getDate()).padStart(2, "0")}`;
      newsUrl = `${SDIO_API_BASE}/${slug}/scores/json/NewsByDate/${formatted}?key=${sdioKey}`;
    } else if (mode === "by_player" && playerId) {
      newsUrl = `${SDIO_API_BASE}/${slug}/scores/json/NewsByPlayerID/${playerId}?key=${sdioKey}`;
    } else {
      newsUrl = `${SDIO_API_BASE}/${slug}/scores/json/News?key=${sdioKey}`;
    }

    const resp = await fetch(newsUrl);
    if (!resp.ok) {
      // If News feed not available, try Rotoballer News endpoint
      const altUrl = `${SDIO_API_BASE}/${slug}/scores/json/RotoballerNews?key=${sdioKey}`;
      const altResp = await fetch(altUrl);
      if (!altResp.ok) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `News API not available (${resp.status}). Your SportsDataIO subscription may not include the News & Images feed yet.`,
            meta: { league, mode, tried_urls: [newsUrl, altUrl] },
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // Use alt response
      var newsItems = await altResp.json();
    } else {
      var newsItems = await resp.json();
    }

    // Pre-fetch players for linking
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

    const records = newsItems
      .filter((n: any) => n.NewsID)
      .map((n: any) => {
        const playerName = (n.PlayerID && (n.FirstName || n.LastName))
          ? `${n.FirstName || ""} ${n.LastName || ""}`.trim()
          : null;
        const extId = n.PlayerID ? String(n.PlayerID) : null;
        let resolvedPlayerId: string | null = null;
        if (extId) resolvedPlayerId = playerByExtId.get(extId) || null;
        if (!resolvedPlayerId && playerName) resolvedPlayerId = playerByName.get(playerName.toLowerCase()) || null;

        return {
          external_news_id: n.NewsID,
          player_id: resolvedPlayerId,
          player_name: playerName,
          team_abbr: n.Team || null,
          league,
          title: n.Title || null,
          content: n.Content || null,
          source: n.OriginalSource || n.Source || "SportsDataIO",
          source_url: n.OriginalSourceUrl || n.Url || null,
          categories: n.Categories || null,
          is_breaking: false,
          published_at: n.Updated || n.TimeAgo || new Date().toISOString(),
        };
      });

    for (let i = 0; i < records.length; i += BATCH) {
      const batch = records.slice(i, i + BATCH);
      const { error } = await supabase
        .from("player_news")
        .upsert(batch, { onConflict: "external_news_id", ignoreDuplicates: false });
      if (error) console.error("News upsert error:", error.message);
    }

    return new Response(
      JSON.stringify({
        success: true,
        meta: { league, mode, news_upserted: records.length },
        fetched_at: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("fetch-news error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
