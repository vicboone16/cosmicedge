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
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error: authError } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const { action, slip, picks, intent_state, slip_score } = body;

    // Build rich leg context
    const PERIOD_LABELS: Record<string, string> = {
      q1: "1st Quarter", q2: "2nd Quarter", q3: "3rd Quarter", q4: "4th Quarter",
      "1h": "1st Half", "2h": "2nd Half",
      first3: "First 3 Minutes", first5: "First 5 Minutes", first10: "First 10 Minutes",
      full: "Full Game",
    };

    const parsePeriod = (statType: string): { period: string; cleanStat: string } => {
      const colonIdx = statType.indexOf(":");
      if (colonIdx > 0) {
        const prefix = statType.slice(0, colonIdx);
        if (PERIOD_LABELS[prefix]) return { period: prefix, cleanStat: statType.slice(colonIdx + 1) };
      }
      return { period: "full", cleanStat: statType };
    };

    const legsContext = (picks || []).map((p: any, i: number) => {
      const legScore = slip_score?.legs?.[i];
      const { period, cleanStat } = parsePeriod(p.stat_type || "");
      const periodLabel = PERIOD_LABELS[period] || "Full Game";
      const parts = [`Leg ${i + 1}: ${p.player_name_raw} — ${cleanStat} ${p.direction} ${p.line} [${periodLabel}]`];
      if (legScore) {
        parts.push(`Score: ${legScore.score}/100 (${legScore.grade})`);
        parts.push(`Edge: ${legScore.edge}% | Prob: ${legScore.probability}% | Conf: ${legScore.confidence}% | Vol: ${legScore.volatility}%`);
        parts.push(`Matchup: ${legScore.matchup_quality} | Synthetic: ${legScore.isSynthetic}`);
        parts.push(`Rationale: ${legScore.rationale}`);
        if (legScore.flags?.length) parts.push(`Flags: ${legScore.flags.join(", ")}`);
      }
      if (p.live_value != null) parts.push(`Live: ${p.live_value}/${p.line} (${((p.live_value / p.line) * 100).toFixed(0)}%)`);
      if (p.result) parts.push(`Result: ${p.result}`);
      if (p.match_status === "synthetic_created") parts.push("[SYNTHETIC/IMPORTED]");
      return parts.join(" | ");
    }).join("\n");

    const slipContext = slip_score
      ? `Slip Score: ${slip_score.score}/100 (${slip_score.grade}) | ${slip_score.confidenceLabel} | Risk: ${slip_score.riskLevel}\nAvg Edge: ${slip_score.avgEdge}% | Avg Conf: ${slip_score.avgConfidence}% | Avg Vol: ${slip_score.avgVolatility}%\nStrongest: Leg ${slip_score.strongestLegIdx + 1} | Weakest: Leg ${slip_score.weakestLegIdx + 1}\nRisk Flags: ${slip_score.riskFlags?.join("; ") || "none"}`
      : "No scoring data available.";

    const stakeInfo = (slip?.stake || slip?.payout) 
      ? `Stake: $${slip.stake || "?"} | Payout: $${slip.payout || "?"} | Entry: ${slip.entry_type || "parlay"}`
      : "No stake/payout info.";

    const intentLabel = intent_state === "already_placed" ? "ALREADY PLACED — advisory mode only. Focus on evaluation, tracking, rebuild suggestions. Do NOT suggest direct edits as primary actions."
      : intent_state === "thinking" ? "THINKING ABOUT PLACING — full optimization mode. Actively suggest replacements, removals, and improvements."
      : intent_state === "building" ? "BUILDING/COMPARING — editable experiment mode. Compare versions, test constructions, suggest A/B/C variants."
      : "TRACKING ONLY — monitor, grade, and analyze. Show progress and projections.";

    const systemPrompt = `You are the CosmicEdge AI Slip Optimizer — an expert sports betting slip analyst.

SLIP INTENT: ${intentLabel}

CURRENT SLIP:
${slipContext}
${stakeInfo}

LEGS:
${legsContext}

RULES:
- Reference each leg by player name, stat type, line, and direction.
- Use specific numbers: edge %, confidence %, score deltas, volatility %.
- Structure responses with **bold** section headers.
- Keep responses under 500 words.
- For synthetic/imported props, acknowledge limited data but still evaluate.
- Grade everything on the 0-100 scale: 85+ elite, 75-84 strong, 65-74 playable, <65 weak.

INTENT-SPECIFIC RULES:
- already_placed: NEVER suggest direct replacements as primary actions. Focus on "What I'd Change Next Time" framing. Emphasize evaluation, strongest/weakest analysis, hedge awareness.
- thinking: Actively suggest specific replacement players/props with estimated score improvements. Show EV deltas.
- building: Compare Version A (safer), Version B (balanced), Version C (higher ceiling). Show score comparisons for each.
- tracking_only: Focus on live pace, completion projections, and postgame grading.

DELTA FORMAT (when showing improvements):
- Slip Score Delta: +X points
- Edge Delta: +X.X%
- Confidence Delta: +X%
- Volatility Delta: -X%
- Risk Impact: description

PLAIN ENGLISH SUMMARIES:
Always include a human-readable summary like:
- "This is your strongest leg because..."
- "Replacing [player] would improve the slip score by X points."
- "Since this slip is already placed, here's what I'd change next time..."`;

    let userPrompt = "";

    switch (action) {
      case "evaluate":
        userPrompt = `Evaluate this slip comprehensively.

Show:
1. **Overall Assessment** — grade, quality label, risk level
2. **Strongest Leg** — which leg and why (edge, confidence, matchup)
3. **Weakest Leg** — which leg and why, what makes it risky
4. **Risk Summary** — highest volatility legs, correlation risks, synthetic leg warnings
5. **Key Insight** — one actionable takeaway`;
        break;

      case "optimize":
        userPrompt = `Optimize this slip. For each change:
1. Identify the weakest leg
2. Suggest a specific replacement with estimated score improvement
3. Show Slip Score Delta, Edge Delta, Confidence Delta, Volatility Delta
4. Compare current vs optimized version
5. Provide a "safer version" and a "higher ceiling version" variant`;
        break;

      case "replace_weakest":
        userPrompt = `Identify the weakest leg. Suggest 2-3 replacement options from the same game slate or stat family.

For each replacement show:
- Current leg → Suggested replacement
- Why it's better (edge, matchup, volatility, signal)
- Estimated deltas: Score +/-, Edge +/-, Confidence +/-, Volatility +/-
- Tag: safer / stronger edge / lower volatility / better matchup

Label each as: "Safer Replacement", "Stronger Edge Swap", or "Lower Volatility Option"`;
        break;

      case "reduce_risk":
        userPrompt = `Analyze the risk profile. For each high-risk leg:
1. Why it's risky (volatility, thin edge, matchup, synthetic status)
2. Safer alternative that maintains similar edge
3. Estimated slip score improvement and volatility reduction
4. Overall risk reduction summary`;
        break;

      case "increase_upside":
        userPrompt = `Suggest modifications to increase upside/ceiling:
1. Which legs could take a more aggressive line or alt market
2. Estimated payout improvement
3. Tradeoff: what you lose in stability vs what you gain in ceiling
4. "Ceiling Version" slip with score comparison`;
        break;

      case "compare_better":
        userPrompt = `Create a "Better Version" of this slip:
1. Keep the strongest 1-2 legs
2. Replace the rest with better alternatives
3. Show: Original Score vs Better Version Score
4. Show leg-by-leg comparison with deltas`;
        break;

      case "compare_versions":
        userPrompt = `Generate three versions of this slip:

**Version A — Safer Build**
- Priority: lower volatility, higher confidence
- Show: legs, estimated score, risk level

**Version B — Balanced Build**  
- Priority: best overall score optimization
- Show: legs, estimated score, risk level

**Version C — High Ceiling Build**
- Priority: maximum upside, accepts higher risk
- Show: legs, estimated score, risk level

For each version show score comparison against current slip.`;
        break;

      case "hedge_ideas":
        userPrompt = `Analyze hedge scenarios for this placed slip:
1. Which legs are most at risk of failing?
2. If the slip comes down to 1-2 final legs, what's the logical hedge?
3. At what point should the user consider hedging?
4. Educational note on hedge math (stake vs guaranteed return)
Note: This is advisory only — no hedge execution assumed.`;
        break;

      case "rebuild_suggestions":
        userPrompt = `This slip is ALREADY PLACED. Provide "What I'd Change Next Time" suggestions:

For each suggested change:
- Which leg I would remove or replace
- What replacement would be stronger
- Estimated improvement: Score +/-, Confidence +/-, Volatility -/-
- Whether a fewer-leg version would have been better
- Whether a different construction (flex vs power) would help

Frame everything as future learning, NOT current actions.
Start with: "Since this slip is already locked in, here's what I'd build differently next time..."`;
        break;

      case "track_live":
        userPrompt = `Live tracking summary:
1. For each leg: current pace toward hitting, projected completion
2. Legs on track vs legs in danger
3. Overall slip trajectory (likely to hit, sweating, or in danger)
4. Key moments to watch in remaining game time
5. If any leg is already decided (hit or miss), note the impact on remaining slip odds`;
        break;

      default:
        userPrompt = "Provide a brief evaluation of this slip with key insights and the strongest/weakest leg.";
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
