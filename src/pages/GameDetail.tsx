import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Star, MapPin, Orbit, Moon, Zap, Users } from "lucide-react";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import type { GameWithOdds } from "@/hooks/use-games";
import { SynastrySection } from "@/components/game/SynastrySection";
import { TransitModifiers } from "@/components/game/TransitModifiers";
import { PlayerPropsSection } from "@/components/game/PlayerPropsSection";
import { PeriodOddsSection } from "@/components/game/PeriodOddsSection";

function formatOdds(odds: number): string {
  if (!odds) return "—";
  return odds > 0 ? `+${odds}` : `${odds}`;
}

// ── Zodiac Utilities ──
const ZODIAC_DATA: Record<string, { symbol: string; element: string; quality: string; ruler: string; rulerSymbol: string }> = {
  Aries: { symbol: "♈", element: "Fire", quality: "Cardinal", ruler: "Mars", rulerSymbol: "♂" },
  Taurus: { symbol: "♉", element: "Earth", quality: "Fixed", ruler: "Venus", rulerSymbol: "♀" },
  Gemini: { symbol: "♊", element: "Air", quality: "Mutable", ruler: "Mercury", rulerSymbol: "☿" },
  Cancer: { symbol: "♋", element: "Water", quality: "Cardinal", ruler: "Moon", rulerSymbol: "☽" },
  Leo: { symbol: "♌", element: "Fire", quality: "Fixed", ruler: "Sun", rulerSymbol: "☉" },
  Virgo: { symbol: "♍", element: "Earth", quality: "Mutable", ruler: "Mercury", rulerSymbol: "☿" },
  Libra: { symbol: "♎", element: "Air", quality: "Cardinal", ruler: "Venus", rulerSymbol: "♀" },
  Scorpio: { symbol: "♏", element: "Water", quality: "Fixed", ruler: "Pluto", rulerSymbol: "♇" },
  Sagittarius: { symbol: "♐", element: "Fire", quality: "Mutable", ruler: "Jupiter", rulerSymbol: "♃" },
  Capricorn: { symbol: "♑", element: "Earth", quality: "Cardinal", ruler: "Saturn", rulerSymbol: "♄" },
  Aquarius: { symbol: "♒", element: "Air", quality: "Fixed", ruler: "Uranus", rulerSymbol: "♅" },
  Pisces: { symbol: "♓", element: "Water", quality: "Mutable", ruler: "Neptune", rulerSymbol: "♆" },
};

function getZodiacSign(date: Date): { sign: string; symbol: string } {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const signs = [
    { sign: "Capricorn", m1: 1, d1: 1, m2: 1, d2: 19 },
    { sign: "Aquarius", m1: 1, d1: 20, m2: 2, d2: 18 },
    { sign: "Pisces", m1: 2, d1: 19, m2: 3, d2: 20 },
    { sign: "Aries", m1: 3, d1: 21, m2: 4, d2: 19 },
    { sign: "Taurus", m1: 4, d1: 20, m2: 5, d2: 20 },
    { sign: "Gemini", m1: 5, d1: 21, m2: 6, d2: 20 },
    { sign: "Cancer", m1: 6, d1: 21, m2: 7, d2: 22 },
    { sign: "Leo", m1: 7, d1: 23, m2: 8, d2: 22 },
    { sign: "Virgo", m1: 8, d1: 23, m2: 9, d2: 22 },
    { sign: "Libra", m1: 9, d1: 23, m2: 10, d2: 22 },
    { sign: "Scorpio", m1: 10, d1: 23, m2: 11, d2: 21 },
    { sign: "Sagittarius", m1: 11, d1: 22, m2: 12, d2: 21 },
    { sign: "Capricorn", m1: 12, d1: 22, m2: 12, d2: 31 },
  ];
  for (const s of signs) {
    if ((month === s.m1 && day >= s.d1) || (month === s.m2 && day <= s.d2))
      return { sign: s.sign, symbol: ZODIAC_DATA[s.sign]?.symbol || "♑" };
  }
  return { sign: "Capricorn", symbol: "♑" };
}

function getZodiacFromDateStr(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  const z = getZodiacSign(d);
  return { ...z, ...ZODIAC_DATA[z.sign] };
}

// ── Element Compatibility ──
function getElementCompatibility(el1: string, el2: string): { rating: number; label: string; description: string } {
  const compat: Record<string, Record<string, { rating: number; label: string; description: string }>> = {
    Fire: {
      Fire: { rating: 80, label: "Dynamic Clash", description: "Two Fire teams ignite — explosive scoring, ego battles, high tempo" },
      Earth: { rating: 45, label: "Friction", description: "Fire's speed meets Earth's resistance — grinding game, frustration fouls" },
      Air: { rating: 90, label: "Synergy", description: "Air fans the flames — high-pace, three-pointers rain, transition offense" },
      Water: { rating: 55, label: "Steam", description: "Fire evaporates Water — emotional volatility, runs and counter-runs" },
    },
    Earth: {
      Fire: { rating: 45, label: "Friction", description: "Earth smothers Fire — slow pace benefits defensive teams" },
      Earth: { rating: 70, label: "Stalemate", description: "Two immovable forces — low-scoring, half-court battle, under likely" },
      Air: { rating: 50, label: "Erosion", description: "Air chips away at Earth — tempo variance creates betting edges" },
      Water: { rating: 85, label: "Fertile", description: "Water nourishes Earth — methodical growth, sets up a grinding finish" },
    },
    Air: {
      Fire: { rating: 90, label: "Synergy", description: "Air feeds Fire — expect fireworks, pace pushes over totals" },
      Earth: { rating: 50, label: "Erosion", description: "Air can't move Earth — ball movement stalls against set defense" },
      Air: { rating: 75, label: "Whirlwind", description: "Two Air teams = chaos — lead changes, turnovers, and wild momentum" },
      Water: { rating: 60, label: "Mist", description: "Air disturbs Water — confusion, miscommunication, turnover-heavy" },
    },
    Water: {
      Fire: { rating: 55, label: "Steam", description: "Water quenches Fire — expect emotional swings and crowd energy" },
      Earth: { rating: 85, label: "Fertile", description: "Water + Earth = patience pays — late-game execution wins" },
      Air: { rating: 60, label: "Mist", description: "Water + Air = unclear — foggy game flow, hard to predict" },
      Water: { rating: 75, label: "Tidal", description: "Two Water teams — deeply emotional, runs come in waves" },
    },
  };
  return compat[el1]?.[el2] || { rating: 50, label: "Neutral", description: "Standard matchup dynamics" };
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
  if (lng < -110) return "Pacific meridian: Jupiter MC lines cross this region — expect high-scoring, expansive games.";
  if (lng < -95) return "Mountain/Central corridor: Saturn IC lines create defensive battles — lower totals.";
  if (lng < -80) return "Central/Eastern transition: Mars lines activate — physical play and fouls run higher.";
  return "Eastern seaboard: Mercury DSC lines favor quick passing and transition offense.";
}

// ── Team zodiac assignment (based on founding/city energy — simplified) ──
const TEAM_ZODIAC: Record<string, string> = {
  ATL: "Sagittarius", BOS: "Aries", BKN: "Scorpio", CHA: "Virgo", CHI: "Taurus",
  CLE: "Capricorn", DAL: "Leo", DEN: "Aquarius", DET: "Capricorn", GSW: "Gemini",
  HOU: "Sagittarius", IND: "Cancer", LAC: "Libra", LAL: "Leo", MEM: "Scorpio",
  MIA: "Leo", MIL: "Taurus", MIN: "Aquarius", NOP: "Pisces", NYK: "Cancer",
  OKC: "Aries", ORL: "Pisces", PHI: "Capricorn", PHX: "Aries", POR: "Aquarius",
  SAC: "Sagittarius", SAS: "Virgo", TOR: "Scorpio", UTA: "Capricorn", WAS: "Libra",
};

const GameDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data: game, isLoading } = useQuery({
    queryKey: ["game", id],
    queryFn: async (): Promise<(GameWithOdds & { venue_lat?: number | null; venue_lng?: number | null }) | null> => {
      const { data, error } = await supabase.from("games").select("*").eq("id", id!).maybeSingle();
      if (error || !data) return null;
      const { data: odds } = await supabase.from("odds_snapshots").select("*").eq("game_id", data.id).order("captured_at", { ascending: false });
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

  // Fetch players for both teams
  const { data: players } = useQuery({
    queryKey: ["game-players", game?.home_abbr, game?.away_abbr],
    queryFn: async () => {
      if (!game) return [];
      const { data } = await supabase
        .from("players")
        .select("id, name, position, team, birth_date")
        .in("team", [game.home_abbr, game.away_abbr])
        .not("birth_date", "is", null)
        .limit(20);
      return data || [];
    },
    enabled: !!game,
  });

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

  const zodiac = getZodiacSign(new Date());
  const awayZodiacSign = TEAM_ZODIAC[game.away_abbr] || "Aries";
  const homeZodiacSign = TEAM_ZODIAC[game.home_abbr] || "Aries";
  const awayZodiac = ZODIAC_DATA[awayZodiacSign];
  const homeZodiac = ZODIAC_DATA[homeZodiacSign];
  const elementCompat = awayZodiac && homeZodiac ? getElementCompatibility(awayZodiac.element, homeZodiac.element) : null;

  // Group players by team
  const awayPlayers = players?.filter(p => p.team === game.away_abbr) || [];
  const homePlayers = players?.filter(p => p.team === game.home_abbr) || [];

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
          <button onClick={() => navigate(`/team/${game.away_abbr}`)} className="text-center flex-1 hover:opacity-80 transition-opacity">
            <p className="text-2xl font-bold font-display">{game.away_abbr}</p>
            <p className="text-xs text-muted-foreground mt-1">{game.away_team}</p>
            {game.away_score !== null && (
              <p className="text-3xl font-bold font-display mt-2 tabular-nums">{game.away_score}</p>
            )}
          </button>
          <div className="px-4">
            <span className="text-xs font-bold text-muted-foreground">VS</span>
          </div>
          <button onClick={() => navigate(`/team/${game.home_abbr}`)} className="text-center flex-1 hover:opacity-80 transition-opacity">
            <p className="text-2xl font-bold font-display">{game.home_abbr}</p>
            <p className="text-xs text-muted-foreground mt-1">{game.home_team}</p>
            {game.home_score !== null && (
              <p className="text-3xl font-bold font-display mt-2 tabular-nums">{game.home_score}</p>
            )}
          </button>
        </div>

        {game.venue && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground justify-center">
            <MapPin className="h-3 w-3" />
            <span>{game.venue}</span>
          </div>
        )}
      </header>

      <div className="px-4 py-4 space-y-4">
        {/* Team Zodiac Compatibility */}
        {awayZodiac && homeZodiac && elementCompat && (
          <section>
            <h3 className="text-xs font-semibold text-primary uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5" />
              Zodiac Matchup
            </h3>
            <div className="celestial-gradient rounded-xl p-4">
              {/* Team signs */}
              <div className="flex items-center justify-between mb-3">
                <div className="text-center flex-1">
                  <span className="text-2xl">{awayZodiac.symbol}</span>
                  <p className="text-xs font-semibold text-foreground mt-1">{awayZodiacSign}</p>
                  <p className="text-[10px] text-muted-foreground">{awayZodiac.element} · {awayZodiac.quality}</p>
                  <p className="text-[10px] text-cosmic-indigo">{awayZodiac.rulerSymbol} {awayZodiac.ruler}</p>
                </div>
                <div className="text-center px-3">
                  <div className={cn(
                    "text-lg font-bold font-display",
                    elementCompat.rating >= 80 ? "text-cosmic-green" : elementCompat.rating >= 60 ? "text-cosmic-gold" : "text-cosmic-red"
                  )}>
                    {elementCompat.rating}%
                  </div>
                  <p className="text-[10px] font-semibold text-foreground">{elementCompat.label}</p>
                </div>
                <div className="text-center flex-1">
                  <span className="text-2xl">{homeZodiac.symbol}</span>
                  <p className="text-xs font-semibold text-foreground mt-1">{homeZodiacSign}</p>
                  <p className="text-[10px] text-muted-foreground">{homeZodiac.element} · {homeZodiac.quality}</p>
                  <p className="text-[10px] text-cosmic-indigo">{homeZodiac.rulerSymbol} {homeZodiac.ruler}</p>
                </div>
              </div>
              {/* Compatibility bar */}
              <div className="h-2 bg-border rounded-full overflow-hidden mb-2">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    elementCompat.rating >= 80 ? "bg-cosmic-green" : elementCompat.rating >= 60 ? "bg-cosmic-gold" : "bg-cosmic-red"
                  )}
                  style={{ width: `${elementCompat.rating}%` }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground italic leading-relaxed">
                ✦ {elementCompat.description}
              </p>
            </div>
          </section>
        )}

        {/* Celestial Insights */}
        <section className="space-y-3">
          <h3 className="text-xs font-semibold text-primary uppercase tracking-widest flex items-center gap-1.5">
            <Star className="h-3.5 w-3.5" />
            Celestial Insights
          </h3>

          <div className="cosmic-card rounded-xl p-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Moon className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground mb-1">Horary Reading</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{getHoraryInsight(game)}</p>
              </div>
            </div>
          </div>

          <div className="cosmic-card rounded-xl p-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-accent/10">
                <Orbit className="h-4 w-4 text-accent" />
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground mb-1">Astrocartography</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{getAstroCartographyNote(game.venue_lat ?? null, game.venue_lng ?? null)}</p>
              </div>
            </div>
          </div>

          <div className="celestial-gradient rounded-xl p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">{zodiac.symbol}</span>
              <p className="text-xs font-medium text-foreground">Sun in {zodiac.sign}</p>
            </div>
            <p className="text-[10px] text-muted-foreground">Current Season</p>
          </div>
        </section>

        {/* Player Zodiac Compatibility Grid */}
        {(awayPlayers.length > 0 || homePlayers.length > 0) && (
          <section>
            <h3 className="text-xs font-semibold text-primary uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              Player Zodiac Map
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {/* Away team */}
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">{game.away_abbr}</p>
                <div className="space-y-1.5">
                  {awayPlayers.slice(0, 8).map((p) => {
                    const pz = p.birth_date ? getZodiacFromDateStr(p.birth_date) : null;
                    return (
                      <button
                        key={p.id}
                        onClick={() => navigate(`/player/${p.id}`)}
                        className="w-full cosmic-card rounded-lg p-2 flex items-start gap-2 text-left hover:border-primary/30 transition-colors"
                      >
                        {pz && <span className="text-sm mt-0.5">{pz.symbol}</span>}
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-medium text-foreground truncate">{p.name}</p>
                          <p className="text-[9px] text-muted-foreground">{pz?.sign} · {pz?.element}</p>
                          <TransitModifiers player={p} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
              {/* Home team */}
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">{game.home_abbr}</p>
                <div className="space-y-1.5">
                  {homePlayers.slice(0, 8).map((p) => {
                    const pz = p.birth_date ? getZodiacFromDateStr(p.birth_date) : null;
                    return (
                      <button
                        key={p.id}
                        onClick={() => navigate(`/player/${p.id}`)}
                        className="w-full cosmic-card rounded-lg p-2 flex items-start gap-2 text-left hover:border-primary/30 transition-colors"
                      >
                        {pz && <span className="text-sm mt-0.5">{pz.symbol}</span>}
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-medium text-foreground truncate">{p.name}</p>
                          <p className="text-[9px] text-muted-foreground">{pz?.sign} · {pz?.element}</p>
                          <TransitModifiers player={p} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Synastry · Key Matchups */}
        {awayPlayers.length > 0 && homePlayers.length > 0 && (
          <SynastrySection
            awayPlayers={awayPlayers}
            homePlayers={homePlayers}
            awayAbbr={game.away_abbr}
            homeAbbr={game.home_abbr}
          />
        )}

        {/* Player Props */}
        <PlayerPropsSection gameId={game.id} />

        {/* Period Markets */}
        <PeriodOddsSection gameId={game.id} league={game.league} />

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
