import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BOLTODDS_KEY = Deno.env.get("BOLTODDS_API_KEY") ?? "";

const DEFAULT_FILTERS = {
  sports: ["baseball", "hockey"],
  sportsbooks: ["draftkings", "fanduel", "betmgm", "caesars"],
  markets: [
    "moneyline", "spread", "total",
    "player_hits", "player_home_runs", "player_strikeouts",
    "player_total_bases", "player_points", "player_goals",
    "player_assists", "player_shots_on_goal",
  ],
};

const MAX_RUNTIME_MS = 140_000; // ~2.3 min, stay under edge function limit

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  if (!BOLTODDS_KEY) {
    return new Response(
      JSON.stringify({ error: "BOLTODDS_API_KEY not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Parse optional custom filters from body
  let filters = DEFAULT_FILTERS;
  try {
    const body = await req.json().catch(() => null);
    if (body?.filters) filters = { ...DEFAULT_FILTERS, ...body.filters };
  } catch { /* use defaults */ }

  // Update connection status
  await upsertConnectionStatus(sb, "connecting", filters);

  const wsUrl = `wss://spro.agency/api?key=${BOLTODDS_KEY}`;
  let messageCount = 0;
  const startTime = Date.now();

  return new Promise<Response>((resolve) => {
    const timeout = setTimeout(() => {
      logMsg("timeout_close", null);
      try { ws.close(1000, "edge function timeout"); } catch {}
      resolve(
        new Response(
          JSON.stringify({ ok: true, messages: messageCount, runtime_ms: Date.now() - startTime }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
      );
    }, MAX_RUNTIME_MS);

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log("[BoltOdds] WebSocket opened");
      logMsg("ws_open", null);
    };

    ws.onmessage = async (event) => {
      messageCount++;
      try {
        const data = JSON.parse(event.data);
        const msgType = data.type ?? data.event ?? "unknown";

        // Log every message type (first 50, then sample)
        if (messageCount <= 50 || messageCount % 100 === 0) {
          await sb.from("bolt_socket_logs").insert({
            message_type: msgType,
            sport: data.sport ?? data.data?.sport ?? null,
            payload: messageCount <= 20 ? data : { type: msgType, keys: Object.keys(data) },
          });
        }

        // Update last_message_at
        if (messageCount % 10 === 0) {
          await upsertConnectionStatus(sb, "connected", filters);
        }

        switch (msgType) {
          case "socket_connected":
            console.log("[BoltOdds] Socket connected, sending subscribe");
            await upsertConnectionStatus(sb, "connected", filters);
            // Send subscribe
            ws.send(JSON.stringify({
              type: "subscribe",
              sports: filters.sports,
              sportsbooks: filters.sportsbooks,
              markets: filters.markets,
            }));
            break;

          case "initial_state":
          case "game_update":
            await handleGameUpdate(sb, data);
            break;

          case "line_update":
            await handleLineUpdate(sb, data);
            break;

          case "game_removed":
            await handleGameRemoved(sb, data);
            break;

          case "sport_clear":
          case "book_clear":
            await handleClear(sb, data, msgType);
            break;

          case "ping":
            ws.send(JSON.stringify({ type: "pong" }));
            break;

          default:
            console.log(`[BoltOdds] Unknown message type: ${msgType}`);
        }
      } catch (err) {
        console.error("[BoltOdds] Message processing error:", err);
      }
    };

    ws.onerror = (err) => {
      console.error("[BoltOdds] WebSocket error:", err);
      upsertConnectionStatus(sb, "error", filters, String(err));
    };

    ws.onclose = (event) => {
      console.log(`[BoltOdds] WebSocket closed: ${event.code} ${event.reason}`);
      clearTimeout(timeout);
      upsertConnectionStatus(sb, "disconnected", filters);
      resolve(
        new Response(
          JSON.stringify({ ok: true, messages: messageCount, runtime_ms: Date.now() - startTime, close_code: event.code }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
      );
    };

    function logMsg(type: string, payload: unknown) {
      sb.from("bolt_socket_logs").insert({ message_type: type, payload: payload as Record<string, unknown> }).then(() => {});
    }
  });
});

// ─── Helpers ───

async function upsertConnectionStatus(
  sb: ReturnType<typeof createClient>,
  status: string,
  filters: Record<string, unknown>,
  error?: string
) {
  // Use a single-row pattern
  const { data: existing } = await sb.from("bolt_connection_status").select("id").limit(1).single();
  const row = {
    status,
    subscription_filters: filters,
    last_message_at: status === "connected" ? new Date().toISOString() : undefined,
    last_connected_at: status === "connected" ? new Date().toISOString() : undefined,
    last_error: error ?? null,
    updated_at: new Date().toISOString(),
  };
  if (existing?.id) {
    await sb.from("bolt_connection_status").update(row).eq("id", existing.id);
  } else {
    await sb.from("bolt_connection_status").insert({ ...row, reconnect_count: 0 });
  }
}

async function handleGameUpdate(sb: ReturnType<typeof createClient>, data: Record<string, unknown>) {
  const game = (data.data ?? data.game ?? data) as Record<string, unknown>;
  const gameId = String(game.id ?? game.game_id ?? game.key ?? "");
  if (!gameId) return;

  // Upsert game
  await sb.from("bolt_games").upsert({
    bolt_game_id: gameId,
    sport: String(game.sport ?? ""),
    league: String(game.league ?? game.sport ?? ""),
    home_team: String(game.home ?? game.home_team ?? ""),
    away_team: String(game.away ?? game.away_team ?? ""),
    start_time: game.start_time ?? game.commence_time ?? null,
    status: "active",
    is_active: true,
    raw_data: game,
    updated_at: new Date().toISOString(),
  }, { onConflict: "bolt_game_id" });

  // Process markets/lines if present
  const markets = (game.markets ?? game.lines ?? game.odds ?? []) as Record<string, unknown>[];
  if (Array.isArray(markets)) {
    for (const market of markets) {
      await upsertMarketAndOutcomes(sb, gameId, market);
    }
  }
}

async function upsertMarketAndOutcomes(
  sb: ReturnType<typeof createClient>,
  gameId: string,
  market: Record<string, unknown>
) {
  const marketKey = String(market.key ?? market.market ?? market.type ?? `${gameId}_${Date.now()}`);
  const { data: mkt } = await sb.from("bolt_markets").upsert({
    bolt_game_id: gameId,
    market_key: marketKey,
    market_name: String(market.name ?? market.market ?? marketKey),
    market_type: String(market.type ?? market.category ?? ""),
    player_name: market.player ? String(market.player) : null,
    is_suspended: !market.odds && !market.outcomes,
    raw_data: market,
    updated_at: new Date().toISOString(),
  }, { onConflict: "bolt_game_id,market_key" }).select("id").single();

  if (!mkt?.id) return;

  const outcomes = (market.outcomes ?? market.odds ?? market.lines ?? []) as Record<string, unknown>[];
  if (Array.isArray(outcomes)) {
    for (const o of outcomes) {
      const book = String(o.sportsbook ?? o.book ?? "unknown");
      await sb.from("bolt_outcomes").upsert({
        market_id: mkt.id,
        sportsbook: book,
        outcome_name: String(o.name ?? o.outcome ?? o.label ?? ""),
        line: o.line != null ? Number(o.line) : null,
        odds: o.odds != null ? Number(o.odds) : null,
        american_odds: o.american_odds != null ? Number(o.american_odds) : (o.price != null ? Number(o.price) : null),
        is_suspended: o.odds == null && o.price == null,
        raw_data: o,
        updated_at: new Date().toISOString(),
      }, { onConflict: "market_id,sportsbook,outcome_name" });
    }
  }
}

async function handleLineUpdate(sb: ReturnType<typeof createClient>, data: Record<string, unknown>) {
  // line_update is a partial update — same shape as game_update but only changed lines
  await handleGameUpdate(sb, data);
}

async function handleGameRemoved(sb: ReturnType<typeof createClient>, data: Record<string, unknown>) {
  const gameId = String((data as Record<string, unknown>).game_id ?? (data as Record<string, unknown>).id ?? "");
  if (gameId) {
    await sb.from("bolt_games").update({ is_active: false, status: "removed", updated_at: new Date().toISOString() }).eq("bolt_game_id", gameId);
  }
}

async function handleClear(sb: ReturnType<typeof createClient>, data: Record<string, unknown>, type: string) {
  if (type === "sport_clear") {
    const sport = String(data.sport ?? "");
    if (sport) {
      await sb.from("bolt_games").update({ is_active: false, status: "stale" }).eq("sport", sport);
    }
  } else if (type === "book_clear") {
    const book = String(data.sportsbook ?? data.book ?? "");
    if (book) {
      await sb.from("bolt_outcomes").update({ is_suspended: true }).eq("sportsbook", book);
    }
  }
  await sb.from("bolt_socket_logs").insert({ message_type: type, payload: data });
}
