import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BOLTODDS_KEY = Deno.env.get("BOLTODDS_API_KEY") ?? "";

const DEFAULT_FILTERS: Record<string, string[]> = {
  sports: ["MLB", "NHL"],
  sportsbooks: ["draftkings", "fanduel", "betmgm", "caesars"],
  markets: [
    "Moneyline", "Spread", "Total",
    "Hits", "Home Runs", "Strikeouts",
    "Total Bases", "Points", "Goals",
    "Assists", "Shots on Goal",
  ],
};

const MAX_RUNTIME_MS = 140_000;

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
  let filters = { ...DEFAULT_FILTERS };
  try {
    const body = await req.json().catch(() => null);
    if (body?.filters) filters = { ...DEFAULT_FILTERS, ...body.filters };
  } catch { /* use defaults */ }

  await upsertConnectionStatus(sb, "connecting", filters);

  const wsUrl = `wss://spro.agency/api?key=${BOLTODDS_KEY}`;
  let messageCount = 0;
  const startTime = Date.now();

  return new Promise<Response>((resolve) => {
    const timeout = setTimeout(() => {
      logMsg(sb, "timeout_close", { runtime_ms: Date.now() - startTime, messages: messageCount });
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
      console.log("[BoltOdds] WebSocket opened, waiting for socket_connected ack...");
      logMsg(sb, "ws_open", null);
    };

    ws.onmessage = async (event) => {
      messageCount++;
      try {
        // BoltOdds may send Blob or string — handle both
        let raw: string;
        if (typeof event.data === "string") {
          raw = event.data;
        } else if (event.data instanceof Blob) {
          raw = await event.data.text();
        } else {
          raw = String(event.data);
        }
        const data = JSON.parse(raw);
        const action = data.action ?? "unknown";

        // Log messages (first 50, then sample)
        if (messageCount <= 50 || messageCount % 100 === 0) {
          await sb.from("bolt_socket_logs").insert({
            message_type: action,
            sport: data.data?.sport ?? null,
            payload: messageCount <= 20 ? data : { action, keys: Object.keys(data) },
          });
        }

        // Update last_message_at periodically
        if (messageCount % 10 === 0) {
          await upsertConnectionStatus(sb, "connected", filters);
        }

        switch (action) {
          case "socket_connected": {
            console.log("[BoltOdds] Authenticated! Sending subscribe with filters:", JSON.stringify(filters));
            await upsertConnectionStatus(sb, "connected", filters);
            // BoltOdds uses "action": "subscribe" with "filters" object
            ws.send(JSON.stringify({
              action: "subscribe",
              filters: {
                sports: filters.sports,
                sportsbooks: filters.sportsbooks,
                markets: filters.markets,
              },
            }));
            break;
          }

          case "subscription_updated": {
            console.log("[BoltOdds] Subscription confirmed:", data.message);
            await logMsg(sb, "subscription_updated", data);
            break;
          }

          case "initial_state":
          case "game_update": {
            await handleGameData(sb, data);
            break;
          }

          case "line_update": {
            await handleLineUpdate(sb, data);
            break;
          }

          case "game_removed": {
            await handleGameRemoved(sb, data);
            break;
          }

          case "sport_clear":
          case "book_clear": {
            await handleClear(sb, data, action);
            break;
          }

          case "ping": {
            ws.send(JSON.stringify({ action: "pong" }));
            break;
          }

          case "error": {
            console.error("[BoltOdds] Error:", data.message);
            await logMsg(sb, "error", data);
            break;
          }

          default:
            console.log(`[BoltOdds] Unknown action: ${action}`);
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
  });
});

// ─── Helpers ───

function logMsg(sb: ReturnType<typeof createClient>, type: string, payload: unknown) {
  sb.from("bolt_socket_logs").insert({ message_type: type, payload: payload as Record<string, unknown> }).then(() => {});
}

async function upsertConnectionStatus(
  sb: ReturnType<typeof createClient>,
  status: string,
  filters: Record<string, unknown>,
  error?: string
) {
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

/**
 * Handle initial_state and game_update messages.
 * BoltOdds format:
 * {
 *   action: "initial_state" | "game_update",
 *   timestamp: "...",
 *   data: {
 *     sport: "MLB",
 *     sportsbook: "draftkings",
 *     game: "Team A vs Team B, 2025-07-23, 01",
 *     home_team: "Team A",
 *     away_team: "Team B",
 *     info: { id, game, when, link },
 *     outcomes: {
 *       "Team A Moneyline": { odds: "-150", outcome_name, outcome_line, outcome_over_under, outcome_target, link },
 *       ...
 *     }
 *   }
 * }
 */
async function handleGameData(sb: ReturnType<typeof createClient>, msg: Record<string, unknown>) {
  const d = msg.data as Record<string, unknown> | undefined;
  if (!d) return;

  const gameKey = String(d.game ?? "");
  const sport = String(d.sport ?? "");
  const sportsbook = String(d.sportsbook ?? "");
  const homeTeam = String(d.home_team ?? "");
  const awayTeam = String(d.away_team ?? "");
  const info = (d.info ?? {}) as Record<string, unknown>;
  const startTime = info.when ? String(info.when) : null;

  if (!gameKey) return;

  // Upsert game
  await sb.from("bolt_games").upsert({
    bolt_game_id: gameKey,
    sport,
    league: sport,
    home_team: homeTeam,
    away_team: awayTeam,
    start_time: startTime,
    status: "active",
    is_active: true,
    raw_data: d,
    updated_at: new Date().toISOString(),
  }, { onConflict: "bolt_game_id" });

  // Process outcomes
  const outcomes = (d.outcomes ?? {}) as Record<string, Record<string, unknown>>;
  await upsertOutcomes(sb, gameKey, sportsbook, outcomes);
}

/**
 * Outcomes are keyed by a composite name like "Team A Moneyline"
 * Each has: odds (string, can be None/""), outcome_name, outcome_line, outcome_over_under, outcome_target, link
 */
async function upsertOutcomes(
  sb: ReturnType<typeof createClient>,
  gameKey: string,
  sportsbook: string,
  outcomes: Record<string, Record<string, unknown>>
) {
  for (const [outcomeKey, o] of Object.entries(outcomes)) {
    const outcomeName = String(o.outcome_name ?? "");
    const marketKey = outcomeName || outcomeKey;
    const oddsStr = o.odds;
    const isSuspended = oddsStr === null || oddsStr === "" || oddsStr === "None";
    const americanOdds = isSuspended ? null : parseInt(String(oddsStr), 10);

    // Upsert market (group by game + market name)
    const { data: mkt } = await sb.from("bolt_markets").upsert({
      bolt_game_id: gameKey,
      market_key: marketKey,
      market_name: outcomeName,
      market_type: outcomeName,
      player_name: o.outcome_target ? String(o.outcome_target) : null,
      is_suspended: isSuspended,
      raw_data: { outcomeKey, ...o },
      updated_at: new Date().toISOString(),
    }, { onConflict: "bolt_game_id,market_key" }).select("id").single();

    if (!mkt?.id) continue;

    // Upsert outcome
    const line = o.outcome_line != null ? Number(o.outcome_line) : null;
    await sb.from("bolt_outcomes").upsert({
      market_id: mkt.id,
      sportsbook,
      outcome_name: String(o.outcome_target ?? outcomeKey),
      line,
      odds: americanOdds != null && !isNaN(americanOdds)
        ? (americanOdds < 0 ? (100 / (Math.abs(americanOdds) + 100)) : (americanOdds / (americanOdds + 100)))
        : null,
      american_odds: isNaN(americanOdds ?? NaN) ? null : americanOdds,
      is_suspended: isSuspended,
      raw_data: o,
      updated_at: new Date().toISOString(),
    }, { onConflict: "market_id,sportsbook,outcome_name" });
  }
}

async function handleLineUpdate(sb: ReturnType<typeof createClient>, msg: Record<string, unknown>) {
  // Same shape as game_update but only changed lines
  await handleGameData(sb, msg);
}

async function handleGameRemoved(sb: ReturnType<typeof createClient>, msg: Record<string, unknown>) {
  const d = msg.data as Record<string, unknown> | undefined;
  const gameKey = String(d?.game ?? "");
  if (gameKey) {
    await sb.from("bolt_games").update({
      is_active: false,
      status: "removed",
      updated_at: new Date().toISOString(),
    }).eq("bolt_game_id", gameKey);
  }
}

async function handleClear(sb: ReturnType<typeof createClient>, msg: Record<string, unknown>, action: string) {
  const d = msg.data as Record<string, unknown> | undefined;
  if (action === "sport_clear") {
    const sport = String(d?.sport ?? "");
    if (sport) {
      await sb.from("bolt_games").update({ is_active: false, status: "stale" }).eq("sport", sport);
    }
  } else if (action === "book_clear") {
    const book = String(d?.sportsbook ?? "");
    if (book) {
      await sb.from("bolt_outcomes").update({ is_suspended: true }).eq("sportsbook", book);
    }
  }
  await sb.from("bolt_socket_logs").insert({ message_type: action, payload: msg });
}
