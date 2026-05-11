/**
 * Hook: useCosmicPicks — Fetches today's top cosmic game picks
 * ranked by edge score from ce_game_predictions + team_astro enrichment.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { GameWithOdds } from "@/hooks/use-games";

export interface CosmicPick {
  gameId: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  homeAbbr: string;
  awayAbbr: string;
  startTime: string;
  /** "home" or "away" — the side the model favors */
  pickSide: "home" | "away";
  /** The favored team abbreviation */
  pickTeam: string;
  /** The favored team full name */
  pickTeamName: string;
  /** Opponent abbreviation */
  opponentAbbr: string;
  /** Edge score (positive = value, higher = better) */
  edge: number;
  /** Win probability for the pick side */
  winProb: number;
  /** Confidence tier derived from edge */
  tier: "S" | "A" | "B" | "C";
  /** Model-predicted spread (from pick side's perspective) */
  predictedSpread: number | null;
  /** Model-predicted total */
  predictedTotal: number | null;
  /** Book moneyline for the pick side */
  bookML: number | null;
  /** Book spread line */
  bookSpread: number | null;
  /** Book total line */
  bookTotal: number | null;
  /** Astro element for the pick team (Fire/Earth/Air/Water) */
  pickElement: string | null;
  /** Ruling planet for the pick team */
  pickRuler: string | null;
  /** Astro element for the opponent */
  opponentElement: string | null;
  /** Fair moneyline for the pick side */
  fairML: number | null;
  /** Status of the game */
  status: string;
}

function edgeToTier(edge: number): "S" | "A" | "B" | "C" {
  const abs = Math.abs(edge);
  if (abs >= 8) return "S";
  if (abs >= 5) return "A";
  if (abs >= 3) return "B";
  return "C";
}

const TIER_EMOJI: Record<string, string> = { S: "🔥", A: "⚡", B: "✨", C: "🌙" };

export function getTierEmoji(tier: string): string {
  return TIER_EMOJI[tier] || "🌙";
}

const ELEMENT_EMOJI: Record<string, string> = {
  Fire: "🔥",
  Earth: "🌍",
  Air: "💨",
  Water: "🌊",
};

export function getElementEmoji(element: string | null): string {
  if (!element) return "✦";
  return ELEMENT_EMOJI[element] || "✦";
}

export function useCosmicPicks(games: GameWithOdds[] | undefined, limit = 8) {
  const gameIds = (games || [])
    .filter((g) => g.status === "scheduled" || g.status === "live" || g.status === "in_progress")
    .map((g) => g.id);

  return useQuery({
    queryKey: ["cosmic-picks", gameIds.sort().join(","), limit],
    queryFn: async (): Promise<CosmicPick[]> => {
      if (!gameIds.length || !games?.length) return [];

      // Fetch predictions
      const { data: predictions } = await supabase
        .from("ce_game_predictions")
        .select(
          "game_id, sport, edge_home, edge_away, p_home_win, p_away_win, mu_spread_home, mu_total, fair_ml_home, fair_ml_away"
        )
        .in("game_id", gameIds)
        .order("run_ts", { ascending: false });

      if (!predictions?.length) return [];

      // Dedupe: keep only the latest prediction per game
      const predMap = new Map<string, (typeof predictions)[0]>();
      for (const p of predictions) {
        if (!predMap.has(p.game_id)) predMap.set(p.game_id, p);
      }

      // Fetch team_astro for all teams in today's games
      const allAbbrs = games.flatMap((g) => [g.home_abbr, g.away_abbr]).filter(Boolean);
      const uniqueAbbrs = [...new Set(allAbbrs)];

      const { data: astroData } = await supabase
        .from("team_astro")
        .select("team_abbr, element, ruling_planet")
        .in("team_abbr", uniqueAbbrs);

      const astroMap = new Map<string, { element: string | null; ruler: string | null }>();
      for (const a of astroData || []) {
        astroMap.set(a.team_abbr, { element: a.element, ruler: a.ruling_planet });
      }

      // Build picks
      const picks: CosmicPick[] = [];

      for (const game of games) {
        const pred = predMap.get(game.id);
        if (!pred) continue;

        const edgeHome = pred.edge_home ?? 0;
        const edgeAway = pred.edge_away ?? 0;
        const bestEdge = Math.abs(edgeHome) >= Math.abs(edgeAway) ? edgeHome : edgeAway;
        const pickSide: "home" | "away" = bestEdge === edgeHome ? "home" : "away";

        // Skip weak edges
        if (Math.abs(bestEdge) < 1.5) continue;

        const pickAbbr = pickSide === "home" ? game.home_abbr : game.away_abbr;
        const pickName = pickSide === "home" ? game.home_team : game.away_team;
        const oppAbbr = pickSide === "home" ? game.away_abbr : game.home_abbr;
        const winProb = pickSide === "home" ? (pred.p_home_win ?? 0.5) : (pred.p_away_win ?? 0.5);
        const bookML =
          pickSide === "home" ? game.odds.moneyline.home : game.odds.moneyline.away;
        const fairML =
          pickSide === "home" ? (pred.fair_ml_home ?? null) : (pred.fair_ml_away ?? null);

        const pickAstro = astroMap.get(pickAbbr ?? "");
        const oppAstro = astroMap.get(oppAbbr ?? "");

        picks.push({
          gameId: game.id,
          league: game.league,
          homeTeam: game.home_team ?? "",
          awayTeam: game.away_team ?? "",
          homeAbbr: game.home_abbr ?? "",
          awayAbbr: game.away_abbr ?? "",
          startTime: game.start_time ?? "",
          pickSide,
          pickTeam: pickAbbr ?? "",
          pickTeamName: pickName ?? "",
          opponentAbbr: oppAbbr ?? "",
          edge: bestEdge,
          winProb,
          tier: edgeToTier(bestEdge),
          predictedSpread: pred.mu_spread_home
            ? pickSide === "home"
              ? pred.mu_spread_home
              : -pred.mu_spread_home
            : null,
          predictedTotal: pred.mu_total,
          bookML,
          bookSpread: game.odds.spread.line,
          bookTotal: game.odds.total.line,
          pickElement: pickAstro?.element ?? null,
          pickRuler: pickAstro?.ruler ?? null,
          opponentElement: oppAstro?.element ?? null,
          fairML,
          status: game.status ?? "scheduled",
        });
      }

      // Sort by absolute edge descending
      picks.sort((a, b) => Math.abs(b.edge) - Math.abs(a.edge));

      return picks.slice(0, limit);
    },
    enabled: gameIds.length > 0,
    staleTime: 3 * 60 * 1000,
  });
}

/** Selects diversified parlay legs — one per league when possible, top edges */
export function useParlayPicks(games: GameWithOdds[] | undefined, legs = 4) {
  const { data: allPicks, isLoading } = useCosmicPicks(games, 20);

  const parlayLegs = (() => {
    if (!allPicks?.length) return [];

    // Ensure diversity: max 2 picks per league
    const byLeague = new Map<string, CosmicPick[]>();
    for (const p of allPicks) {
      const arr = byLeague.get(p.league) || [];
      arr.push(p);
      byLeague.set(p.league, arr);
    }

    const selected: CosmicPick[] = [];
    const usedLeagues = new Set<string>();

    // First pass: one pick per league (highest edge)
    for (const [league, picks] of byLeague.entries()) {
      if (selected.length >= legs) break;
      if (picks.length > 0 && picks[0].tier !== "C") {
        selected.push(picks[0]);
        usedLeagues.add(league);
      }
    }

    // Second pass: fill remaining slots from best remaining
    if (selected.length < legs) {
      const remaining = allPicks.filter(
        (p) => !selected.includes(p) && p.tier !== "C"
      );
      for (const p of remaining) {
        if (selected.length >= legs) break;
        selected.push(p);
      }
    }

    // Sort by edge descending
    selected.sort((a, b) => Math.abs(b.edge) - Math.abs(a.edge));
    return selected;
  })();

  // Calculate combined implied odds
  const combinedProb = parlayLegs.reduce((acc, p) => acc * p.winProb, 1);
  const combinedAmericanOdds =
    combinedProb > 0
      ? combinedProb >= 0.5
        ? Math.round(-100 * (combinedProb / (1 - combinedProb)))
        : Math.round((100 * (1 - combinedProb)) / combinedProb)
      : 0;

  return {
    legs: parlayLegs,
    combinedProb,
    combinedAmericanOdds,
    isLoading,
  };
}
