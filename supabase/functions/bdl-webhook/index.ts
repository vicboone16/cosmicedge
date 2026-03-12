import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * BDL Webhook Receiver
 *
 * Receives push notifications from BallDontLie for game lifecycle events:
 *   - nba.game.started / nba.game.ended
 *   - nhl.game.started / nhl.game.ended
 *   - mlb.game.started / mlb.game.ended
 *   - ncaab.game.started / ncaab.game.ended
 *
 * Updates the `games` table status accordingly, so we don't need to poll
 * for game start/end transitions.
 *
 * Signature verification uses HMAC-SHA256 per BDL docs.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ── HMAC signature verification ──

async function verifySignature(
  rawBody: string,
  timestamp: string,
  signature: string,
  secret: string
): Promise<boolean> {
  if (!timestamp || !signature || !secret) return false;

  const message = `${timestamp}.${rawBody}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  const expected = "v1=" + Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Constant-time comparison
  if (expected.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return mismatch === 0;
}

// ── League mapping ──

const EVENT_LEAGUE_MAP: Record<string, string> = {
  nba: "NBA",
  nhl: "NHL",
  mlb: "MLB",
  ncaab: "NCAAB",
  ncaaw: "NCAAW",
};

// ── Team abbreviation normalization ──

function teamAbbr(team: any): string {
  if (!team) return "";
  return (team.abbreviation || team.abbr || team.name || "").toUpperCase();
}

Deno.serve(async (req) => {
  // Only accept POST
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const rawBody = await req.text();

  // ── Signature verification ──
  const WEBHOOK_SECRET = Deno.env.get("BDL_WEBHOOK_SECRET") ?? "";
  const timestamp = req.headers.get("x-bdl-webhook-timestamp") ?? "";
  const signature = req.headers.get("x-bdl-webhook-signature") ?? "";
  const eventId = req.headers.get("x-bdl-webhook-id") ?? "";

  if (WEBHOOK_SECRET) {
    const valid = await verifySignature(rawBody, timestamp, signature, WEBHOOK_SECRET);
    if (!valid) {
      console.warn("[bdl-webhook] Invalid signature, rejecting");
      return new Response("Invalid signature", { status: 401 });
    }
  } else {
    console.warn("[bdl-webhook] No BDL_WEBHOOK_SECRET set — skipping verification (dev mode)");
  }

  // ── Parse payload ──
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const eventType: string = payload.event_type ?? "";
  console.log(`[bdl-webhook] Received event: ${eventType}, id: ${eventId}`);

  // Parse event_type: e.g. "nba.game.started" → sport=nba, action=started
  const parts = eventType.split(".");
  if (parts.length < 3 || parts[1] !== "game") {
    // Not a game event we handle — acknowledge anyway
    return new Response(JSON.stringify({ ok: true, skipped: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const sport = parts[0]; // nba, nhl, mlb, ncaab
  const action = parts[2]; // started, ended, period_ended, overtime
  const league = EVENT_LEAGUE_MAP[sport] ?? sport.toUpperCase();

  const game = payload.game ?? payload.data?.game ?? payload.data ?? payload;
  const bdlGameId = String(game.id ?? "");

  if (!bdlGameId) {
    console.warn("[bdl-webhook] No game ID in payload");
    return new Response(JSON.stringify({ ok: false, error: "no game id" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  // ── Resolve internal game_key from provider_game_map ──
  const { data: mapping } = await sb
    .from("provider_game_map")
    .select("game_key")
    .eq("provider", "balldontlie")
    .eq("provider_game_id", bdlGameId)
    .maybeSingle();

  let gameKey = mapping?.game_key;

  // If no mapping yet, try to match by teams + date
  if (!gameKey) {
    const homeAbbr = teamAbbr(game.home_team);
    const awayAbbr = teamAbbr(game.visitor_team ?? game.away_team);
    const gameDate = game.date ?? game.game_date ?? "";

    if (homeAbbr && awayAbbr && gameDate) {
      const datePart = gameDate.substring(0, 10); // YYYY-MM-DD
      const { data: matched } = await sb
        .from("games")
        .select("id")
        .eq("league", league)
        .eq("home_abbr", homeAbbr)
        .eq("away_abbr", awayAbbr)
        .gte("start_time", `${datePart}T00:00:00Z`)
        .lte("start_time", `${datePart}T23:59:59Z`)
        .maybeSingle();

      if (matched) {
        gameKey = matched.id;
        // Save mapping for future lookups
        await sb.from("provider_game_map").upsert(
          {
            game_key: gameKey,
            provider: "balldontlie",
            provider_game_id: bdlGameId,
          },
          { onConflict: "game_key,provider" }
        );
        console.log(`[bdl-webhook] Created mapping: BDL ${bdlGameId} → ${gameKey}`);
      }
    }

    if (!gameKey) {
      console.warn(`[bdl-webhook] Could not resolve game for BDL ID ${bdlGameId}`);
      return new Response(JSON.stringify({ ok: false, error: "unmapped game" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // ── Apply status update ──
  let newStatus: string | null = null;
  const updateFields: Record<string, any> = { updated_at: new Date().toISOString() };

  if (action === "started") {
    newStatus = "live";
  } else if (action === "ended") {
    newStatus = "final";
    // Capture final scores if present
    const homeScore = game.home_team_score ?? game.home_score ?? null;
    const awayScore = game.visitor_team_score ?? game.away_team_score ?? game.away_score ?? null;
    if (homeScore != null) updateFields.home_score = Number(homeScore);
    if (awayScore != null) updateFields.away_score = Number(awayScore);
  } else if (action === "overtime") {
    newStatus = "live"; // stays live
  }
  // period_ended: don't change status, but could log

  if (newStatus) {
    updateFields.status = newStatus;
  }

  const { error } = await sb
    .from("games")
    .update(updateFields)
    .eq("id", gameKey);

  if (error) {
    console.error(`[bdl-webhook] Update error for ${gameKey}:`, error.message);
  } else {
    console.log(`[bdl-webhook] Game ${gameKey} → ${newStatus ?? action} (BDL ${bdlGameId})`);
  }

  // If game ended, settle bets
  if (action === "ended") {
    try {
      await sb.rpc("settle_bets_on_game", { p_game_id: gameKey });
      console.log(`[bdl-webhook] Settled bets for ${gameKey}`);
    } catch (e) {
      console.warn(`[bdl-webhook] Bet settlement error:`, e);
    }
  }

  // Log the webhook event for debugging
  await sb.from("audit_log").insert({
    action: `bdl_webhook_${action}`,
    entity_type: "game",
    entity_id: gameKey,
    meta: { event_type: eventType, bdl_game_id: bdlGameId, event_id: eventId },
  });

  return new Response(JSON.stringify({ ok: true, game_key: gameKey, action }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
