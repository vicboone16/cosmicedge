import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Star, MapPin, Orbit, Moon } from "lucide-react";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { GameWithOdds } from "@/hooks/use-games";

function formatOdds(odds: number): string {
  if (!odds) return "—";
  return odds > 0 ? `+${odds}` : `${odds}`;
}

// Simple zodiac sign from date
function getZodiacSign(date: Date): { sign: string; symbol: string } {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const signs = [
    { sign: "Capricorn", symbol: "♑", start: [1, 1], end: [1, 19] },
    { sign: "Aquarius", symbol: "♒", start: [1, 20], end: [2, 18] },
    { sign: "Pisces", symbol: "♓", start: [2, 19], end: [3, 20] },
    { sign: "Aries", symbol: "♈", start: [3, 21], end: [4, 19] },
    { sign: "Taurus", symbol: "♉", start: [4, 20], end: [5, 20] },
    { sign: "Gemini", symbol: "♊", start: [5, 21], end: [6, 20] },
    { sign: "Cancer", symbol: "♋", start: [6, 21], end: [7, 22] },
    { sign: "Leo", symbol: "♌", start: [7, 23], end: [8, 22] },
    { sign: "Virgo", symbol: "♍", start: [8, 23], end: [9, 22] },
    { sign: "Libra", symbol: "♎", start: [9, 23], end: [10, 22] },
    { sign: "Scorpio", symbol: "♏", start: [10, 23], end: [11, 21] },
    { sign: "Sagittarius", symbol: "♐", start: [11, 22], end: [12, 21] },
    { sign: "Capricorn", symbol: "♑", start: [12, 22], end: [12, 31] },
  ];
  for (const s of signs) {
    if (
      (month === s.start[0] && day >= s.start[1]) ||
      (month === s.end[0] && day <= s.end[1])
    )
      return { sign: s.sign, symbol: s.symbol };
  }
  return { sign: "Capricorn", symbol: "♑" };
}

function getHoraryInsight(game: GameWithOdds): string {
  const hour = new Date(game.start_time).getHours();
  if (hour < 14) return "Tip-off during a day chart — Sun-ruled hours favor bold, high-energy plays. Look for dominant first-half performances.";
  if (hour < 18) return "Afternoon start under Venus hours — expect finesse, accurate shooting, and smooth ball movement to prevail.";
  if (hour < 21) return "Evening tip in Mars hours — aggressive defense, fast breaks, and physicality will shape the outcome.";
  return "Late-night game under Saturn's influence — discipline, structure, and veteran experience hold the edge.";
}

function getAstroCartographyNote(venueLat: number | null, venueLng: number | null): string {
  if (!venueLat || !venueLng) return "Venue coordinates unavailable for astrocartography analysis.";
  
  const lng = venueLng;
  if (lng < -110) return "Pacific meridian: Jupiter MC lines cross this region — expect high-scoring, expansive games with momentum swings.";
  if (lng < -95) return "Mountain/Central corridor: Saturn IC lines create defensive battles — lower totals and grind-it-out basketball.";
  if (lng < -80) return "Central/Eastern transition: Mars lines activate here — physical play, fouls, and turnovers run higher than average.";
  return "Eastern seaboard: Mercury DSC lines favor quick passing, transition offense, and guards who can create.";
}

const GameDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data: game, isLoading } = useQuery({
    queryKey: ["game", id],
    queryFn: async (): Promise<(GameWithOdds & { venue_lat?: number | null; venue_lng?: number | null }) | null> => {
      const { data, error } = await supabase
        .from("games")
        .select("*")
        .eq("id", id!)
        .maybeSingle();

      if (error || !data) return null;

      const { data: odds } = await supabase
        .from("odds_snapshots")
        .select("*")
        .eq("game_id", data.id)
        .order("captured_at", { ascending: false });

      const ml = odds?.find((o) => o.market_type === "moneyline");
      const spread = odds?.find((o) => o.market_type === "spread");
      const total = odds?.find((o) => o.market_type === "total");

      return {
        ...data,
        odds: {
          moneyline: { home: ml?.home_price || 0, away: ml?.away_price || 0 },
          spread: { home: spread?.home_price || -110, away: spread?.away_price || -110, line: spread?.line || 0 },
          total: { over: total?.home_price || -110, under: total?.away_price || -110, line: total?.line || 0 },
        },
      };
    },
    enabled: !!id,
  });

  const zodiac = getZodiacSign(new Date());

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading game...</p>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Game not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="px-4 pt-12 pb-4 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          <span className="text-sm">Back</span>
        </button>

        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-primary uppercase tracking-wider">{game.league}</span>
          <span className="text-xs text-muted-foreground">
            {format(new Date(game.start_time), "h:mm a")}
          </span>
        </div>

        <div className="flex items-center justify-between py-4">
          <div className="text-center flex-1">
            <p className="text-2xl font-bold font-display">{game.away_abbr}</p>
            <p className="text-xs text-muted-foreground mt-1">{game.away_team}</p>
            {game.away_score !== null && (
              <p className="text-3xl font-bold font-display mt-2 tabular-nums">{game.away_score}</p>
            )}
          </div>
          <div className="px-4">
            <span className="text-xs font-bold text-muted-foreground">VS</span>
          </div>
          <div className="text-center flex-1">
            <p className="text-2xl font-bold font-display">{game.home_abbr}</p>
            <p className="text-xs text-muted-foreground mt-1">{game.home_team}</p>
            {game.home_score !== null && (
              <p className="text-3xl font-bold font-display mt-2 tabular-nums">{game.home_score}</p>
            )}
          </div>
        </div>

        {/* Venue */}
        {game.venue && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground justify-center">
            <MapPin className="h-3 w-3" />
            <span>{game.venue}</span>
          </div>
        )}
      </header>

      <div className="px-4 py-4 space-y-4">
        {/* Astro Insights Section */}
        <section className="space-y-3">
          <h3 className="text-xs font-semibold text-primary uppercase tracking-widest flex items-center gap-1.5">
            <Star className="h-3.5 w-3.5" />
            Celestial Insights
          </h3>

          {/* Horary */}
          <div className="cosmic-card rounded-xl p-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Moon className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground mb-1">Horary Reading</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {getHoraryInsight(game)}
                </p>
              </div>
            </div>
          </div>

          {/* Astrocartography */}
          <div className="cosmic-card rounded-xl p-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-accent/10">
                <Orbit className="h-4 w-4 text-accent" />
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground mb-1">Astrocartography</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {getAstroCartographyNote(game.venue_lat ?? null, game.venue_lng ?? null)}
                </p>
              </div>
            </div>
          </div>

          {/* Sun Sign Banner */}
          <div className="celestial-gradient rounded-xl p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">{zodiac.symbol}</span>
              <p className="text-xs font-medium text-foreground">Sun in {zodiac.sign}</p>
            </div>
            <p className="text-[10px] text-muted-foreground">Current Season</p>
          </div>
        </section>

        {/* Markets */}
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Markets</h3>

          <div className="grid grid-cols-3 gap-3">
            <div className="cosmic-card rounded-xl p-3 text-center">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Moneyline</span>
              <div className="mt-2 space-y-1">
                <p className="text-sm font-semibold tabular-nums">{formatOdds(game.odds.moneyline.away)}</p>
                <p className="text-sm font-semibold tabular-nums">{formatOdds(game.odds.moneyline.home)}</p>
              </div>
            </div>

            <div className="cosmic-card rounded-xl p-3 text-center">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Spread</span>
              <div className="mt-2 space-y-1">
                <p className="text-sm font-semibold tabular-nums">{game.odds.spread.line ? `${game.odds.spread.line > 0 ? "+" : ""}${-game.odds.spread.line}` : "—"}</p>
                <p className="text-sm font-semibold tabular-nums">{game.odds.spread.line ? `${game.odds.spread.line > 0 ? "" : "+"}${game.odds.spread.line}` : "—"}</p>
              </div>
            </div>

            <div className="cosmic-card rounded-xl p-3 text-center">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Total</span>
              <div className="mt-2 space-y-1">
                <p className="text-sm font-semibold tabular-nums">{game.odds.total.line ? `O ${game.odds.total.line}` : "—"}</p>
                <p className="text-sm font-semibold tabular-nums">{game.odds.total.line ? `U ${game.odds.total.line}` : "—"}</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default GameDetail;
