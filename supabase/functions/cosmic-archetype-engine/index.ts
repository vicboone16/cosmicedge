import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

/* ══════════════════════════════════════════════════════════════
   Cosmic Archetype Engine
   Classifies players, games, bets, and slips into branded
   archetypes using existing engine outputs.
   ══════════════════════════════════════════════════════════════ */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ── Archetype Catalog ──────────────────────────────────────────

interface ArchetypeDef {
  name: string;
  family: string;
  description: string;
}

const PLAYER_ARCHETYPES: ArchetypeDef[] = [
  { name: "Closer", family: "closing", description: "Dominates late-game situations with high usage and composure under pressure." },
  { name: "Surge Catalyst", family: "momentum", description: "Ignites explosive scoring runs and shifts game momentum rapidly." },
  { name: "Silent Accumulator", family: "role", description: "Quietly builds stat lines through steady, consistent production without dramatic bursts." },
  { name: "Pressure King", family: "pressure", description: "Thrives in high-leverage situations and tight game scripts." },
  { name: "Volatility Magnet", family: "volatility", description: "Produces wildly swingy outcomes with high upside and downside variance." },
  { name: "Shadow Scorer", family: "shadow", description: "Scores efficiently but often flies under the radar in box score narratives." },
  { name: "Glass Hunter", family: "role", description: "Specializes in rebounding with aggressive board pursuit and positioning." },
  { name: "Facilitator Mystic", family: "role", description: "Creates opportunities for teammates through vision and passing artistry." },
  { name: "Heat Check Artist", family: "momentum", description: "Streaky scorer who can catch fire or go cold rapidly." },
  { name: "Late Bloom Creator", family: "timing", description: "Production accelerates as the game progresses, peaking in later periods." },
  { name: "Disruptor", family: "pressure", description: "Impacts games through defense, steals, blocks, and forced turnovers." },
  { name: "Trap Favorite", family: "trap", description: "Looks appealing on paper but underlying support metrics are fragile." },
  { name: "Usage Phantom", family: "shadow", description: "Inconsistent usage share makes production unpredictable game to game." },
  { name: "Chaos Contributor", family: "volatility", description: "Adds value in disorganized game states but struggles in structured play." },
  { name: "Steady Builder", family: "role", description: "Reliable, low-variance producer who consistently approaches projections." },
  { name: "Collapse Risk", family: "trap", description: "At risk of sharp production dropoff due to foul trouble, blowout, or role reduction." },
];

const GAME_ARCHETYPES: ArchetypeDef[] = [
  { name: "Firestorm", family: "momentum", description: "Fast-paced, high-scoring game with explosive runs and elevated totals." },
  { name: "Grindhouse", family: "pressure", description: "Slow, physical, low-scoring game favoring unders and defensive props." },
  { name: "Swing State", family: "volatility", description: "Competitive game with frequent lead changes and uncertain outcome." },
  { name: "Closing War", family: "closing", description: "Tight late-game battle where closers and high-minute stars dominate." },
  { name: "Chaos Script", family: "volatility", description: "Unpredictable game flow with momentum swings and unusual stat distributions." },
  { name: "Dead Zone", family: "shadow", description: "Low-energy, non-competitive game where production becomes unreliable." },
  { name: "Shadow Pace", family: "shadow", description: "Deceptively slow game that looks competitive but suppresses stat accumulation." },
  { name: "Pressure Chamber", family: "pressure", description: "High-stakes, intense atmosphere that amplifies pressure on performers." },
  { name: "Blowout Mirage", family: "trap", description: "Game appears competitive but one team is pulling away, threatening garbage time." },
  { name: "Reversal Theater", family: "momentum", description: "Game featuring dramatic comebacks and momentum reversals." },
];

const BET_ARCHETYPES: ArchetypeDef[] = [
  { name: "Sharp Value", family: "value", description: "Strong mathematical edge with model agreement and stable support." },
  { name: "Fragile Edge", family: "trap", description: "Positive EV but vulnerable to game environment shifts." },
  { name: "Hidden Gem", family: "value", description: "Undervalued line with strong underlying metrics not reflected in price." },
  { name: "Trap Door", family: "trap", description: "Looks tempting but trap indicators are elevated." },
  { name: "Cosmic Greenlight", family: "timing", description: "Math and cosmic signals align for a premium entry window." },
  { name: "Reversal Risk", family: "volatility", description: "Current trajectory supports the bet but reversal probability is elevated." },
  { name: "Late Surge Spot", family: "timing", description: "Value increases if the player enters a strong closing window." },
  { name: "Quiet Over", family: "shadow", description: "Over that hits through steady accumulation rather than explosive scoring." },
  { name: "Hollow Favorite", family: "trap", description: "Popular pick with shallow underlying support." },
  { name: "Shadow Under", family: "shadow", description: "Under with hidden support from pace, environment, or role suppression." },
  { name: "Pressure Play", family: "pressure", description: "Bet that benefits from competitive pressure keeping stars engaged." },
  { name: "Volatility Bomb", family: "volatility", description: "High-variance play with dramatic upside and downside potential." },
];

const SLIP_ARCHETYPES: ArchetypeDef[] = [
  { name: "Balanced Ritual", family: "value", description: "Well-diversified slip with uncorrelated legs and stable support." },
  { name: "Chaos Stack", family: "volatility", description: "Too much shared volatility and correlated risk across legs." },
  { name: "Overexposed Ladder", family: "trap", description: "Multiple legs dependent on the same game environment." },
  { name: "Sharp Cluster", family: "value", description: "Collection of individually strong-edge plays." },
  { name: "Fragile Flex", family: "trap", description: "Looks creative but has structural weaknesses in support." },
  { name: "Same-Game Spell", family: "volatility", description: "Same-game parlay with correlated upside but amplified risk." },
  { name: "Pressure Build", family: "pressure", description: "Legs that all benefit from competitive, close-game environments." },
  { name: "Shadow Stack", family: "shadow", description: "Under-the-radar legs that accumulate quietly." },
  { name: "Sniper Slip", family: "value", description: "Small, precise slip with high-confidence legs." },
  { name: "Tilt Trap", family: "trap", description: "Slip structure suggests emotional or reactionary decision-making." },
];

// ── Classification Logic ────────────────────────────────────────

interface PlayerContext {
  season_avg: number;
  recent_avg_l5: number;
  std_dev: number;
  minutes_avg: number;
  assists_avg: number;
  rebounds_avg: number;
  steals_avg: number;
  blocks_avg: number;
  fg_pct: number;
  usage_proxy: number;
  games_played: number;
}

interface GameContext {
  home_pace: number;
  away_pace: number;
  home_net_rating: number;
  away_net_rating: number;
  matchup_pace: number;
  blowout_risk: number;
  is_live: boolean;
  score_diff: number;
  quarter: number;
}

function classifyPlayer(ctx: PlayerContext): { primary: ArchetypeDef; secondary: ArchetypeDef | null; score: number; confidence: number; reasons: string[] } {
  const scores: { arch: ArchetypeDef; score: number; reasons: string[] }[] = [];
  const cv = ctx.std_dev / Math.max(ctx.season_avg, 0.1);

  // Steady Builder: low variance, consistent
  const steadyScore = Math.max(0, 1 - cv * 2) * 0.7 + (ctx.games_played > 20 ? 0.3 : 0);
  scores.push({ arch: PLAYER_ARCHETYPES.find(a => a.name === "Steady Builder")!, score: steadyScore, reasons: ["Low variance", `CV: ${cv.toFixed(2)}`] });

  // Volatility Magnet: high variance
  const volScore = Math.min(1, cv * 1.5);
  scores.push({ arch: PLAYER_ARCHETYPES.find(a => a.name === "Volatility Magnet")!, score: volScore, reasons: ["High outcome variance", `CV: ${cv.toFixed(2)}`] });

  // Silent Accumulator: modest avg, low std dev, consistent
  const silentScore = (ctx.season_avg > 5 && ctx.season_avg < 20 && cv < 0.35) ? 0.7 + (0.35 - cv) : 0.2;
  scores.push({ arch: PLAYER_ARCHETYPES.find(a => a.name === "Silent Accumulator")!, score: silentScore, reasons: ["Quiet consistency", `Avg: ${ctx.season_avg.toFixed(1)}`] });

  // Surge Catalyst: recent avg much higher than season avg
  const surgeRatio = ctx.recent_avg_l5 / Math.max(ctx.season_avg, 0.1);
  const surgeScore = Math.min(1, Math.max(0, (surgeRatio - 1.15) * 3));
  scores.push({ arch: PLAYER_ARCHETYPES.find(a => a.name === "Surge Catalyst")!, score: surgeScore, reasons: ["Recent production spike", `L5 ratio: ${surgeRatio.toFixed(2)}`] });

  // Facilitator Mystic: high assists
  const facScore = Math.min(1, ctx.assists_avg / 8);
  scores.push({ arch: PLAYER_ARCHETYPES.find(a => a.name === "Facilitator Mystic")!, score: facScore, reasons: ["High assist creation", `Avg: ${ctx.assists_avg.toFixed(1)} AST`] });

  // Glass Hunter: high rebounds
  const glassScore = Math.min(1, ctx.rebounds_avg / 10);
  scores.push({ arch: PLAYER_ARCHETYPES.find(a => a.name === "Glass Hunter")!, score: glassScore, reasons: ["Aggressive board pursuit", `Avg: ${ctx.rebounds_avg.toFixed(1)} REB`] });

  // Disruptor: high steals + blocks
  const disruptScore = Math.min(1, (ctx.steals_avg + ctx.blocks_avg) / 4);
  scores.push({ arch: PLAYER_ARCHETYPES.find(a => a.name === "Disruptor")!, score: disruptScore, reasons: ["Defensive disruption", `STL+BLK: ${(ctx.steals_avg + ctx.blocks_avg).toFixed(1)}`] });

  // Heat Check Artist: high scoring + high variance
  const heatScore = (ctx.season_avg > 15 && cv > 0.3) ? Math.min(1, cv * 1.2 + (ctx.season_avg - 15) / 20) : 0.1;
  scores.push({ arch: PLAYER_ARCHETYPES.find(a => a.name === "Heat Check Artist")!, score: heatScore, reasons: ["Streaky scoring profile", `${ctx.season_avg.toFixed(1)} PPG, CV: ${cv.toFixed(2)}`] });

  // Pressure King: high minutes + high scoring in close games (proxy: high usage + high avg)
  const pressureScore = (ctx.minutes_avg > 32 && ctx.season_avg > 18) ? Math.min(1, (ctx.minutes_avg - 30) / 10 + (ctx.season_avg - 18) / 15) : 0.15;
  scores.push({ arch: PLAYER_ARCHETYPES.find(a => a.name === "Pressure King")!, score: pressureScore, reasons: ["High-minute star", `${ctx.minutes_avg.toFixed(1)} MIN, ${ctx.season_avg.toFixed(1)} PPG`] });

  // Closer: high minutes + high avg (top player signal)
  const closerScore = (ctx.minutes_avg > 34 && ctx.season_avg > 20) ? Math.min(1, 0.5 + (ctx.minutes_avg - 34) / 8 + (ctx.season_avg - 20) / 20) : 0.1;
  scores.push({ arch: PLAYER_ARCHETYPES.find(a => a.name === "Closer")!, score: closerScore, reasons: ["Late-game anchor profile", `${ctx.minutes_avg.toFixed(1)} MIN`] });

  // Collapse Risk: declining recent production
  const declineRatio = ctx.recent_avg_l5 / Math.max(ctx.season_avg, 0.1);
  const collapseScore = Math.min(1, Math.max(0, (0.8 - declineRatio) * 3));
  scores.push({ arch: PLAYER_ARCHETYPES.find(a => a.name === "Collapse Risk")!, score: collapseScore, reasons: ["Declining production trend", `L5 ratio: ${declineRatio.toFixed(2)}`] });

  // Trap Favorite: declining + high avg (looks good on paper)
  const trapScore = (ctx.season_avg > 15 && declineRatio < 0.85) ? 0.6 + (0.85 - declineRatio) * 2 : 0.1;
  scores.push({ arch: PLAYER_ARCHETYPES.find(a => a.name === "Trap Favorite")!, score: Math.min(1, trapScore), reasons: ["Attractive line, weakening support", `Decline: ${((1 - declineRatio) * 100).toFixed(0)}%`] });

  scores.sort((a, b) => b.score - a.score);
  const primary = scores[0];
  const secondary = scores[1].score > 0.3 ? scores[1] : null;

  return {
    primary: primary.arch,
    secondary: secondary?.arch || null,
    score: Math.round(primary.score * 100) / 100,
    confidence: Math.min(1, primary.score * 1.2 - (secondary ? secondary.score * 0.3 : 0)),
    reasons: primary.reasons,
  };
}

function classifyGame(ctx: GameContext): { primary: ArchetypeDef; secondary: ArchetypeDef | null; score: number; confidence: number; reasons: string[] } {
  const scores: { arch: ArchetypeDef; score: number; reasons: string[] }[] = [];
  const pace = ctx.matchup_pace;
  const netDiff = Math.abs(ctx.home_net_rating - ctx.away_net_rating);

  // Firestorm
  const fireScore = Math.min(1, Math.max(0, (pace - 100) / 8));
  scores.push({ arch: GAME_ARCHETYPES.find(a => a.name === "Firestorm")!, score: fireScore, reasons: ["Fast pace environment", `Pace: ${pace.toFixed(1)}`] });

  // Grindhouse
  const grindScore = Math.min(1, Math.max(0, (97 - pace) / 7));
  scores.push({ arch: GAME_ARCHETYPES.find(a => a.name === "Grindhouse")!, score: grindScore, reasons: ["Slow, physical pace", `Pace: ${pace.toFixed(1)}`] });

  // Swing State: close net ratings
  const swingScore = Math.min(1, Math.max(0, (8 - netDiff) / 8));
  scores.push({ arch: GAME_ARCHETYPES.find(a => a.name === "Swing State")!, score: swingScore, reasons: ["Competitive matchup", `Net diff: ${netDiff.toFixed(1)}`] });

  // Blowout Mirage
  const blowoutScore = Math.min(1, ctx.blowout_risk * 1.5);
  scores.push({ arch: GAME_ARCHETYPES.find(a => a.name === "Blowout Mirage")!, score: blowoutScore, reasons: ["Blowout risk elevated", `Risk: ${(ctx.blowout_risk * 100).toFixed(0)}%`] });

  // Closing War: close game + late
  const closingWarScore = ctx.is_live && ctx.quarter >= 3 && Math.abs(ctx.score_diff) <= 8
    ? Math.min(1, 0.5 + (8 - Math.abs(ctx.score_diff)) / 16)
    : swingScore * 0.5;
  scores.push({ arch: GAME_ARCHETYPES.find(a => a.name === "Closing War")!, score: closingWarScore, reasons: ["Late-game battle", `Q${ctx.quarter}, Diff: ${ctx.score_diff}`] });

  // Pressure Chamber: close + slow
  const chamberScore = swingScore * 0.5 + grindScore * 0.5;
  scores.push({ arch: GAME_ARCHETYPES.find(a => a.name === "Pressure Chamber")!, score: chamberScore, reasons: ["Tight, physical game", `Pace: ${pace.toFixed(1)}, Net diff: ${netDiff.toFixed(1)}`] });

  // Chaos Script: fast + close
  const chaosScore = fireScore * 0.5 + swingScore * 0.5;
  scores.push({ arch: GAME_ARCHETYPES.find(a => a.name === "Chaos Script")!, score: chaosScore, reasons: ["Fast and unpredictable", `Pace: ${pace.toFixed(1)}`] });

  // Dead Zone: large blowout risk + slow
  const deadScore = blowoutScore * 0.6 + grindScore * 0.3;
  scores.push({ arch: GAME_ARCHETYPES.find(a => a.name === "Dead Zone")!, score: deadScore, reasons: ["Low-energy environment risk"] });

  scores.sort((a, b) => b.score - a.score);
  const primary = scores[0];
  const secondary = scores[1].score > 0.3 ? scores[1] : null;

  return {
    primary: primary.arch,
    secondary: secondary?.arch || null,
    score: Math.round(primary.score * 100) / 100,
    confidence: Math.min(1, primary.score),
    reasons: primary.reasons,
  };
}

function classifyBet(hitProb: number, ev: number, trapRisk: number, riskGrade: string, confidence: string): { primary: ArchetypeDef; secondary: ArchetypeDef | null; score: number; reasons: string[] } {
  const scores: { arch: ArchetypeDef; score: number; reasons: string[] }[] = [];

  // Sharp Value
  const sharpScore = (ev > 3 && hitProb > 0.55) ? Math.min(1, ev / 10 + hitProb * 0.5) : 0.1;
  scores.push({ arch: BET_ARCHETYPES.find(a => a.name === "Sharp Value")!, score: sharpScore, reasons: [`EV: ${ev.toFixed(1)}%, Hit: ${(hitProb * 100).toFixed(0)}%`] });

  // Hidden Gem
  const gemScore = (ev > 2 && hitProb > 0.5 && confidence !== "elite") ? 0.5 + ev / 15 : 0.1;
  scores.push({ arch: BET_ARCHETYPES.find(a => a.name === "Hidden Gem")!, score: Math.min(1, gemScore), reasons: ["Undervalued line with solid support"] });

  // Trap Door
  const trapScore = Math.min(1, trapRisk * 1.3);
  scores.push({ arch: BET_ARCHETYPES.find(a => a.name === "Trap Door")!, score: trapScore, reasons: [`Trap risk: ${(trapRisk * 100).toFixed(0)}%`] });

  // Fragile Edge
  const fragileScore = (ev > 0 && (riskGrade === "elevated" || riskGrade === "high")) ? 0.6 : 0.1;
  scores.push({ arch: BET_ARCHETYPES.find(a => a.name === "Fragile Edge")!, score: fragileScore, reasons: ["Positive EV but elevated risk environment"] });

  // Hollow Favorite
  const hollowScore = (hitProb < 0.5 && trapRisk > 0.3) ? 0.5 + trapRisk * 0.5 : 0.1;
  scores.push({ arch: BET_ARCHETYPES.find(a => a.name === "Hollow Favorite")!, score: Math.min(1, hollowScore), reasons: ["Popular but shallow support"] });

  // Volatility Bomb
  const volBombScore = (riskGrade === "high" || riskGrade === "extreme") ? 0.7 : 0.15;
  scores.push({ arch: BET_ARCHETYPES.find(a => a.name === "Volatility Bomb")!, score: volBombScore, reasons: [`Risk grade: ${riskGrade}`] });

  scores.sort((a, b) => b.score - a.score);
  return {
    primary: scores[0].arch,
    secondary: scores[1]?.score > 0.3 ? scores[1].arch : null,
    score: scores[0].score,
    reasons: scores[0].reasons,
  };
}

// ── Interpretation Generator ────────────────────────────────────

function generateInterpretation(archetype: string, entityType: string, reasons: string[]): string {
  const templates: Record<string, string> = {
    "Closer": "This player tends to dominate late-game situations and should be favored in competitive finishes.",
    "Surge Catalyst": "Recent production has spiked significantly, suggesting a hot streak or expanded role.",
    "Silent Accumulator": "This player builds quietly and finishes stronger than the box score initially suggests.",
    "Pressure King": "Thrives under high-leverage pressure and competitive game environments.",
    "Volatility Magnet": "Expect sharp swings — outcomes can dramatically exceed or miss projections.",
    "Steady Builder": "Reliable, low-variance producer who consistently approaches his averages.",
    "Trap Favorite": "Numbers look attractive on paper, but underlying support is weakening.",
    "Collapse Risk": "Production trend is declining — exercise caution with current lines.",
    "Firestorm": "Fast-paced, high-scoring environment that inflates counting stats across the board.",
    "Grindhouse": "Slow, physical game that suppresses scoring and favors under plays.",
    "Swing State": "Competitive game with uncertain outcome — closers and high-minute stars benefit.",
    "Closing War": "Late-game battle ahead — expect stars to play heavy minutes down the stretch.",
    "Blowout Mirage": "Game may not stay competitive, threatening late-game minutes and production.",
    "Sharp Value": "Strong mathematical edge with stable support from multiple model signals.",
    "Trap Door": "This line looks tempting but trap indicators suggest caution.",
    "Hidden Gem": "Undervalued play with strong underlying metrics not yet priced in.",
    "Fragile Edge": "Positive expected value but structurally vulnerable to environment shifts.",
  };
  return templates[archetype] || `${entityType} classified as ${archetype}. ${reasons.join(". ")}.`;
}

// ── Main Handler ────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { entity_type, entity_id, game_id, player_id, user_id } = body;
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (entity_type === "player" && player_id) {
      // Fetch player stats
      const { data: stats } = await sb
        .from("player_season_stats")
        .select("points, rebounds, assists, steals, blocks, fg_pct, minutes, std_dev, games_played, fg_attempted")
        .eq("player_id", player_id)
        .eq("period", "full")
        .eq("stat_type", "per_game")
        .order("season", { ascending: false })
        .limit(1)
        .single();

      // Fetch recent L5 averages
      const { data: recentGames } = await sb
        .from("player_game_stats")
        .select("points, game_id")
        .eq("player_id", player_id)
        .eq("period", "full")
        .order("created_at", { ascending: false })
        .limit(5);

      const recentAvg = recentGames?.length
        ? recentGames.reduce((s, g) => s + (g.points || 0), 0) / recentGames.length
        : stats?.points || 0;

      const ctx: PlayerContext = {
        season_avg: stats?.points || 0,
        recent_avg_l5: recentAvg,
        std_dev: stats?.std_dev || 3,
        minutes_avg: stats?.minutes || 28,
        assists_avg: stats?.assists || 0,
        rebounds_avg: stats?.rebounds || 0,
        steals_avg: stats?.steals || 0,
        blocks_avg: stats?.blocks || 0,
        fg_pct: stats?.fg_pct || 0.45,
        usage_proxy: stats?.fg_attempted || 12,
        games_played: stats?.games_played || 0,
      };

      const result = classifyPlayer(ctx);
      const interpretation = generateInterpretation(result.primary.name, "player", result.reasons);

      // Upsert player_archetype_profile
      await sb.from("player_archetype_profile").upsert({
        player_id,
        baseline_archetype: result.primary.name,
        live_archetype: result.primary.name,
        archetype_stability_score: Math.round(result.confidence * 100) / 100,
        baseline_score: result.score,
        live_score: result.score,
        baseline_confidence: result.confidence,
        live_confidence: result.confidence,
        archetype_family: result.primary.family,
        recommended_interpretation: interpretation,
        pressure_archetype: result.secondary?.name || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "player_id" });

      // Upsert cosmic_archetype_state
      await sb.from("cosmic_archetype_state").upsert({
        entity_type: "player",
        entity_id: player_id,
        primary_archetype: result.primary.name,
        secondary_archetype: result.secondary?.name || null,
        archetype_family: result.primary.family,
        archetype_score: result.score,
        archetype_confidence: result.confidence,
        archetype_reason_primary: result.reasons[0] || null,
        archetype_reason_secondary: result.reasons[1] || null,
        recommended_interpretation: interpretation,
        game_id: game_id || null,
        user_id: user_id || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "entity_type,entity_id", ignoreDuplicates: false });

      return new Response(JSON.stringify({
        success: true,
        entity_type: "player",
        primary_archetype: result.primary.name,
        secondary_archetype: result.secondary?.name || null,
        archetype_family: result.primary.family,
        archetype_score: result.score,
        archetype_confidence: result.confidence,
        interpretation,
        reasons: result.reasons,
        description: result.primary.description,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (entity_type === "game" && game_id) {
      // Fetch pace data
      const { data: game } = await sb
        .from("games")
        .select("home_abbr, away_abbr, league, status, home_score, away_score")
        .eq("id", game_id)
        .single();

      let homeP = 100, awayP = 100, homeNet = 0, awayNet = 0, blowout = 0;
      if (game) {
        const { data: pace } = await sb
          .from("team_season_pace")
          .select("team_abbr, avg_pace, net_rating")
          .in("team_abbr", [game.home_abbr, game.away_abbr]);

        pace?.forEach(p => {
          if (p.team_abbr === game.home_abbr) { homeP = p.avg_pace || 100; homeNet = p.net_rating || 0; }
          if (p.team_abbr === game.away_abbr) { awayP = p.avg_pace || 100; awayNet = p.net_rating || 0; }
        });
        blowout = Math.min(1, Math.abs(homeNet - awayNet) / 30);
      }

      const isLive = game?.status === "in_progress";
      const ctx: GameContext = {
        home_pace: homeP,
        away_pace: awayP,
        home_net_rating: homeNet,
        away_net_rating: awayNet,
        matchup_pace: (homeP + awayP) / 2,
        blowout_risk: blowout,
        is_live: isLive,
        score_diff: (game?.home_score || 0) - (game?.away_score || 0),
        quarter: 1,
      };

      const result = classifyGame(ctx);
      const interpretation = generateInterpretation(result.primary.name, "game", result.reasons);

      await sb.from("game_archetype_profile").upsert({
        game_id,
        baseline_game_archetype: result.primary.name,
        live_game_archetype: result.primary.name,
        tempo_archetype: ctx.matchup_pace > 102 ? "Firestorm" : ctx.matchup_pace < 96 ? "Grindhouse" : "Swing State",
        pressure_archetype: result.secondary?.name || null,
        volatility_archetype: null,
        archetype_score: result.score,
        archetype_confidence: result.confidence,
        archetype_family: result.primary.family,
        recommended_interpretation: interpretation,
        updated_at: new Date().toISOString(),
      }, { onConflict: "game_id" });

      return new Response(JSON.stringify({
        success: true,
        entity_type: "game",
        primary_archetype: result.primary.name,
        secondary_archetype: result.secondary?.name || null,
        archetype_family: result.primary.family,
        archetype_score: result.score,
        archetype_confidence: result.confidence,
        interpretation,
        reasons: result.reasons,
        description: result.primary.description,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (entity_type === "bet") {
      const hitProb = body.hit_probability ?? 0.5;
      const ev = body.expected_value ?? 0;
      const trapRisk = body.trap_risk ?? 0;
      const riskGrade = body.risk_grade ?? "moderate";
      const confidence = body.confidence_grade ?? "medium";

      const result = classifyBet(hitProb, ev, trapRisk, riskGrade, confidence);
      const interpretation = generateInterpretation(result.primary.name, "bet", result.reasons);

      if (entity_id) {
        await sb.from("cosmic_archetype_state").upsert({
          entity_type: "bet",
          entity_id,
          primary_archetype: result.primary.name,
          secondary_archetype: result.secondary?.name || null,
          archetype_family: result.primary.family,
          archetype_score: result.score,
          archetype_confidence: Math.min(1, result.score),
          archetype_reason_primary: result.reasons[0] || null,
          recommended_interpretation: interpretation,
          game_id: game_id || null,
          user_id: user_id || null,
          updated_at: new Date().toISOString(),
        }, { onConflict: "entity_type,entity_id", ignoreDuplicates: false });
      }

      return new Response(JSON.stringify({
        success: true,
        entity_type: "bet",
        primary_archetype: result.primary.name,
        secondary_archetype: result.secondary?.name || null,
        archetype_family: result.primary.family,
        archetype_score: result.score,
        interpretation,
        reasons: result.reasons,
        description: result.primary.description,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Catalog endpoint
    if (body.action === "catalog") {
      return new Response(JSON.stringify({
        player_archetypes: PLAYER_ARCHETYPES,
        game_archetypes: GAME_ARCHETYPES,
        bet_archetypes: BET_ARCHETYPES,
        slip_archetypes: SLIP_ARCHETYPES,
        families: ["momentum", "pressure", "shadow", "volatility", "timing", "value", "trap", "role", "closing"],
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Provide entity_type (player|game|bet) with required IDs, or action: catalog" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Cosmic Archetype Engine error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
