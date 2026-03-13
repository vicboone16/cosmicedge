import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const authHeader = req.headers.get("authorization") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // Verify user
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error: authError } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const { action, slip, picks, intent_state, slip_score } = body;

    // Build context for AI
    const legsContext = (picks || []).map((p: any, i: number) => {
      const legScore = slip_score?.legs?.[i];
      return `Leg ${i + 1}: ${p.player_name_raw} — ${p.stat_type} ${p.direction} ${p.line}` +
        (legScore ? ` | Score: ${legScore.score}/100 (${legScore.grade}) | Edge: ${legScore.edge}% | Conf: ${legScore.confidence}% | Vol: ${legScore.volatility}% | ${legScore.rationale}` : "") +
        (p.match_status === "synthetic_created" ? " [SYNTHETIC/IMPORTED]" : "");
    }).join("\n");

    const slipContext = slip_score
      ? `Slip Score: ${slip_score.score}/100 (${slip_score.grade}) | Risk: ${slip_score.riskLevel} | Avg Edge: ${slip_score.avgEdge}% | Avg Conf: ${slip_score.avgConfidence}%`
      : "No scoring data available.";

    const intentLabel = intent_state === "already_placed" ? "ALREADY PLACED (advisory only, no direct replacement actions)"
      : intent_state === "thinking" ? "THINKING ABOUT PLACING (full optimization, suggest replacements)"
      : intent_state === "building" ? "BUILDING/COMPARING (editable, suggest experiments)"
      : "TRACKING ONLY (monitoring and grading)";

    let systemPrompt = `You are the CosmicEdge AI Slip Optimizer. You analyze sports betting slips and provide data-driven evaluation.

SLIP INTENT: ${intentLabel}

CURRENT SLIP:
${slipContext}

LEGS:
${legsContext}

RULES:
- Be specific about each leg. Reference player names and stats.
- Give actionable, concise advice.
- Use numbers (edge %, confidence %, score deltas).
- If already_placed: focus on evaluation, tracking, and "what I'd change next time" — NOT direct replacements as primary actions.
- If thinking/building: actively suggest replacements and improvements.
- If tracking_only: focus on progress monitoring and grading.
- For synthetic/imported props, acknowledge limited data but still evaluate.
- Keep responses under 400 words.
- Structure with clear sections using **bold** headers.`;

    let userPrompt = "";

    switch (action) {
      case "evaluate":
        userPrompt = "Evaluate this slip comprehensively. Identify strongest and weakest legs. Provide an overall assessment and any risk flags.";
        break;
      case "optimize":
        userPrompt = "Optimize this slip. Identify the weakest leg and suggest specific replacement candidates with estimated score improvements. Compare the current vs optimized version.";
        break;
      case "replace_weakest":
        userPrompt = "Identify the weakest leg in this slip. Suggest 2-3 specific replacement options from the same game slate. For each, explain: why it's better, estimated edge delta, confidence delta, and volatility delta.";
        break;
      case "reduce_risk":
        userPrompt = "Analyze the risk profile of this slip. Identify the highest-volatility legs and suggest safer alternatives that maintain similar edge but reduce overall slip volatility.";
        break;
      case "increase_upside":
        userPrompt = "Suggest modifications to increase the upside/ceiling of this slip. Identify legs where a more aggressive line or stat type could boost the payout while maintaining reasonable probability.";
        break;
      case "compare_better":
        userPrompt = "Create a 'Better Version' of this slip. Keep the strongest 1-2 legs and rebuild the rest. Show the projected score improvement.";
        break;
      case "hedge_ideas":
        userPrompt = "Analyze this placed slip for potential hedge scenarios. Which legs are most at risk? If the slip comes down to 1-2 final legs, what would be the most logical hedge positions?";
        break;
      case "rebuild_suggestions":
        userPrompt = "This slip is already placed and locked. Provide 'What I'd Change Next Time' suggestions. For each change, explain the estimated improvement in slip score, confidence, and volatility. Frame as future learning, not current actions.";
        break;
      case "compare_versions":
        userPrompt = "Compare the current slip construction against alternative versions. Suggest Version A (safer), Version B (balanced), and Version C (higher ceiling). Show score comparisons.";
        break;
      case "track_live":
        userPrompt = "Provide a live tracking summary. For each leg, assess the current pace toward hitting. Identify legs on track, legs in danger, and the overall slip trajectory.";
        break;
      default:
        userPrompt = "Provide a brief evaluation of this slip with key insights.";
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        stream: false,
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited — please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits in Settings." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${status}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "Unable to generate analysis.";

    return new Response(JSON.stringify({ ok: true, analysis: content, action }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("slip-optimizer error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
