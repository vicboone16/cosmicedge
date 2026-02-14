import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

const COSMIC_EDGE_TOOL = {
  type: "function",
  function: {
    name: "cosmic_edge_response",
    description: "Return a structured CosmicEdge response blending astro narrative with quant signals.",
    parameters: {
      type: "object",
      required: ["astro", "disclaimers"],
      additionalProperties: false,
      properties: {
        astro: {
          type: "object",
          required: ["answer", "takeaways", "confidence", "volatility"],
          additionalProperties: false,
          properties: {
            answer: {
              type: "object",
              required: ["narrative", "summary", "tone"],
              additionalProperties: false,
              properties: {
                narrative: { type: "string", description: "Cohesive conversational paragraph (5-10 sentences)." },
                summary: { type: "string", description: "1-2 sentence TL;DR for cards." },
                tone: { type: "string", enum: ["conversational", "direct", "clinical", "playful"] },
              },
            },
            takeaways: {
              type: "object",
              required: ["strengtheners", "weakeners", "team_vs_player"],
              additionalProperties: false,
              properties: {
                strengtheners: { type: "array", items: { $ref: "#/$defs/bullet" } },
                weakeners: { type: "array", items: { $ref: "#/$defs/bullet" } },
                team_vs_player: { type: "array", items: { $ref: "#/$defs/bullet" } },
              },
            },
            confidence: { type: "string", enum: ["low", "medium", "high"] },
            volatility: { type: "string", enum: ["low", "medium", "high"] },
            follow_up_questions: { type: "array", maxItems: 2, items: { type: "string" } },
          },
        },
        astro_signal: {
          type: "object",
          additionalProperties: false,
          properties: {
            lean: { type: "string", enum: ["support", "fade", "neutral"] },
            strength: { type: "string", enum: ["weak", "medium", "strong"] },
          },
        },
        disclaimers: { type: "array", minItems: 1, items: { type: "string" } },
      },
      $defs: {
        bullet: {
          type: "object",
          required: ["text"],
          additionalProperties: false,
          properties: {
            text: { type: "string" },
            tag: {
              type: "string",
              enum: ["transits", "natal", "aspects", "location", "chemistry", "role_usage", "matchup", "injury_news", "market", "stats", "other"],
            },
            priority: { type: "integer", minimum: 1, maximum: 5 },
          },
        },
      },
    },
  },
};

// Build system prompt with quant context
function buildSystemPrompt(quantData: any | null) {
  let quantContext = "";
  if (quantData?.quant?.models?.length) {
    const models = quantData.quant.models;
    const verdict = quantData.quant.verdict;
    quantContext = `

QUANT DATA (pre-computed statistical models for this game):
${models.map((m: any) => `- ${m.model_id} (${m.scope}): ${m.summary} → Signal: ${m.signal?.direction} (${m.signal?.strength}, score=${m.signal?.score})`).join("\n")}

QUANT VERDICT: Score=${verdict?.quant_score}, Edge=${verdict?.edge_assessment}
Notes: ${verdict?.notes}

MARKET: ${JSON.stringify(quantData.quant.market_snapshot)}

When you have quant data, WEAVE statistical insights into your narrative naturally.
For example: "The numbers back this up — eFG% is running at 54% over the last 5..." 
Do NOT just list stats. Integrate them with the astrological read.
If quant and astro signals conflict, acknowledge the tension and explain which you weigh more heavily.`;
  }

  return `You are Astra, a conversational astro-sports analyst who also reads statistical models.

You synthesize astrological signals AND quantitative models into ONE cohesive answer.
${quantContext}

STYLE:
- Warm, clear, conversational. No source labels like "Astrology API" or "AstroVisor."
- No bullet-dumps as the main answer. Bullets come in structured takeaways.
- If signals conflict, reconcile with conditional language.
- Use probabilistic language, never absolutes.
- When stats are available, reference them naturally in the narrative.

LOGIC ORDER (highest weight first):
1) "Today" factors: transits, aspects to key natal points, combust/afflictions
2) Natal baseline: sign/house/aspects
3) Statistical edge: quant models, efficiency, pace, matchup data
4) Context: role on team, matchup, minutes/usage
5) Location: astrocartography / venue
6) Market: odds movement, lines, injury/news

You MUST call the cosmic_edge_response function. The narrative should be 5-10 sentences covering:
- Direct answer with both astro and stats perspective
- How it shows up in performance (use specific stats if available)
- Where it can backfire
- What changes the call today
- Betting lens
- Bottom line

The summary should be 1-2 sentences suitable for a compact card display.
Include an astro_signal with lean (support/fade/neutral) and strength (weak/medium/strong).
Always include at least one disclaimer about responsible gambling.`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) throw new Error("LOVABLE_API_KEY not configured");

    const body = await req.json();
    const {
      mode = "chart",
      delivery_mode = "chat",
      chart_data,
      player_name,
      player2_name,
      game_context,
      prop_context,
      election_data,
      transit_data,
      astrocarto_data,
      custom_prompt,
      quant_data,
      astro_weight = 0.5,
    } = body;

    // Build user prompt based on mode
    let userPrompt = "";

    if (mode === "chart" && chart_data) {
      userPrompt = `Interpret this natal chart for ${player_name || "the player"} in the context of sports performance. Focus on athletic strengths/weaknesses from Mars, Sun, Jupiter placements; mental resilience from Saturn, Mercury aspects; injury risk indicators; peak performance patterns.\n\nChart data:\n${JSON.stringify(chart_data, null, 2)}`;
    } else if (mode === "matchup" && chart_data) {
      userPrompt = `Analyze this synastry/matchup between ${player_name || "Player 1"} and ${player2_name || "Player 2"} for their upcoming game.\n${game_context ? `Game: ${game_context.home_team} vs ${game_context.away_team} on ${game_context.date}` : ""}\nFocus on competitive dynamics, who has the edge energetically, domination or frustration patterns.\n\nChart data:\n${JSON.stringify(chart_data, null, 2)}`;
    } else if (mode === "prop" && prop_context) {
      userPrompt = `Analyze this player prop from an astrological perspective:\nPlayer: ${prop_context.player}\nMarket: ${prop_context.market} ${prop_context.direction} ${prop_context.line}\n${chart_data ? `\nHorary/Transit data:\n${JSON.stringify(chart_data, null, 2)}` : ""}\nProvide astrological lean (over/under) with confidence, key planetary indicators, caution flags.`;
    } else if (mode === "election" && election_data) {
      userPrompt = `Interpret these electional timing windows for sports betting today.\n\nElection data:\n${JSON.stringify(election_data, null, 2)}\nRank windows, identify best/worst times, Moon phase impact.`;
    } else if (mode === "transit" && transit_data) {
      userPrompt = `Analyze these current transits for ${player_name || "the player"} and their impact on today's game.\n\nTransit data:\n${JSON.stringify(transit_data, null, 2)}\nFocus on performance-boosting and limiting transits, timing of peak energy, overall transit grade.`;
    } else if (mode === "astrocarto" && astrocarto_data) {
      userPrompt = `Analyze this astrocartography data for ${player_name || "the player"} at the game venue.\n${game_context ? `Game: ${game_context.home_team} vs ${game_context.away_team} at ${game_context.venue}` : ""}\n\nAstrocartography data:\n${JSON.stringify(astrocarto_data, null, 2)}\nFocus on planetary lines near the venue and their performance impact.`;
    } else if (mode === "freeform" && custom_prompt) {
      userPrompt = custom_prompt;
      if (chart_data) userPrompt += `\n\nChart data:\n${JSON.stringify(chart_data, null, 2)}`;
      if (astrocarto_data) userPrompt += `\n\nAstrocartography data:\n${JSON.stringify(astrocarto_data, null, 2)}`;
    } else if (custom_prompt) {
      userPrompt = custom_prompt;
    } else {
      throw new Error("Invalid mode or missing data");
    }

    // Add delivery mode instructions
    if (delivery_mode === "trend_card" || delivery_mode === "prop_card") {
      userPrompt += "\n\nIMPORTANT: This is for a compact card display. Keep the summary very concise (1-2 sentences max). Focus on the bottom line.";
    }

    const systemPrompt = buildSystemPrompt(quant_data);

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
        tools: [COSMIC_EDGE_TOOL],
        tool_choice: { type: "function", function: { name: "cosmic_edge_response" } },
        max_tokens: 2500,
        temperature: 0.7,
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("AI Gateway error:", aiResp.status, errText);
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI Gateway error ${aiResp.status}: ${errText}`);
    }

    const aiResult = await aiResp.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];

    if (toolCall?.function?.arguments) {
      let aiOutput: any;
      try {
        aiOutput = typeof toolCall.function.arguments === "string"
          ? JSON.parse(toolCall.function.arguments)
          : toolCall.function.arguments;
      } catch {
        throw new Error("Failed to parse structured AI response");
      }

      // Build the full CosmicEdge response
      const astroSignal = aiOutput.astro_signal || { lean: "neutral", strength: "weak" };
      const quantSignals = quant_data?.signals?.quant || { lean: "neutral", edge: "no_edge" };

      // Blend signals
      const astroScore = astroSignal.lean === "support" ? 0.5 : astroSignal.lean === "fade" ? -0.5 : 0;
      const strengthMult = astroSignal.strength === "strong" ? 1.5 : astroSignal.strength === "medium" ? 1.0 : 0.5;
      const astroWeighted = astroScore * strengthMult;

      const quantScore = quant_data?.quant?.verdict?.quant_score || 0;
      const blendScore = astro_weight * astroWeighted + (1 - astro_weight) * quantScore;
      const blendClamped = Math.max(-1, Math.min(1, blendScore));

      let blendDecision = "neutral";
      if (blendClamped > 0.25) blendDecision = "support";
      else if (blendClamped < -0.25) blendDecision = "fade";
      else if (Math.abs(blendClamped) > 0.1) blendDecision = "watchlist";

      // Downgrade to watchlist if high volatility + thin edge
      if (aiOutput.astro?.volatility === "high" && quantSignals.edge !== "clear_edge") {
        blendDecision = "watchlist";
      }

      const blendConfidence = aiOutput.astro?.confidence || "medium";
      const blendVolatility = aiOutput.astro?.volatility || "medium";

      // Build explain string
      let explain = "Astro and stats both weigh in.";
      if (astro_weight > 0.6) explain = "Astro leads the read" + (quantScore > 0.15 ? ", quant confirms." : ".");
      else if (astro_weight < 0.4) explain = "Stats lead" + (astroScore > 0 ? ", astro adds support." : ", astro adds volatility.");
      else explain = astroSignal.lean === quantSignals.lean ? "Both lenses agree." : "Signals diverge — blend is cautious.";

      // Determine category
      let category = "other";
      if (mode === "prop") category = "prop_eval";
      else if (mode === "matchup") category = "team_eval";
      else if (mode === "chart") category = "placement_meaning";
      else if (mode === "transit") category = "transit_impact";
      else if (mode === "astrocarto") category = "astrocartography_factor";
      else if (mode === "election") category = "betting_lens";

      const response = {
        version: "2.0",
        delivery_mode,
        context: {
          query: {
            text: custom_prompt || userPrompt.slice(0, 200),
            category,
          },
          entities: {
            ...(player_name && { player_name }),
            ...(game_context?.home_team && { team_name: game_context.home_team }),
            ...(game_context?.away_team && { opponent_name: game_context.away_team }),
            ...(game_context?.venue && { venue: game_context.venue }),
            ...(prop_context?.market && { market_type: prop_context.market }),
          },
        },
        astro: aiOutput.astro,
        quant: quant_data?.quant || {
          market_snapshot: { market_type: "other" },
          models: [],
          verdict: { quant_score: 0, edge_assessment: "no_edge", notes: "No quant data available" },
        },
        signals: {
          astro: astroSignal,
          quant: quantSignals,
          blend: {
            decision: blendDecision,
            confidence: blendConfidence,
            volatility: blendVolatility,
            astro_weight_used: astro_weight,
            explain,
          },
        },
        preferences: {
          emphasis: { astro_weight },
          visibility: {
            default_user: delivery_mode === "chat" ? "collapsed" : "summary_only",
            admin: "expanded",
          },
        },
        disclaimers: aiOutput.disclaimers || ["This is for entertainment purposes only. Always gamble responsibly."],
      };

      return new Response(
        JSON.stringify({ success: true, cosmic_edge: response, mode, delivery_mode }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fallback for legacy
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
