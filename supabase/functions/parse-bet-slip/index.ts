import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "../_shared/cors.ts";

type PickInput = {
  player_name: string;
  stat_type: string;
  line: number;
  direction: "over" | "under";
  player_id?: string | null;
  match_status?: string;
  matched_name?: string;
  team?: string | null;
  game_id?: string | null;
  fuzzy_candidates?: unknown[];
};

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

const getBearerToken = (authHeader: string | null): string | null => {
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  return token.length > 0 ? token : null;
};

const extractJsonObject = (raw: string): string => {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? raw).trim();

  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return candidate.slice(firstBrace, lastBrace + 1);
  }

  return candidate;
};

const normalizeDirection = (raw: unknown): "over" | "under" => {
  const direction = String(raw ?? "").trim().toLowerCase();
  return direction === "under" || direction === "less" ? "under" : "over";
};

const sanitizePick = (pick: any): PickInput | null => {
  const player_name = String(pick?.player_name ?? "").trim();
  const stat_type = String(pick?.stat_type ?? "").trim().toLowerCase();
  const line = Number(pick?.line);

  if (!player_name || !stat_type || Number.isNaN(line)) return null;

  return {
    player_name,
    stat_type,
    line,
    direction: normalizeDirection(pick?.direction),
  };
};

const extractPicksFromText = (text: string): PickInput[] => {
  if (!text) return [];

  const picks: PickInput[] = [];
  const normalizedText = text.replace(/\s+/g, " ");
  const linePattern = /([A-Z][a-zA-Z'.-]+(?:\s+[A-Z][a-zA-Z'.-]+){1,3})\s+(More|Less|Over|Under)\s+([\d.]+)\s+([a-zA-Z][a-zA-Z\s+&()'/-]{1,40}?)(?=\s*(?:\||,|\n|$))/gi;

  let match: RegExpExecArray | null;
  while ((match = linePattern.exec(normalizedText)) !== null) {
    const pick = sanitizePick({
      player_name: match[1],
      direction: match[2],
      line: match[3],
      stat_type: match[4],
    });

    if (pick) picks.push(pick);
  }

  return picks;
};

const dedupePicks = (picks: PickInput[]): PickInput[] => {
  const seen = new Set<string>();
  const unique: PickInput[] = [];

  for (const pick of picks) {
    const key = `${pick.player_name.toLowerCase()}|${pick.stat_type.toLowerCase()}|${pick.line}|${pick.direction}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(pick);
  }

  return unique;
};

const aiExtractFromText = async (text: string, book: string): Promise<PickInput[]> => {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey || !text.trim()) return [];

  const aiResponse = await fetch(AI_GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        {
          role: "system",
          content: `Extract betting picks from shared page text and return only valid JSON.
Format:
{
  "book": "${book}",
  "picks": [
    {
      "player_name": "LeBron James",
      "stat_type": "points",
      "line": 25.5,
      "direction": "over"
    }
  ]
}
Only include picks that clearly have player name, direction, line, and stat type.`,
        },
        {
          role: "user",
          content: text.slice(0, 15000),
        },
      ],
      temperature: 0.1,
      max_tokens: 1400,
    }),
  });

  if (!aiResponse.ok) {
    console.error("AI text extraction failed:", aiResponse.status, await aiResponse.text());
    return [];
  }

  const aiData = await aiResponse.json();
  const raw = aiData?.choices?.[0]?.message?.content ?? "";

  try {
    const parsed = JSON.parse(extractJsonObject(raw));
    const picks = Array.isArray(parsed?.picks) ? parsed.picks : [];
    return dedupePicks(picks.map(sanitizePick).filter(Boolean) as PickInput[]);
  } catch (error) {
    console.error("AI text parse error:", error);
    return [];
  }
};

const aiExtractFromImage = async (imageBase64: string, book: string): Promise<{ picks: PickInput[]; entry_type: string; stake: number; payout: number }> => {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    return { picks: [], entry_type: "power", stake: 0, payout: 0 };
  }

  const aiResponse = await fetch(AI_GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: `You are a bet slip OCR parser. Extract all picks from the betting slip image.
Return valid JSON only:
{
  "book": "${book}",
  "entry_type": "power|flex|goblin|parlay|straight",
  "stake": 10,
  "payout": 50,
  "picks": [
    {
      "player_name": "LeBron James",
      "stat_type": "points",
      "line": 25.5,
      "direction": "over"
    }
  ]
}`,
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Extract all picks from this bet slip screenshot." },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 2000,
    }),
  });

  if (!aiResponse.ok) {
    console.error("AI image extraction failed:", aiResponse.status, await aiResponse.text());
    return { picks: [], entry_type: "power", stake: 0, payout: 0 };
  }

  const aiData = await aiResponse.json();
  const raw = aiData?.choices?.[0]?.message?.content ?? "";

  try {
    const parsed = JSON.parse(extractJsonObject(raw));
    const picks = Array.isArray(parsed?.picks) ? parsed.picks : [];

    return {
      picks: dedupePicks(picks.map(sanitizePick).filter(Boolean) as PickInput[]),
      entry_type: String(parsed?.entry_type ?? "power"),
      stake: Number(parsed?.stake ?? 0),
      payout: Number(parsed?.payout ?? 0),
    };
  } catch (error) {
    console.error("AI image parse error:", error, "raw:", raw);
    return { picks: [], entry_type: "power", stake: 0, payout: 0 };
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const token = getBearerToken(req.headers.get("authorization"));
    if (!token) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const anonClient = createClient(supabaseUrl, supabaseAnonKey);
    const {
      data: { user },
      error: authError,
    } = await anonClient.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const {
      mode,
      url,
      image_base64,
      manual_picks,
      book = "prizepicks",
      intent_state = "tracking_only",
    } = body;

    let picks: PickInput[] = [];
    let entry_type = "power";
    let stake = 0;
    let payout = 0;

    if (mode === "link") {
      if (!url || typeof url !== "string") {
        return new Response(JSON.stringify({ ok: false, error: "A valid share link is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      try {
        new URL(url);
      } catch {
        return new Response(JSON.stringify({ ok: false, error: "Invalid URL format" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      try {
        const res = await fetch(url, {
          redirect: "follow",
          headers: {
            "user-agent": "Mozilla/5.0 (compatible; CosmicEdgeBot/1.0)",
            accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
        });

        if (!res.ok) {
          return new Response(JSON.stringify({ ok: false, error: `Share link returned ${res.status}` }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const html = await res.text();
        const title = html.match(/<title[^>]*>(.*?)<\/title>/i)?.[1] ?? "";
        const ogDesc = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]*)"[^>]*>/i)?.[1] ?? "";
        const nextData = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i)?.[1] ?? "";

        const jsonScripts = [...html.matchAll(/<script[^>]*type="application\/(?:ld\+)?json"[^>]*>([\s\S]*?)<\/script>/gi)]
          .map((m) => m[1] ?? "")
          .filter(Boolean)
          .slice(0, 6)
          .join("\n");

        const pageText = html
          .replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ");

        picks = dedupePicks([
          ...extractPicksFromText(ogDesc),
          ...extractPicksFromText(title),
          ...extractPicksFromText(pageText.slice(0, 25000)),
          ...extractPicksFromText(jsonScripts.slice(0, 12000)),
          ...extractPicksFromText(nextData.slice(0, 12000)),
        ]);

        if (picks.length === 0) {
          const aiText = [title, ogDesc, jsonScripts.slice(0, 4000), nextData.slice(0, 4000), pageText.slice(0, 7000)]
            .filter(Boolean)
            .join("\n\n");
          picks = await aiExtractFromText(aiText, book);
        }
      } catch (error) {
        console.error("Link import error:", error);
      }
    } else if (mode === "screenshot") {
      const normalizedBase64 = String(image_base64 ?? "")
        .replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "")
        .trim();

      if (!normalizedBase64) {
        return new Response(JSON.stringify({ ok: false, error: "Screenshot image is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const parsed = await aiExtractFromImage(normalizedBase64, book);
      picks = parsed.picks;
      entry_type = parsed.entry_type || "power";
      stake = Number.isFinite(parsed.stake) ? parsed.stake : 0;
      payout = Number.isFinite(parsed.payout) ? parsed.payout : 0;
    } else if (mode === "manual") {
      const parsedManual = Array.isArray(manual_picks)
        ? manual_picks.map(sanitizePick).filter(Boolean)
        : [];

      picks = dedupePicks(parsedManual as PickInput[]);
      entry_type = body.entry_type || "power";
      stake = Number(body.stake || 0);
      payout = Number(body.payout || 0);
    }

    if (picks.length === 0) {
      return new Response(JSON.stringify({ ok: false, error: "No picks could be extracted. Try manual entry or a clearer image/link." }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    for (const pick of picks) {
      const { data: exactMatch } = await supabase
        .from("players")
        .select("id, name, team, league")
        .ilike("name", pick.player_name)
        .limit(1)
        .maybeSingle();

      if (exactMatch) {
        pick.player_id = exactMatch.id;
        pick.match_status = "exact_match";
        pick.matched_name = exactMatch.name;
        pick.team = exactMatch.team;
        continue;
      }

      const { data: fuzzyMatches } = await supabase.rpc("search_players_unaccent", {
        search_query: pick.player_name,
        max_results: 3,
      });

      if (fuzzyMatches && fuzzyMatches.length > 0) {
        pick.player_id = fuzzyMatches[0].player_id;
        pick.match_status = "fuzzy_match";
        pick.matched_name = fuzzyMatches[0].player_name;
        pick.team = fuzzyMatches[0].player_team;
        pick.fuzzy_candidates = fuzzyMatches;
      } else {
        pick.match_status = "unresolved";
      }
    }

    const { data: slip, error: slipErr } = await supabase
      .from("bet_slips")
      .insert({
        user_id: user.id,
        book,
        entry_type,
        stake,
        payout,
        source: mode,
        source_url: url || null,
        intent_state,
      })
      .select("id")
      .single();

    if (slipErr) throw slipErr;

    const pickInserts = [];
    for (const pick of picks) {
      let shellId: string | null = null;

      if (pick.match_status !== "exact_match") {
        const { data: shell } = await supabase
          .from("tracked_prop_shells")
          .insert({
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
          })
          .select("id")
          .single();

        shellId = shell?.id || null;
      }

      pickInserts.push({
        slip_id: slip.id,
        player_id: pick.player_id || null,
        player_name_raw: pick.player_name,
        game_id: pick.game_id || null,
        prop_shell_id: shellId,
        stat_type: pick.stat_type,
        line: pick.line,
        direction: pick.direction,
        match_status: pick.match_status || "unresolved",
      });
    }

    const { error: picksErr } = await supabase.from("bet_slip_picks").insert(pickInserts);
    if (picksErr) {
      console.error("Picks insert error:", picksErr);
      throw new Error("Slip created, but picks failed to save");
    }

    return new Response(
      JSON.stringify({
        ok: true,
        slip_id: slip.id,
        picks_count: picks.length,
        picks: picks.map((p) => ({
          player_name: p.player_name,
          matched_name: p.matched_name,
          stat_type: p.stat_type,
          line: p.line,
          direction: p.direction,
          match_status: p.match_status,
          player_id: p.player_id,
        })),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("parse-bet-slip error:", err);
    const message = err instanceof Error ? err.message : "An internal error occurred";

    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
