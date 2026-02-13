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
    const date = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
    const mode = url.searchParams.get("mode") || "pregame"; // pregame | live | both

    const sdioKey = Deno.env.get("SPORTSDATAIO_API_KEY");
    if (!sdioKey) throw new Error("SPORTSDATAIO_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const slug = LEAGUE_SLUGS[league] || "nba";
    const meta: Record<string, any> = { league, mode, date };

    // ── PRE-GAME LINES ──
    if (mode === "pregame" || mode === "both") {
      const dateFormatted = date.replace(/-/g, "-"); // YYYY-MM-DD
      const resp = await fetch(
        `${SDIO_API_BASE}/${slug}/odds/json/GameOddsByDate/${dateFormatted}?key=${sdioKey}`
      );
      if (!resp.ok) throw new Error(`Pre-game lines error: ${resp.status}`);
      const gameOdds = await resp.json();

      const records: any[] = [];
      for (const go of gameOdds) {
        const externalGameId = go.GameId ? String(go.GameId) : null;
        
        // Try to resolve game_id
        let gameId: string | null = null;
        if (externalGameId) {
          const { data: g } = await supabase
            .from("games")
            .select("id")
            .eq("external_id", `sdio_${externalGameId}`)
            .maybeSingle();
          gameId = g?.id || null;
        }

        for (const line of go.PregameOdds || go.Odds || []) {
          const sportsbook = line.Sportsbook || line.SportsbookName || "Unknown";

          // Spread
          if (line.HomePointSpread != null) {
            records.push({
              game_id: gameId,
              external_game_id: externalGameId,
              sportsbook,
              market_type: "spread",
              home_line: line.HomePointSpread,
              away_line: line.AwayPointSpread,
              home_price: line.HomePointSpreadPayout || null,
              away_price: line.AwayPointSpreadPayout || null,
              is_live: false,
              league,
            });
          }

          // Moneyline
          if (line.HomeMoneyLine != null) {
            records.push({
              game_id: gameId,
              external_game_id: externalGameId,
              sportsbook,
              market_type: "moneyline",
              home_price: line.HomeMoneyLine,
              away_price: line.AwayMoneyLine,
              is_live: false,
              league,
            });
          }

          // Total
          if (line.OverUnder != null) {
            records.push({
              game_id: gameId,
              external_game_id: externalGameId,
              sportsbook,
              market_type: "total",
              home_line: line.OverUnder,
              over_price: line.OverPayout || null,
              under_price: line.UnderPayout || null,
              is_live: false,
              league,
            });
          }
        }
      }

      for (let i = 0; i < records.length; i += BATCH) {
        const batch = records.slice(i, i + BATCH);
        const { error } = await supabase
          .from("sdio_game_lines")
          .upsert(batch, { onConflict: "external_game_id,sportsbook,market_type,is_live", ignoreDuplicates: false });
        if (error) console.error("Pregame lines upsert error:", error.message);
      }
      meta.pregame_lines_upserted = records.length;
    }

    // ── LIVE / IN-PLAY LINES ──
    if (mode === "live" || mode === "both") {
      await sleep(THROTTLE_MS);

      const dateFormatted = date.replace(/-/g, "-");
      const resp = await fetch(
        `${SDIO_API_BASE}/${slug}/odds/json/LiveGameOddsByDate/${dateFormatted}?key=${sdioKey}`
      );
      if (!resp.ok) {
        // Live endpoint may 404 if no live games — not an error
        if (resp.status === 404) {
          meta.live_lines_upserted = 0;
          meta.live_note = "No live games for this date";
        } else {
          throw new Error(`Live lines error: ${resp.status}`);
        }
      } else {
        const liveOdds = await resp.json();
        const records: any[] = [];

        for (const go of liveOdds) {
          const externalGameId = go.GameId ? String(go.GameId) : null;
          let gameId: string | null = null;
          if (externalGameId) {
            const { data: g } = await supabase
              .from("games")
              .select("id")
              .eq("external_id", `sdio_${externalGameId}`)
              .maybeSingle();
            gameId = g?.id || null;
          }

          for (const line of go.LiveOdds || go.Odds || []) {
            const sportsbook = line.Sportsbook || line.SportsbookName || "Unknown";

            if (line.HomePointSpread != null) {
              records.push({
                game_id: gameId,
                external_game_id: externalGameId,
                sportsbook,
                market_type: "spread",
                home_line: line.HomePointSpread,
                away_line: line.AwayPointSpread,
                home_price: line.HomePointSpreadPayout || null,
                away_price: line.AwayPointSpreadPayout || null,
                is_live: true,
                league,
              });
            }

            if (line.HomeMoneyLine != null) {
              records.push({
                game_id: gameId,
                external_game_id: externalGameId,
                sportsbook,
                market_type: "moneyline",
                home_price: line.HomeMoneyLine,
                away_price: line.AwayMoneyLine,
                is_live: true,
                league,
              });
            }

            if (line.OverUnder != null) {
              records.push({
                game_id: gameId,
                external_game_id: externalGameId,
                sportsbook,
                market_type: "total",
                home_line: line.OverUnder,
                over_price: line.OverPayout || null,
                under_price: line.UnderPayout || null,
                is_live: true,
                league,
              });
            }
          }
        }

        for (let i = 0; i < records.length; i += BATCH) {
          const batch = records.slice(i, i + BATCH);
          const { error } = await supabase
            .from("sdio_game_lines")
            .upsert(batch, { onConflict: "external_game_id,sportsbook,market_type,is_live", ignoreDuplicates: false });
          if (error) console.error("Live lines upsert error:", error.message);
        }
        meta.live_lines_upserted = records.length;
      }
    }

    return new Response(
      JSON.stringify({ success: true, meta, fetched_at: new Date().toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("fetch-sdio-lines error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
