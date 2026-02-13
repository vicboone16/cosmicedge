import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) throw new Error("LOVABLE_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const {
      mode = "chart",        // chart | matchup | prop | election | transit | astrocarto | freeform
      chart_data,            // raw astro calculation result
      player_name,
      player2_name,
      game_context,          // { home_team, away_team, date, venue }
      prop_context,          // { player, market, line, direction }
      election_data,         // election windows data
      transit_data,          // transit data
      astrocarto_data,       // astrocartography data for venue context
      custom_prompt,         // optional override
    } = body;

    let systemPrompt = `You are CosmicEdge, an elite sports astrology analyst. You combine traditional Frawley/Lilly horary methods with modern transit analysis to produce actionable betting insights. Your tone is confident, concise, and data-driven. Use astrological terminology but explain key concepts briefly. Always end with a clear lean or recommendation. Format with bullet points and bold key findings.

You have access to data from TWO astrology engines:
1. AstroVisor (astrovisor.io) — natal charts, transits, synastry, horary, progressions
2. Astrology API (astrology-api.io) — enhanced positions, dignities with fixed stars, lunar metrics, astrocartography, paran maps, horary analysis with timing

When data from both providers is present, cross-reference them for higher confidence signals. Note which provider supplied each data point.`;

    let userPrompt = "";

    if (mode === "chart" && chart_data) {
      userPrompt = `Interpret this natal chart for ${player_name || "the player"} in the context of sports performance. Focus on:
- Athletic strengths/weaknesses from Mars, Sun, Jupiter placements
- Mental resilience from Saturn, Mercury aspects
- Injury risk indicators from Mars-Saturn, Mars-Neptune aspects
- Peak performance patterns

Chart data:
${JSON.stringify(chart_data, null, 2)}`;

    } else if (mode === "matchup" && chart_data) {
      userPrompt = `Analyze this synastry/matchup between ${player_name || "Player 1"} and ${player2_name || "Player 2"} for their upcoming game.
${game_context ? `Game: ${game_context.home_team} vs ${game_context.away_team} on ${game_context.date}` : ""}

Focus on:
- Competitive dynamics (Mars-Mars, Sun-Mars aspects)
- Who has the edge energetically
- Any domination or frustration patterns

Chart data:
${JSON.stringify(chart_data, null, 2)}`;

    } else if (mode === "prop" && prop_context) {
      userPrompt = `Analyze this player prop from an astrological perspective:
Player: ${prop_context.player}
Market: ${prop_context.market} ${prop_context.direction} ${prop_context.line}
${chart_data ? `\nHorary/Transit data:\n${JSON.stringify(chart_data, null, 2)}` : ""}

Provide:
- Astrological lean (over/under) with confidence level
- Key planetary indicators supporting the lean
- Any caution flags (void-of-course Moon, retrograde Mercury, etc.)`;

    } else if (mode === "election" && election_data) {
      userPrompt = `Interpret these electional timing windows for sports betting today. Identify the best and worst times to place bets.

Election data:
${JSON.stringify(election_data, null, 2)}

Provide:
- Ranked windows from best to worst
- Specific times to place bets vs avoid
- Moon phase impact on bet outcomes`;

    } else if (mode === "transit" && transit_data) {
      userPrompt = `Analyze these current transits for ${player_name || "the player"} and their impact on today's game performance.

Transit data:
${JSON.stringify(transit_data, null, 2)}

Focus on:
- Performance-boosting transits (Jupiter, Venus to natal Mars/Sun)
- Performance-limiting transits (Saturn, Neptune squares)
- Timing of peak energy during the game
- Overall transit grade (A-F)`;

    } else if (mode === "astrocarto" && astrocarto_data) {
      userPrompt = `Analyze this astrocartography data for ${player_name || "the player"} at the game venue.
${game_context ? `Game: ${game_context.home_team} vs ${game_context.away_team} at ${game_context.venue}` : ""}

Astrocartography data:
${JSON.stringify(astrocarto_data, null, 2)}

Focus on:
- Which planetary lines are closest to the venue
- How those lines affect performance (MC = public success, IC = emotional grounding, ASC = vitality, DSC = competition)
- Whether this venue is favorable or challenging for the player
- Specific stat categories that may be boosted or suppressed`;

    } else if (mode === "freeform" && custom_prompt) {
      userPrompt = custom_prompt;
      if (chart_data) userPrompt += `\n\nChart data:\n${JSON.stringify(chart_data, null, 2)}`;
      if (astrocarto_data) userPrompt += `\n\nAstrocartography data:\n${JSON.stringify(astrocarto_data, null, 2)}`;

    } else if (custom_prompt) {
      userPrompt = custom_prompt;
    } else {
      throw new Error("Invalid mode or missing data");
    }

    // Call Lovable AI
    const aiResp = await fetch(AI_GATEWAY, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 800,
        temperature: 0.7,
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      throw new Error(`AI Gateway error ${aiResp.status}: ${errText}`);
    }

    const aiResult = await aiResp.json();
    const interpretation = aiResult.choices?.[0]?.message?.content || "Unable to generate interpretation.";

    return new Response(
      JSON.stringify({ success: true, interpretation, mode }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("astro-interpret error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
