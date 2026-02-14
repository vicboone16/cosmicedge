import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

const ASTRA_RESPONSE_TOOL = {
  type: "function",
  function: {
    name: "astra_response",
    description: "Return a structured Astra AI response with narrative, takeaways, confidence, volatility, and disclaimers.",
    parameters: {
      type: "object",
      required: ["mode", "query", "answer", "takeaways", "confidence", "volatility", "disclaimers"],
      additionalProperties: false,
      properties: {
        mode: {
          type: "string",
          enum: ["astro_ai_chat", "glossary", "prop_explainer", "team_bets", "player_props"],
        },
        query: {
          type: "object",
          required: ["text", "category"],
          additionalProperties: false,
          properties: {
            text: { type: "string" },
            category: {
              type: "string",
              enum: ["placement_meaning", "transit_impact", "horary_rules", "astrocartography_factor", "betting_lens", "definition", "other"],
            },
          },
        },
        answer: {
          type: "object",
          required: ["narrative", "tone"],
          additionalProperties: false,
          properties: {
            narrative: { type: "string", description: "Single cohesive conversational paragraph (5-10 sentences). No source labels." },
            tone: { type: "string", enum: ["conversational", "clinical", "playful", "direct"] },
            summary: { type: "string", description: "Optional 1-2 sentence TL;DR." },
          },
        },
        takeaways: {
          type: "object",
          required: ["strengtheners", "weakeners", "team_vs_player"],
          additionalProperties: false,
          properties: {
            strengtheners: {
              type: "array",
              items: {
                type: "object",
                required: ["text"],
                additionalProperties: false,
                properties: {
                  text: { type: "string" },
                  tag: { type: "string", enum: ["transits", "natal", "aspects", "combustion", "injury_risk", "chemistry", "role_usage", "matchup", "location", "market", "other"] },
                  priority: { type: "integer", minimum: 1, maximum: 5 },
                },
              },
            },
            weakeners: {
              type: "array",
              items: {
                type: "object",
                required: ["text"],
                additionalProperties: false,
                properties: {
                  text: { type: "string" },
                  tag: { type: "string", enum: ["transits", "natal", "aspects", "combustion", "injury_risk", "chemistry", "role_usage", "matchup", "location", "market", "other"] },
                  priority: { type: "integer", minimum: 1, maximum: 5 },
                },
              },
            },
            team_vs_player: {
              type: "array",
              items: {
                type: "object",
                required: ["text"],
                additionalProperties: false,
                properties: {
                  text: { type: "string" },
                  tag: { type: "string", enum: ["transits", "natal", "aspects", "combustion", "injury_risk", "chemistry", "role_usage", "matchup", "location", "market", "other"] },
                  priority: { type: "integer", minimum: 1, maximum: 5 },
                },
              },
            },
            actionable_next_steps: {
              type: "array",
              items: {
                type: "object",
                required: ["text"],
                additionalProperties: false,
                properties: {
                  text: { type: "string" },
                  tag: { type: "string", enum: ["transits", "natal", "aspects", "combustion", "injury_risk", "chemistry", "role_usage", "matchup", "location", "market", "other"] },
                  priority: { type: "integer", minimum: 1, maximum: 5 },
                },
              },
            },
          },
        },
        confidence: {
          type: "object",
          required: ["level", "rationale"],
          additionalProperties: false,
          properties: {
            level: { type: "string", enum: ["low", "medium", "high"] },
            rationale: { type: "string" },
          },
        },
        volatility: {
          type: "object",
          required: ["level", "rationale"],
          additionalProperties: false,
          properties: {
            level: { type: "string", enum: ["low", "medium", "high"] },
            rationale: { type: "string" },
          },
        },
        disclaimers: {
          type: "array",
          items: { type: "string" },
        },
        follow_up_questions: {
          type: "array",
          items: { type: "string" },
        },
      },
    },
  },
};

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
      chart_data,
      player_name,
      player2_name,
      game_context,
      prop_context,
      election_data,
      transit_data,
      astrocarto_data,
      custom_prompt,
    } = body;

    const systemPrompt = `You are Astra, a conversational astro-sports analyst.

You receive structured astro signals from multiple engines that may overlap or conflict.
Your job is to synthesize them into ONE cohesive answer for a non-astrologer.

STYLE:
- Warm, clear, conversational. No source labels like "Astrology API" or "AstroVisor."
- No bullet-dumps as the main answer. Bullets come in structured takeaways.
- If signals conflict, reconcile with conditional language ("can indicate X, but if Y then expect Z instead").
- Avoid absolute claims. Use probabilistic language.

LOGIC ORDER (highest weight first):
1) "Today" factors: transits, aspects to key natal points, combust/afflictions
2) Natal baseline: sign/house/aspects
3) Context: role on team, matchup, minutes/usage, coaching tendencies
4) Location: astrocartography / venue
5) Market: odds movement, lines, injury/news

INTERNAL RULES (never expose these in output):
- If hard transit to Mars → downgrade "statement game," upgrade "tilt/injury/reckless" risk
- If supportive transit to Mars → upgrade "big play / leadership / confidence"
- If team chemistry unstable → steer user to props over team outcomes
- Multiple engines may disagree — always unify into ONE voice

You MUST call the astra_response function with your structured answer. The narrative should be 5-10 sentences covering:
- Direct answer (what it generally means)
- How it shows up in performance
- Where it can backfire
- What changes the call today (transits / aspects / location / role / matchup)
- Betting lens (player props vs team outcome)
- Bottom line

Always include at least one disclaimer about responsible gambling.
Always set tone to "conversational" unless context demands otherwise.
Classify the query category accurately.`;

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

    // Call Lovable AI with tool calling for structured output
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
        tools: [ASTRA_RESPONSE_TOOL],
        tool_choice: { type: "function", function: { name: "astra_response" } },
        max_tokens: 2000,
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
    
    // Extract structured response from tool call
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      let structured: any;
      try {
        structured = typeof toolCall.function.arguments === "string"
          ? JSON.parse(toolCall.function.arguments)
          : toolCall.function.arguments;
      } catch {
        throw new Error("Failed to parse structured AI response");
      }

      // Add version and original query text
      const response = {
        version: "1.0",
        ...structured,
        query: {
          ...structured.query,
          text: custom_prompt || userPrompt.slice(0, 200),
        },
      };

      return new Response(
        JSON.stringify({ success: true, structured: response, mode }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fallback: if tool calling didn't work, return raw text wrapped in legacy format
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
