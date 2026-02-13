import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const THE_ODDS_API_BASE = "https://api.the-odds-api.com/v4";

const SPORT_KEYS: Record<string, string> = {
  NBA: "basketball_nba",
  NFL: "americanfootball_nfl",
  MLB: "baseball_mlb",
  NHL: "icehockey_nhl",
};

// NBA player prop markets
const PLAYER_PROP_MARKETS = [
  "player_points",
  "player_rebounds",
  "player_assists",
  "player_threes",
  "player_blocks",
  "player_steals",
  "player_points_rebounds_assists",
  "player_turnovers",
  "player_double_double",
];

const MARKET_LABELS: Record<string, string> = {
  player_points: "Points",
  player_rebounds: "Rebounds",
  player_assists: "Assists",
  player_threes: "3-Pointers",
  player_blocks: "Blocks",
  player_steals: "Steals",
  player_points_rebounds_assists: "Pts+Reb+Ast",
  player_turnovers: "Turnovers",
  player_double_double: "Double-Double",
};

interface PropRow {
  game_id: string;
  external_event_id: string;
  player_name: string;
  market_key: string;
  market_label: string;
  bookmaker: string;
  line: number | null;
  over_price: number | null;
  under_price: number | null;
}

async function fetchPropsForEvent(
  apiKey: string,
  sportKey: string,
  eventId: string,
  markets: string[]
): Promise<PropRow[]> {
  const props: PropRow[] = [];

  // Fetch in batches of 3 markets to stay within response size limits
  for (let i = 0; i < markets.length; i += 3) {
    const batch = markets.slice(i, i + 3);
    const marketsParam = batch.join(",");
    const url = `${THE_ODDS_API_BASE}/sports/${sportKey}/events/${eventId}/odds?apiKey=${apiKey}&regions=us&markets=${marketsParam}&oddsFormat=american`;

    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        console.warn(`Props API ${resp.status} for event ${eventId}, markets ${marketsParam}`);
        continue;
      }

      const data = await resp.json();
      const remaining = resp.headers.get("x-requests-remaining");
      console.log(`Odds API remaining: ${remaining}`);

      for (const bk of data.bookmakers || []) {
        for (const market of bk.markets || []) {
          // Group outcomes by player (description field)
          const playerOutcomes = new Map<string, { over?: any; under?: any }>();

          for (const outcome of market.outcomes || []) {
            const playerName = outcome.description || outcome.name;
            if (!playerOutcomes.has(playerName)) {
              playerOutcomes.set(playerName, {});
            }
            const entry = playerOutcomes.get(playerName)!;
            if (outcome.name === "Over") entry.over = outcome;
            else if (outcome.name === "Under") entry.under = outcome;
          }

          for (const [playerName, outcomes] of playerOutcomes) {
            props.push({
              game_id: "", // will be set later
              external_event_id: eventId,
              player_name: playerName,
              market_key: market.key,
              market_label: MARKET_LABELS[market.key] || market.key,
              bookmaker: bk.key,
              line: outcomes.over?.point ?? outcomes.under?.point ?? null,
              over_price: outcomes.over?.price ?? null,
              under_price: outcomes.under?.price ?? null,
            });
          }
        }
      }
    } catch (err) {
      console.error(`Error fetching props for event ${eventId}:`, err);
    }
  }

  return props;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("THE_ODDS_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "THE_ODDS_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const url = new URL(req.url);
    const league = url.searchParams.get("league") || "NBA";
    const gameId = url.searchParams.get("game_id"); // optional: fetch for specific game
    const sportKey = SPORT_KEYS[league];

    if (!sportKey) {
      return new Response(
        JSON.stringify({ error: `Unsupported league: ${league}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If a specific game_id is provided, look up its external_id
    let targetEvents: { eventId: string; gameId: string }[] = [];

    if (gameId) {
      const { data: game } = await supabase
        .from("games")
        .select("id, external_id")
        .eq("id", gameId)
        .single();

      if (!game?.external_id) {
        return new Response(
          JSON.stringify({ error: "Game not found or no external_id" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      targetEvents = [{ eventId: game.external_id, gameId: game.id }];
    } else {
      // Fetch today's events from The Odds API to get event IDs
      const eventsUrl = `${THE_ODDS_API_BASE}/sports/${sportKey}/events?apiKey=${apiKey}`;
      const eventsResp = await fetch(eventsUrl);
      if (!eventsResp.ok) {
        return new Response(
          JSON.stringify({ error: `Events API error: ${eventsResp.status}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const events = await eventsResp.json();

      // Match events to our games table
      for (const event of events) {
        const { data: game } = await supabase
          .from("games")
          .select("id")
          .eq("external_id", event.id)
          .maybeSingle();

        if (game) {
          targetEvents.push({ eventId: event.id, gameId: game.id });
        }
      }

      // Limit to 5 events to conserve API quota
      targetEvents = targetEvents.slice(0, 5);
    }

    console.log(`Fetching props for ${targetEvents.length} events in ${league}`);

    let totalProps = 0;
    for (const { eventId, gameId: gId } of targetEvents) {
      const props = await fetchPropsForEvent(apiKey, sportKey, eventId, PLAYER_PROP_MARKETS);

      if (props.length === 0) continue;

      // Set game_id on all props
      const propsWithGameId = props.map(p => ({ ...p, game_id: gId }));

      // Delete old props for this game, then insert fresh
      await supabase.from("player_props").delete().eq("game_id", gId);

      // Batch insert in chunks of 100
      for (let i = 0; i < propsWithGameId.length; i += 100) {
        const chunk = propsWithGameId.slice(i, i + 100);
        const { error } = await supabase.from("player_props").insert(chunk);
        if (error) console.error("Insert error:", error.message);
      }

      totalProps += propsWithGameId.length;
    }

    return new Response(
      JSON.stringify({
        success: true,
        events_processed: targetEvents.length,
        props_stored: totalProps,
        fetched_at: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("fetch-player-props error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
