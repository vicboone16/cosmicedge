import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error: authError } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) throw new Error("Unauthorized");

    const body = await req.json();
    const { mode, url, image_base64, manual_picks, book = "prizepicks", intent_state = "tracking_only" } = body;

    let picks: any[] = [];
    let entry_type = "power";
    let stake = 0;
    let payout = 0;

    if (mode === "link" && url) {
      // Fetch PrizePicks share link and parse
      try {
        const res = await fetch(url, { redirect: "follow" });
        const html = await res.text();
        
        // Extract JSON-LD or meta data from PrizePicks page
        const jsonLdMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/);
        
        // Try extracting from meta tags and page content
        const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
        const ogDescMatch = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]*)"[^>]*>/i);
        
        // Parse structured data if available
        const pageText = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
        
        // Extract player lines from page content patterns
        // PrizePicks format: "Player Name More/Less X.5 Stat"
        const linePattern = /([A-Z][a-z]+ [A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s+(More|Less|Over|Under)\s+([\d.]+)\s+(\w[\w\s]*?)(?:\s*(?:,|\n|$))/gi;
        let match;
        while ((match = linePattern.exec(pageText)) !== null) {
          picks.push({
            player_name: match[1].trim(),
            direction: match[2].toLowerCase() === "more" || match[2].toLowerCase() === "over" ? "over" : "under",
            line: parseFloat(match[3]),
            stat_type: match[4].trim().toLowerCase(),
          });
        }

        // If no structured extraction worked, try AI parsing
        if (picks.length === 0 && ogDescMatch) {
          const desc = ogDescMatch[1];
          // Simple fallback parse from OG description
          const parts = desc.split(/[,;]/);
          for (const part of parts) {
            const m = part.match(/(\w[\w\s]+?)\s+(over|under|more|less)\s+([\d.]+)\s+(\w+)/i);
            if (m) {
              picks.push({
                player_name: m[1].trim(),
                direction: m[2].toLowerCase() === "more" || m[2].toLowerCase() === "over" ? "over" : "under",
                line: parseFloat(m[3]),
                stat_type: m[4].trim().toLowerCase(),
              });
            }
          }
        }
      } catch (e) {
        console.error("Link fetch error:", e);
      }
    } else if (mode === "screenshot" && image_base64) {
      // Use AI to OCR the screenshot
      const aiResponse = await fetch("https://ai-gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content: `You are a bet slip OCR parser. Extract all picks from the betting slip image.
Return a JSON object with this exact structure:
{
  "book": "prizepicks",
  "entry_type": "power|flex|goblin",
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
}
Only return valid JSON. No markdown. No explanation.`
            },
            {
              role: "user",
              content: [
                { type: "text", text: "Extract all picks from this bet slip screenshot:" },
                { type: "image_url", image_url: { url: `data:image/png;base64,${image_base64}` } }
              ]
            }
          ],
          temperature: 0.1,
          max_tokens: 2000,
        }),
      });
      
      if (aiResponse.ok) {
        const aiData = await aiResponse.json();
        const content = aiData.choices?.[0]?.message?.content || "";
        try {
          // Strip markdown code fences if present
          const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
          const parsed = JSON.parse(cleaned);
          picks = parsed.picks || [];
          entry_type = parsed.entry_type || "power";
          stake = parsed.stake || 0;
          payout = parsed.payout || 0;
        } catch (parseErr) {
          console.error("AI parse error:", parseErr, "Content:", content);
        }
      }
    } else if (mode === "manual" && manual_picks) {
      picks = manual_picks;
      entry_type = body.entry_type || "power";
      stake = body.stake || 0;
      payout = body.payout || 0;
    }

    if (picks.length === 0) {
      return new Response(JSON.stringify({ ok: false, error: "No picks could be extracted" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Player matching
    for (const pick of picks) {
      // Try exact match
      const { data: exactMatch } = await supabase
        .from("players")
        .select("id, name, team, league")
        .ilike("name", pick.player_name)
        .limit(1)
        .single();

      if (exactMatch) {
        pick.player_id = exactMatch.id;
        pick.match_status = "exact_match";
        pick.matched_name = exactMatch.name;
        pick.team = exactMatch.team;
        continue;
      }

      // Try fuzzy match
      const { data: fuzzyMatches } = await supabase
        .rpc("search_players_unaccent", { search_query: pick.player_name, max_results: 3 });
      
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

    // Create slip
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

    // Create picks + shells for unmatched
    const pickInserts = [];
    for (const pick of picks) {
      let shellId: string | null = null;

      if (pick.match_status !== "exact_match") {
        // Create synthetic shell
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
    if (picksErr) console.error("Picks insert error:", picksErr);

    return new Response(JSON.stringify({
      ok: true,
      slip_id: slip.id,
      picks_count: picks.length,
      picks: picks.map(p => ({
        player_name: p.player_name,
        matched_name: p.matched_name,
        stat_type: p.stat_type,
        line: p.line,
        direction: p.direction,
        match_status: p.match_status,
        player_id: p.player_id,
      })),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("parse-bet-slip error:", err);
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
