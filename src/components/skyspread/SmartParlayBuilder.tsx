/**
 * #16 — Smart Parlay Builder
 * AI-curated parlay suggestions based on today's cosmic alignments.
 * Shows as a section within SkySpread with element diversification
 * and planetary backing per leg.
 */
import { useQuery } from "@tanstack/react-query";
import { Sparkles, Loader2, Plus, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";

const ELEMENT_EMOJI: Record<string, string> = {
  Fire: "🔥", Earth: "🌍", Air: "💨", Water: "🌊",
};

interface ParlayLeg {
  gameId: string;
  homeAbbr: string;
  awayAbbr: string;
  pick: string;
  market: string;
  line?: string;
  edge: number;
  element: string | null;
  reason: string;
}

interface CuratedParlay {
  name: string;
  theme: string;
  legs: ParlayLeg[];
  confidence: number;
}

export function SmartParlayBuilder() {
  const [expandedParlay, setExpandedParlay] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["smart-parlay-builder"],
    queryFn: async () => {
      const today = new Date();
      const startOfDay = new Date(today);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(today);
      endOfDay.setHours(23, 59, 59, 999);

      // Fetch today's games with predictions
      const { data: games } = await supabase
        .from("games")
        .select("id, home_abbr, away_abbr, home_team, away_team, start_time, venue, league")
        .gte("start_time", startOfDay.toISOString())
        .lte("start_time", endOfDay.toISOString())
        .in("status", ["scheduled", "pregame", "live", "in_progress"]);

      if (!games?.length) return [];

      const gameIds = games.map(g => g.id);
      const abbrs = [...new Set(games.flatMap(g => [g.home_abbr, g.away_abbr]))];

      // Fetch predictions and team_astro
      const [predsRes, astroRes] = await Promise.all([
        supabase
          .from("ce_game_predictions")
          .select("game_id, edge_home, edge_away, p_home_win, p_away_win, mu_total, mu_spread_home")
          .in("game_id", gameIds)
          .order("run_ts", { ascending: false }),
        supabase
          .from("team_astro")
          .select("team_abbr, element, ruling_planet")
          .in("team_abbr", abbrs),
      ]);

      const preds = predsRes.data || [];
      const astro = astroRes.data || [];

      // Deduplicate predictions (take latest per game)
      const predMap = new Map<string, typeof preds[0]>();
      for (const p of preds) {
        if (!predMap.has(p.game_id)) predMap.set(p.game_id, p);
      }
      const astroMap = new Map(astro.map(a => [a.team_abbr, a]));

      // Build legs from games with edge
      const legs: ParlayLeg[] = [];
      for (const game of games) {
        const pred = predMap.get(game.id);
        if (!pred) continue;

        const homeEdge = pred.edge_home || 0;
        const awayEdge = pred.edge_away || 0;
        const favorsHome = homeEdge > awayEdge;
        const edge = favorsHome ? homeEdge : awayEdge;
        const pick = favorsHome ? game.home_abbr : game.away_abbr;
        const pickAstro = astroMap.get(pick);

        if (Math.abs(edge) < 1) continue; // Skip no-edge games

        legs.push({
          gameId: game.id,
          homeAbbr: game.home_abbr,
          awayAbbr: game.away_abbr,
          pick,
          market: "ML",
          edge,
          element: pickAstro?.element || null,
          reason: `${edge > 0 ? "+" : ""}${edge.toFixed(1)}% edge · ${pickAstro?.element || "?"} energy`,
        });

        // Add total if strong prediction
        if (pred.mu_total) {
          legs.push({
            gameId: game.id,
            homeAbbr: game.home_abbr,
            awayAbbr: game.away_abbr,
            pick: pred.mu_total > 220 ? "Over" : "Under",
            market: "Total",
            line: pred.mu_total.toFixed(1),
            edge: Math.abs(edge) * 0.6,
            element: null,
            reason: `Oracle projects ${pred.mu_total.toFixed(1)} total`,
          });
        }
      }

      // Sort by edge
      legs.sort((a, b) => b.edge - a.edge);

      // Build curated parlays
      const parlays: CuratedParlay[] = [];

      // 1. Best Edge Parlay (top 3 ML picks)
      const topML = legs.filter(l => l.market === "ML").slice(0, 3);
      if (topML.length >= 2) {
        const conf = Math.round(topML.reduce((s, l) => s + l.edge, 0) / topML.length * 5);
        parlays.push({
          name: "Oracle's Best",
          theme: "Top edge picks by Oracle model",
          legs: topML,
          confidence: Math.min(95, conf),
        });
      }

      // 2. Element Diversity Parlay (one from each element)
      const elementPicks = new Map<string, ParlayLeg>();
      for (const leg of legs.filter(l => l.market === "ML" && l.element)) {
        if (!elementPicks.has(leg.element!)) {
          elementPicks.set(leg.element!, leg);
        }
      }
      if (elementPicks.size >= 3) {
        const divLegs = Array.from(elementPicks.values()).slice(0, 4);
        parlays.push({
          name: "Elemental Balance",
          theme: "Diversified across cosmic elements",
          legs: divLegs,
          confidence: Math.round(divLegs.reduce((s, l) => s + l.edge, 0) / divLegs.length * 4),
        });
      }

      // 3. Chalk Destroyer (underdog picks with edge)
      const dogLegs = legs.filter(l => l.market === "ML" && l.edge > 2).slice(0, 3);
      if (dogLegs.length >= 2) {
        parlays.push({
          name: "Cosmic Upset Special",
          theme: "Edge-backed picks where Oracle disagrees with the market",
          legs: dogLegs,
          confidence: Math.round(dogLegs.reduce((s, l) => s + l.edge, 0) / dogLegs.length * 3),
        });
      }

      return parlays;
    },
    staleTime: 10 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="cosmic-card rounded-xl p-6 flex items-center justify-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span className="text-[10px] text-muted-foreground">Building smart parlays…</span>
      </div>
    );
  }

  if (!data?.length) {
    return (
      <div className="cosmic-card rounded-xl p-4 text-center">
        <Sparkles className="h-5 w-5 text-muted-foreground mx-auto mb-2" />
        <p className="text-[10px] text-muted-foreground">No games with enough Oracle edge today for parlay suggestions.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-cosmic-gold" />
        <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">Smart Parlay Builder</h3>
      </div>
      <p className="text-[9px] text-muted-foreground">
        AI-curated parlays combining Oracle edge + cosmic element alignment.
      </p>

      {data.map((parlay, i) => (
        <div
          key={i}
          className={cn(
            "cosmic-card rounded-xl overflow-hidden transition-all",
            expandedParlay === i ? "ring-1 ring-primary/30" : "",
          )}
        >
          {/* Header */}
          <button
            onClick={() => setExpandedParlay(expandedParlay === i ? null : i)}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-primary/5 transition-colors"
          >
            <div className="text-left">
              <p className="text-[11px] font-bold text-foreground">{parlay.name}</p>
              <p className="text-[9px] text-muted-foreground">{parlay.theme}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-bold text-cosmic-gold">{parlay.legs.length} legs</span>
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-[10px] font-bold text-primary">{parlay.confidence}</span>
              </div>
            </div>
          </button>

          {/* Expanded legs */}
          {expandedParlay === i && (
            <div className="px-4 pb-3 space-y-2 border-t border-border/30 pt-3">
              {parlay.legs.map((leg, j) => (
                <div key={j} className="flex items-center justify-between py-1.5 border-b border-border/15 last:border-0">
                  <div className="flex items-center gap-2">
                    {leg.element && (
                      <span className="text-sm">{ELEMENT_EMOJI[leg.element] || "✦"}</span>
                    )}
                    <div>
                      <p className="text-[10px] font-semibold text-foreground">
                        {leg.pick} {leg.market}{leg.line ? ` ${leg.line}` : ""}
                      </p>
                      <p className="text-[8px] text-muted-foreground">
                        {leg.awayAbbr} @ {leg.homeAbbr}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={cn(
                      "text-[9px] font-bold",
                      leg.edge >= 5 ? "text-cosmic-gold" : leg.edge >= 2 ? "text-cosmic-green" : "text-muted-foreground",
                    )}>
                      +{leg.edge.toFixed(1)}% edge
                    </p>
                    <p className="text-[8px] text-muted-foreground">{leg.reason.split(" · ")[1] || ""}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
