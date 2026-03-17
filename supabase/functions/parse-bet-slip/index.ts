import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "../_shared/cors.ts";

/* ─── Types ─── */
type PickInput = {
  player_name: string;
  stat_type: string;
  line: number;
  direction: "over" | "under";
  period?: string | null; // "q1","q2","q3","q4","1h","2h","first3","full"
  player_id?: string | null;
  match_status?: string;
  matched_name?: string;
  team?: string | null;
  game_id?: string | null;
  fuzzy_candidates?: unknown[];
};

type ErrorCode =
  | "invalid_link"
  | "unsupported_book"
  | "redirect_failed"
  | "parse_failed"
  | "no_entry_found"
  | "matching_failed"
  | "insert_failed"
  | "unauthorized"
  | "internal";

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const SUPPORTED_BOOKS = new Set(["prizepicks", "underdog", "draftkings", "fanduel", "other"]);

/* ─── Helpers ─── */
const getBearerToken = (authHeader: string | null): string | null => {
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  return token.length > 0 ? token : null;
};

const errorResponse = (
  code: ErrorCode,
  message: string,
  status = 400,
  debug?: Record<string, unknown>
) =>
  new Response(
    JSON.stringify({ ok: false, error: message, error_code: code, debug: debug ?? null }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );

const extractJsonObject = (raw: string): string => {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? raw).trim();
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) return candidate.slice(firstBrace, lastBrace + 1);
  return candidate;
};

const normalizeDirection = (raw: unknown): "over" | "under" => {
  const d = String(raw ?? "").trim().toLowerCase();
  return d === "under" || d === "less" ? "under" : "over";
};

/* ─── Period Detection ─── */
const PERIOD_PATTERNS: [RegExp, string][] = [
  [/\b(?:1st\s*quarter|first\s*quarter|q1|1q)\b/i, "q1"],
  [/\b(?:2nd\s*quarter|second\s*quarter|q2|2q)\b/i, "q2"],
  [/\b(?:3rd\s*quarter|third\s*quarter|q3|3q)\b/i, "q3"],
  [/\b(?:4th\s*quarter|fourth\s*quarter|q4|4q)\b/i, "q4"],
  [/\b(?:1st\s*half|first\s*half|1h)\b/i, "1h"],
  [/\b(?:2nd\s*half|second\s*half|2h)\b/i, "2h"],
  [/\b(?:first\s*3\s*min|1st\s*3\s*min|first\s*three\s*min)\b/i, "first3"],
  [/\b(?:first\s*5\s*min|1st\s*5\s*min|first\s*five\s*min)\b/i, "first5"],
  [/\b(?:first\s*10\s*min|1st\s*10\s*min)\b/i, "first10"],
];

const detectPeriod = (statType: string, rawText?: string): string => {
  const combined = `${statType} ${rawText || ""}`;
  for (const [pat, period] of PERIOD_PATTERNS) {
    if (pat.test(combined)) return period;
  }
  return "full";
};

const cleanStatType = (statType: string): string => {
  let cleaned = statType;
  // Remove period prefixes from stat_type so we store them separately
  for (const [pat] of PERIOD_PATTERNS) {
    cleaned = cleaned.replace(pat, "").trim();
  }
  // Clean up residual separators
  cleaned = cleaned.replace(/^[\s\-·:]+|[\s\-·:]+$/g, "").trim();
  return cleaned || statType;
};

const sanitizePick = (pick: any): PickInput | null => {
  const player_name = String(pick?.player_name ?? "").trim();
  const rawStatType = String(pick?.stat_type ?? "").trim().toLowerCase();
  const line = Number(pick?.line);
  if (!player_name || !rawStatType || Number.isNaN(line)) return null;
  const period = pick?.period || detectPeriod(rawStatType);
  const stat_type = cleanStatType(rawStatType);
  return { player_name, stat_type, line, direction: normalizeDirection(pick?.direction), period };
};

const extractPicksFromText = (text: string): PickInput[] => {
  if (!text) return [];
  const picks: PickInput[] = [];
  const normalized = text.replace(/\s+/g, " ");
  const pat =
    /([A-Z][a-zA-Z'.\-]+(?:\s+[A-Z][a-zA-Z'.\-]+){1,3})\s+(More|Less|Over|Under)\s+([\d.]+)\s+([a-zA-Z][a-zA-Z\s+&()'\/\-]{1,40}?)(?=\s*(?:\||,|\n|$))/gi;
  let m: RegExpExecArray | null;
  while ((m = pat.exec(normalized)) !== null) {
    const p = sanitizePick({ player_name: m[1], direction: m[2], line: m[3], stat_type: m[4] });
    if (p) picks.push(p);
  }
  return picks;
};

const dedupePicks = (picks: PickInput[]): PickInput[] => {
  const seen = new Set<string>();
  return picks.filter((p) => {
    const k = `${p.player_name.toLowerCase()}|${p.stat_type}|${p.line}|${p.direction}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

/* ─── AI Extractors ─── */
const aiExtractFromText = async (text: string, book: string): Promise<PickInput[]> => {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey || !text.trim()) return [];
  try {
    const res = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `Extract betting picks from shared page text and return only valid JSON.
Format: { "book": "${book}", "picks": [{ "player_name": "LeBron James", "stat_type": "points", "line": 25.5, "direction": "over", "period": "full" }] }
IMPORTANT: Detect period/market scope. If a prop is for 1st Quarter, set period="q1". First Half="1h". Second Half="2h". First 3 minutes="first3". First 5 minutes="first5". Full game="full". Always include the period field.
Only include picks that clearly have player name, direction, line, and stat type.`,
          },
          { role: "user", content: text.slice(0, 15000) },
        ],
        temperature: 0.1,
        max_tokens: 1400,
      }),
    });
    if (!res.ok) { console.error("[parse-bet-slip] AI text extraction failed:", res.status); return []; }
    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(extractJsonObject(raw));
    return dedupePicks((Array.isArray(parsed?.picks) ? parsed.picks : []).map(sanitizePick).filter(Boolean) as PickInput[]);
  } catch (e) { console.error("[parse-bet-slip] AI text parse error:", e); return []; }
};

const aiExtractFromImage = async (
  base64: string,
  book: string
): Promise<{ picks: PickInput[]; entry_type: string; stake: number; payout: number }> => {
  const empty = { picks: [], entry_type: "power", stake: 0, payout: 0 };
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return empty;
  try {
    const res = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are a bet slip OCR parser. Extract all picks from the betting slip image.
Return valid JSON only:
{ "book": "${book}", "entry_type": "power|flex|goblin|parlay|straight", "stake": 10, "payout": 50,
  "picks": [{ "player_name": "LeBron James", "stat_type": "points", "line": 25.5, "direction": "over", "period": "full" }] }
IMPORTANT: Detect period/market scope. If a prop is for 1st Quarter, set period="q1". First Half="1h". Second Half="2h". First 3 minutes="first3". Full game="full". Always include the period field.`,
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract all picks from this bet slip screenshot." },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64}` } },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 2000,
      }),
    });
    if (!res.ok) { console.error("[parse-bet-slip] AI image extraction failed:", res.status); return empty; }
    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(extractJsonObject(raw));
    return {
      picks: dedupePicks((Array.isArray(parsed?.picks) ? parsed.picks : []).map(sanitizePick).filter(Boolean) as PickInput[]),
      entry_type: String(parsed?.entry_type ?? "power"),
      stake: Number(parsed?.stake ?? 0),
      payout: Number(parsed?.payout ?? 0),
    };
  } catch (e) { console.error("[parse-bet-slip] AI image parse error:", e); return empty; }
};

/* ─── PrizePicks Link Handler ─── */
const extractPrizePicksEntryId = (url: string): string | null => {
  // https://app.prizepicks.com/entry/12345
  // https://prizepicks.com/entry/12345
  // https://app.prizepicks.com/board?entry=12345
  const entryMatch = url.match(/entry[/=]([A-Za-z0-9_-]+)/);
  if (entryMatch) return entryMatch[1];
  // Short links like prizepicks.onelink.me/... — entryId extracted after redirect
  return null;
};

const fetchWithRedirectTracking = async (
  url: string
): Promise<{ finalUrl: string; html: string; status: number; redirected: boolean }> => {
  console.log("[parse-bet-slip] Fetching URL:", url);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    const html = await res.text();
    const finalUrl = res.url || url;
    console.log("[parse-bet-slip] Fetch status:", res.status, "Final URL:", finalUrl, "HTML length:", html.length);
    return { finalUrl, html, status: res.status, redirected: finalUrl !== url };
  } catch (e) {
    console.error("[parse-bet-slip] Fetch error:", e);
    throw e;
  }
};

/* ─── Main Handler ─── */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const debugInfo: Record<string, unknown> = {};

  try {
    const token = getBearerToken(req.headers.get("authorization"));
    if (!token) return errorResponse("unauthorized", "Your session expired. Please sign in again.", 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const anonClient = createClient(supabaseUrl, supabaseAnonKey);

    const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !user) return errorResponse("unauthorized", "Your session expired. Please sign in again.", 401);

    const body = await req.json();
    const { mode, url, image_base64, manual_picks, book = "prizepicks", intent_state = "tracking_only" } = body;

    console.log("[parse-bet-slip] Incoming:", JSON.stringify({ mode, book, url: url?.slice(0, 120), hasImage: !!image_base64, manualCount: manual_picks?.length }));
    debugInfo.mode = mode;
    debugInfo.book = book;

    // Validate book
    if (!SUPPORTED_BOOKS.has(book)) {
      return errorResponse("unsupported_book", `Book "${book}" is not supported yet.`, 400, debugInfo);
    }

    let picks: PickInput[] = [];
    let entry_type = body.entry_type || "power";
    let stake = Number(body.stake || 0);
    let payout = Number(body.payout || 0);

    /* ─── LINK MODE ─── */
    if (mode === "link") {
      if (!url || typeof url !== "string" || url.trim().length < 5) {
        return errorResponse("invalid_link", "Please enter a valid share link.", 400, debugInfo);
      }

      let parsedUrl: URL;
      try { parsedUrl = new URL(url.trim()); } catch {
        return errorResponse("invalid_link", "That doesn't look like a valid URL. Please check the link.", 400, debugInfo);
      }

      debugInfo.original_url = parsedUrl.href;

      // Try to extract entryId from URL before fetching
      const entryIdFromUrl = extractPrizePicksEntryId(parsedUrl.href);
      debugInfo.entry_id_from_url = entryIdFromUrl;
      console.log("[parse-bet-slip] EntryId from URL:", entryIdFromUrl);

      let fetchResult: { finalUrl: string; html: string; status: number; redirected: boolean } | null = null;

      try {
        fetchResult = await fetchWithRedirectTracking(parsedUrl.href);
        debugInfo.fetch_status = fetchResult.status;
        debugInfo.final_url = fetchResult.finalUrl;
        debugInfo.redirected = fetchResult.redirected;
        debugInfo.html_length = fetchResult.html.length;

        // If redirected, try to extract entryId from final URL too
        if (fetchResult.redirected) {
          const entryIdFromRedirect = extractPrizePicksEntryId(fetchResult.finalUrl);
          if (entryIdFromRedirect) debugInfo.entry_id_from_redirect = entryIdFromRedirect;
          console.log("[parse-bet-slip] Redirect entryId:", entryIdFromRedirect);
        }

        if (fetchResult.status >= 400) {
          // Still try to parse entryId from the URL itself
          if (entryIdFromUrl) {
            console.log("[parse-bet-slip] Fetch failed but have entryId, continuing with partial data");
            debugInfo.partial = true;
          } else {
            return errorResponse("redirect_failed", `The share link returned an error (${fetchResult.status}). It may have expired.`, 400, debugInfo);
          }
        }
      } catch (fetchErr) {
        console.error("[parse-bet-slip] Fetch exception:", fetchErr);
        debugInfo.fetch_error = String(fetchErr);
        if (!entryIdFromUrl) {
          return errorResponse("redirect_failed", "We couldn't reach that share link. It may have expired or the service is down.", 400, debugInfo);
        }
        debugInfo.partial = true;
      }

      // Parse HTML for picks
      if (fetchResult?.html) {
        const html = fetchResult.html;
        const title = html.match(/<title[^>]*>(.*?)<\/title>/i)?.[1] ?? "";
        const ogDesc = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]*)"[^>]*>/i)?.[1] ?? "";
        const nextData = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i)?.[1] ?? "";
        const jsonScripts = [...html.matchAll(/<script[^>]*type="application\/(?:ld\+)?json"[^>]*>([\s\S]*?)<\/script>/gi)]
          .map((m) => m[1] ?? "").filter(Boolean).slice(0, 6).join("\n");
        const pageText = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

        console.log("[parse-bet-slip] Extracted: title=", title.slice(0, 80), "ogDesc=", ogDesc.slice(0, 120));

        picks = dedupePicks([
          ...extractPicksFromText(ogDesc),
          ...extractPicksFromText(title),
          ...extractPicksFromText(pageText.slice(0, 25000)),
          ...extractPicksFromText(jsonScripts.slice(0, 12000)),
          ...extractPicksFromText(nextData.slice(0, 12000)),
        ]);

        console.log("[parse-bet-slip] Regex extracted picks:", picks.length);

        if (picks.length === 0) {
          const aiText = [title, ogDesc, jsonScripts.slice(0, 4000), nextData.slice(0, 4000), pageText.slice(0, 7000)].filter(Boolean).join("\n\n");
          console.log("[parse-bet-slip] Trying AI extraction, text length:", aiText.length);
          picks = await aiExtractFromText(aiText, book);
          console.log("[parse-bet-slip] AI extracted picks:", picks.length);
        }
      }

      if (picks.length === 0) {
        debugInfo.parse_result = "no_picks";
        return errorResponse(
          "no_entry_found",
          "We couldn't read picks from this share link. The link may have expired, or the format isn't supported yet. Try screenshot or manual entry.",
          422,
          debugInfo
        );
      }
    }

    /* ─── SCREENSHOT MODE ─── */
    else if (mode === "screenshot") {
      const normalizedBase64 = String(image_base64 ?? "").replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "").trim();
      if (!normalizedBase64) {
        return errorResponse("parse_failed", "Screenshot image is required.", 400, debugInfo);
      }
      console.log("[parse-bet-slip] Screenshot base64 length:", normalizedBase64.length);
      const parsed = await aiExtractFromImage(normalizedBase64, book);
      picks = parsed.picks;
      entry_type = parsed.entry_type || entry_type;
      stake = Number.isFinite(parsed.stake) && parsed.stake > 0 ? parsed.stake : stake;
      payout = Number.isFinite(parsed.payout) && parsed.payout > 0 ? parsed.payout : payout;
      console.log("[parse-bet-slip] Screenshot extracted picks:", picks.length);
    }

    /* ─── MANUAL MODE ─── */
    else if (mode === "manual") {
      picks = dedupePicks((Array.isArray(manual_picks) ? manual_picks : []).map(sanitizePick).filter(Boolean) as PickInput[]);
      entry_type = body.entry_type || "power";
      stake = Number(body.stake || 0);
      payout = Number(body.payout || 0);
      console.log("[parse-bet-slip] Manual picks:", picks.length);
    }

    if (picks.length === 0) {
      return errorResponse("no_entry_found", "No picks could be extracted. Try manual entry or a clearer image/link.", 422, debugInfo);
    }

    debugInfo.picks_extracted = picks.length;

    /* ─── Player Matching ─── */
    let matchFailures = 0;
    for (const pick of picks) {
      try {
        const { data: exactMatch } = await supabase
          .from("players").select("id, name, team, league").ilike("name", pick.player_name).limit(1).maybeSingle();
        if (exactMatch) {
          pick.player_id = exactMatch.id;
          pick.match_status = "exact_match";
          pick.matched_name = exactMatch.name;
          pick.team = exactMatch.team;
          continue;
        }
        const { data: fuzzyMatches } = await supabase.rpc("search_players_unaccent", { search_query: pick.player_name, max_results: 3 });
        if (fuzzyMatches?.length) {
          pick.player_id = fuzzyMatches[0].player_id;
          pick.match_status = "fuzzy_match";
          pick.matched_name = fuzzyMatches[0].player_name;
          pick.team = fuzzyMatches[0].player_team;
          pick.fuzzy_candidates = fuzzyMatches;
        } else {
          pick.match_status = "unresolved";
          matchFailures++;
        }
      } catch (e) {
        console.error("[parse-bet-slip] Match error for", pick.player_name, e);
        pick.match_status = "unresolved";
        matchFailures++;
      }
    }

    console.log("[parse-bet-slip] Matching done. Failures:", matchFailures);
    debugInfo.match_failures = matchFailures;

    /* ─── Insert Slip ─── */
    const { data: slip, error: slipErr } = await supabase
      .from("bet_slips")
      .insert({ user_id: user.id, book, entry_type, stake, payout, source: mode, source_url: url || null, intent_state })
      .select("id").single();

    if (slipErr) {
      console.error("[parse-bet-slip] Slip insert error:", slipErr);
      return errorResponse("insert_failed", "Failed to create slip record.", 500, { ...debugInfo, slip_error: slipErr.message });
    }

    /* ─── Insert Picks ─── */
    const pickInserts = [];
    for (const pick of picks) {
      let shellId: string | null = null;
      if (pick.match_status !== "exact_match") {
        try {
          const { data: shell } = await supabase.from("tracked_prop_shells").insert({
            player_id: pick.player_id || null,
            player_name_raw: pick.player_name,
            game_id: pick.game_id || null,
            sport: "NBA",
            book,
            stat_type: pick.stat_type,
            stat_label_raw: pick.stat_type,
            line: pick.line,
            direction: pick.direction,
            team: pick.team || null,
            source: mode,
            match_status: pick.match_status === "fuzzy_match" ? "fuzzy_match" : "synthetic_created",
          }).select("id").single();
          shellId = shell?.id || null;
        } catch (e) {
          console.error("[parse-bet-slip] Shell insert error:", e);
        }
      }
      // Encode period into stat_type for picks that aren't full-game
      const periodPrefix = pick.period && pick.period !== "full" ? `${pick.period}:` : "";
      pickInserts.push({
        slip_id: slip.id,
        player_id: pick.player_id || null,
        player_name_raw: pick.player_name,
        game_id: pick.game_id || null,
        prop_shell_id: shellId,
        stat_type: `${periodPrefix}${pick.stat_type}`,
        line: pick.line,
        direction: pick.direction,
        match_status: pick.match_status || "unresolved",
      });
    }

    const { error: picksErr } = await supabase.from("bet_slip_picks").insert(pickInserts);
    if (picksErr) {
      console.error("[parse-bet-slip] Picks insert error:", picksErr);
      return errorResponse("insert_failed", "Slip created, but picks failed to save.", 500, { ...debugInfo, picks_error: picksErr.message });
    }

    /* ─── Post-Insert: Game Matching, Settlement, Injury Check ─── */
    const settledResults: { player: string; result: string; actual: number | null; injury: string | null }[] = [];
    let settledCount = 0;
    let injuryFlags: string[] = [];

    for (const pick of picks) {
      if (!pick.player_id) continue;

      // Try to find the player's game today or nearest
      let gameId = pick.game_id;
      let gameStatus: string | null = null;
      let gameLiveQuarter: number | null = null;

      if (!gameId) {
        // Find game by player's team — prioritize live/in_progress, then today's scheduled, then most recent
        const { data: playerRow } = await supabase.from("players").select("team, league").eq("id", pick.player_id).single();
        if (playerRow?.team) {
          const teamAbbr = playerRow.team;
          const _now = new Date();
          const yesterday = new Date(_now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
          const tomorrow = new Date(_now.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

          // 1) Try live/in_progress game first
          const { data: liveGame } = await supabase
            .from("games")
            .select("id, status, quarter")
            .or(`home_abbr.eq.${teamAbbr},away_abbr.eq.${teamAbbr}`)
            .in("status", ["live", "in_progress"])
            .limit(1)
            .maybeSingle();

          // 2) Fallback: today's game (any status)
          let gameRow = liveGame;
          if (!gameRow) {
            const { data: todayGame } = await supabase
              .from("games")
              .select("id, status, quarter")
              .or(`home_abbr.eq.${teamAbbr},away_abbr.eq.${teamAbbr}`)
              .gte("start_time", `${today}T00:00:00Z`)
              .lte("start_time", `${today}T23:59:59Z`)
              .order("start_time", { ascending: true })
              .limit(1)
              .maybeSingle();
            gameRow = todayGame;
          }

          // 3) Last fallback: most recent game
          if (!gameRow) {
            const { data: recentGame } = await supabase
              .from("games")
              .select("id, status, quarter")
              .or(`home_abbr.eq.${teamAbbr},away_abbr.eq.${teamAbbr}`)
              .order("start_time", { ascending: false })
              .limit(1)
              .maybeSingle();
            gameRow = recentGame;
          }

          if (gameRow) {
            gameId = gameRow.id;
            gameStatus = gameRow.status;
            gameLiveQuarter = gameRow.quarter ? parseInt(String(gameRow.quarter)) : null;
            // Update pick with game_id
            await supabase.from("bet_slip_picks").update({ game_id: gameRow.id }).eq("slip_id", slip.id).eq("player_name_raw", pick.player_name);
          }
        }
      } else {
        const { data: gameRow } = await supabase.from("games").select("status, quarter").eq("id", gameId).maybeSingle();
        gameStatus = gameRow?.status || null;
        gameLiveQuarter = gameRow?.quarter ? parseInt(String(gameRow.quarter)) : null;
      }

      // Check injuries
      const { data: injuryRow } = await supabase
        .from("injuries")
        .select("status")
        .eq("player_id", pick.player_id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (injuryRow?.status && ["out", "doubtful"].includes(injuryRow.status.toLowerCase())) {
        injuryFlags.push(`${pick.player_name}: ${injuryRow.status}`);
      }

      // Auto-settle if game is final
      if (gameId && (gameStatus === "final" || gameStatus === "completed")) {
        const period = pick.period || "full";
        let statPeriod = "full";
        if (period === "q1") statPeriod = "q1";
        else if (period === "q2") statPeriod = "q2";
        else if (period === "q3") statPeriod = "q3";
        else if (period === "q4") statPeriod = "q4";
        else if (period === "1h") statPeriod = "first_half";
        else if (period === "2h") statPeriod = "second_half";

        const { data: statRow } = await supabase
          .from("player_game_stats")
          .select("points, rebounds, assists, steals, blocks, three_made, turnovers, fg_attempted, minutes")
          .eq("player_id", pick.player_id)
          .eq("game_id", gameId)
          .eq("period", statPeriod)
          .maybeSingle();

        if (statRow) {
          const statMap: Record<string, number | null> = {
            points: statRow.points, pts: statRow.points,
            rebounds: statRow.rebounds, reb: statRow.rebounds,
            assists: statRow.assists, ast: statRow.assists,
            steals: statRow.steals, stl: statRow.steals,
            blocks: statRow.blocks, blk: statRow.blocks,
            threes: statRow.three_made, "3pm": statRow.three_made, three_made: statRow.three_made,
            turnovers: statRow.turnovers, tov: statRow.turnovers,
            pts_reb_ast: (statRow.points || 0) + (statRow.rebounds || 0) + (statRow.assists || 0),
            pra: (statRow.points || 0) + (statRow.rebounds || 0) + (statRow.assists || 0),
            pts_reb: (statRow.points || 0) + (statRow.rebounds || 0),
            pts_ast: (statRow.points || 0) + (statRow.assists || 0),
            reb_ast: (statRow.rebounds || 0) + (statRow.assists || 0),
            blk_stl: (statRow.blocks || 0) + (statRow.steals || 0),
            "b+s": (statRow.blocks || 0) + (statRow.steals || 0),
          };

          const actualValue = statMap[pick.stat_type.toLowerCase()] ?? null;
          if (actualValue !== null) {
            let result: string;
            if (actualValue === pick.line) result = "push";
            else if (pick.direction === "over" && actualValue > pick.line) result = "win";
            else if (pick.direction === "under" && actualValue < pick.line) result = "win";
            else result = "loss";

            // DNP check
            if (statRow.minutes === 0 || statRow.minutes === null) {
              result = "void";
            }

            await supabase.from("bet_slip_picks")
              .update({ result, live_value: actualValue })
              .eq("slip_id", slip.id)
              .eq("player_name_raw", pick.player_name);

            settledResults.push({ player: pick.player_name, result, actual: actualValue, injury: null });
            settledCount++;
          }
        }
      }
    }

    // If all picks are settled, settle the slip + calculate flex payouts
    if (settledCount > 0 && settledCount === picks.length) {
      const wins = settledResults.filter(r => r.result === "win").length;
      const voids = settledResults.filter(r => r.result === "void").length;
      const activePicks = picks.length - voids;
      const losses = settledResults.filter(r => r.result === "loss").length;

      let slipResult: string;
      let finalPayout = 0;

      if (entry_type === "flex" || entry_type === "goblin") {
        // Flex/Goblin payout tiers (PrizePicks-style)
        const flexPayouts = getFlexPayoutMultiplier(activePicks, wins);
        finalPayout = flexPayouts * stake;
        slipResult = wins >= Math.ceil(activePicks * 0.5) ? "win" : "loss";
        if (wins === activePicks) slipResult = "win";
      } else {
        // Power/Parlay: all must hit
        slipResult = losses === 0 && voids < picks.length ? "win" : "loss";
        finalPayout = slipResult === "win" ? payout : 0;
      }

      await supabase.from("bet_slips").update({
        status: "settled",
        result: slipResult,
        payout: finalPayout > 0 ? finalPayout : null,
        settled_at: new Date().toISOString(),
      }).eq("id", slip.id);

      debugInfo.settled = true;
      debugInfo.slip_result = slipResult;
      debugInfo.settled_payout = finalPayout;
    } else if (settledCount > 0) {
      // Partial settlement
      debugInfo.partial_settled = settledCount;
    }

    if (injuryFlags.length > 0) {
      debugInfo.injury_warnings = injuryFlags;
    }

    console.log("[parse-bet-slip] Success! Slip:", slip.id, "Picks:", picks.length, "Settled:", settledCount, "Injuries:", injuryFlags.length);

    return new Response(
      JSON.stringify({
        ok: true,
        slip_id: slip.id,
        picks_count: picks.length,
        settled_count: settledCount,
        settled_results: settledResults,
        injury_warnings: injuryFlags,
        debug: debugInfo,
        picks: picks.map((p) => ({
          player_name: p.player_name,
          matched_name: p.matched_name,
          stat_type: p.stat_type,
          line: p.line,
          direction: p.direction,
          match_status: p.match_status,
          player_id: p.player_id,
          period: p.period || "full",
        })),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[parse-bet-slip] Unhandled error:", err);
    return errorResponse("internal", "An internal error occurred", 500, debugInfo);
  }
});

/* ─── Flex Payout Multiplier (PrizePicks-style tiers) ─── */
function getFlexPayoutMultiplier(totalLegs: number, wins: number): number {
  // Approximate PrizePicks flex payout multipliers
  const FLEX_TABLES: Record<number, Record<number, number>> = {
    2: { 2: 3, 1: 1.25 },
    3: { 3: 5, 2: 1.5, 1: 0 },
    4: { 4: 10, 3: 2, 2: 1.25, 1: 0 },
    5: { 5: 20, 4: 3, 3: 1.5, 2: 0, 1: 0 },
    6: { 6: 40, 5: 5, 4: 2, 3: 1.25, 2: 0, 1: 0 },
  };
  const table = FLEX_TABLES[totalLegs];
  if (!table) {
    // Fallback for other sizes
    if (wins === totalLegs) return Math.pow(2, totalLegs);
    if (wins >= totalLegs - 1) return totalLegs * 0.5;
    return 0;
  }
  return table[wins] ?? 0;
}
