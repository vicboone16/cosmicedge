import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Star, MapPin, Orbit, Moon, Zap, Users, ChevronDown, ChevronUp, TrendingUp, TrendingDown, BarChart3, Lightbulb, Swords } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import type { GameWithOdds } from "@/hooks/use-games";
import { useTimezone } from "@/hooks/use-timezone";
import { getPlanetaryHourAt } from "@/lib/planetary-hours";
import { SynastrySection } from "@/components/game/SynastrySection";
import { TransitModifiers } from "@/components/game/TransitModifiers";
import { PlayerPropsSection } from "@/components/game/PlayerPropsSection";
import { PeriodOddsSection } from "@/components/game/PeriodOddsSection";
import { HoraryChartSection } from "@/components/game/HoraryChartSection";
import { TransitScrubber } from "@/components/game/TransitScrubber";
import { GameChartRulers } from "@/components/game/GameChartRulers";
import { GameMatchupTab } from "@/components/game/GameMatchupTab";
import { TrackedPropsWidget } from "@/components/tracking/TrackedProps";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

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

const TEAM_ZODIAC: Record<string, string> = {
  ATL: "Sagittarius", BOS: "Aries", BKN: "Scorpio", CHA: "Virgo", CHI: "Taurus",
  CLE: "Capricorn", DAL: "Leo", DEN: "Aquarius", DET: "Capricorn", GSW: "Gemini",
  HOU: "Sagittarius", IND: "Cancer", LAC: "Libra", LAL: "Leo", MEM: "Scorpio",
  MIA: "Leo", MIL: "Taurus", MIN: "Aquarius", NOP: "Pisces", NYK: "Cancer",
  OKC: "Aries", ORL: "Pisces", PHI: "Capricorn", PHX: "Aries", POR: "Aquarius",
  SAC: "Sagittarius", SAS: "Virgo", TOR: "Scorpio", UTA: "Capricorn", WAS: "Libra",
};

// ── Expandable Player Card ──
function PlayerCard({
  player,
  gameId,
  navigate,
}: {
  player: { id: string; name: string; position: string | null; team: string | null; birth_date: string | null; league: string | null };
  gameId: string;
  navigate: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const pz = player.birth_date ? getZodiacFromDateStr(player.birth_date) : null;

  // Fetch last 5 game stats when expanded
  const { data: recentStats } = useQuery({
    queryKey: ["player-recent-stats", player.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("player_game_stats")
        .select("points, rebounds, assists, steals, blocks, minutes, game_id")
        .eq("player_id", player.id)
        .order("created_at", { ascending: false })
        .limit(5);
      return data || [];
    },
    enabled: expanded,
  });

  // Fetch player props for this game when expanded
  const { data: playerProps } = useQuery({
    queryKey: ["player-props-card", player.name, gameId],
    queryFn: async () => {
      const { data } = await supabase
        .from("player_props")
        .select("market_key, market_label, line, over_price, under_price")
        .eq("game_id", gameId)
        .eq("player_name", player.name)
        .limit(10);
      return data || [];
    },
    enabled: expanded,
  });

  const avgPts = recentStats && recentStats.length > 0
    ? (recentStats.reduce((s, r) => s + (r.points || 0), 0) / recentStats.length).toFixed(1)
    : null;

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <CollapsibleTrigger asChild>
        <button className="w-full cosmic-card rounded-lg p-2 flex items-start gap-2 text-left hover:border-primary/30 transition-colors">
          {pz && <span className="text-sm mt-0.5">{pz.symbol}</span>}
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-medium text-foreground truncate">{player.name}</p>
            <div className="flex items-center gap-1">
              <p className="text-[9px] text-muted-foreground">{pz?.sign} · {pz?.element}</p>
              {player.position && <span className="text-[9px] text-primary/70">· {player.position}</span>}
            </div>
            {player.birth_date && (
              <p className="text-[8px] text-muted-foreground/60">🎂 {player.birth_date}</p>
            )}
            <TransitModifiers player={player} />
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </div>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="cosmic-card rounded-b-lg border-t-0 -mt-1 p-2 space-y-2">
          {/* Last 5 games */}
          {recentStats && recentStats.length > 0 && (
            <div>
              <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Last {recentStats.length} Games</p>
              <div className="grid grid-cols-5 gap-1 text-center">
                <div className="text-[8px] text-muted-foreground">PTS</div>
                <div className="text-[8px] text-muted-foreground">REB</div>
                <div className="text-[8px] text-muted-foreground">AST</div>
                <div className="text-[8px] text-muted-foreground">STL</div>
                <div className="text-[8px] text-muted-foreground">BLK</div>
                {recentStats.map((s, i) => (
                  <div key={i} className="contents">
                    <div className="text-[9px] font-medium tabular-nums">{s.points ?? 0}</div>
                    <div className="text-[9px] font-medium tabular-nums">{s.rebounds ?? 0}</div>
                    <div className="text-[9px] font-medium tabular-nums">{s.assists ?? 0}</div>
                    <div className="text-[9px] font-medium tabular-nums">{s.steals ?? 0}</div>
                    <div className="text-[9px] font-medium tabular-nums">{s.blocks ?? 0}</div>
                  </div>
                ))}
              </div>
              {avgPts && (
                <p className="text-[8px] text-muted-foreground mt-1">Avg: {avgPts} PTS</p>
              )}
            </div>
          )}

          {/* Player Props for this game */}
          {playerProps && playerProps.length > 0 && (
            <div>
              <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Props</p>
              <div className="space-y-1">
                {playerProps.map((pp, i) => {
                  const avg = avgPts ? parseFloat(avgPts) : null;
                  const isPointsProp = pp.market_key?.includes("points");
                  const highLow = isPointsProp && avg && pp.line
                    ? avg > Number(pp.line) ? "HIGH" : "LOW"
                    : null;

                  return (
                    <div key={i} className="flex items-center justify-between text-[9px]">
                      <span className="text-muted-foreground truncate max-w-[60px]">
                        {pp.market_label || pp.market_key?.replace("player_", "").replace(/_/g, " ")}
                      </span>
                      <span className="font-bold tabular-nums">{pp.line != null ? Number(pp.line) : "—"}</span>
                      <div className="flex items-center gap-1.5">
                        {pp.over_price != null && (
                          <span className="text-cosmic-green flex items-center gap-0.5">
                            <TrendingUp className="h-2 w-2" />
                            {pp.over_price > 0 ? "+" : ""}{pp.over_price}
                          </span>
                        )}
                        {pp.under_price != null && (
                          <span className="text-cosmic-red flex items-center gap-0.5">
                            <TrendingDown className="h-2 w-2" />
                            {pp.under_price > 0 ? "+" : ""}{pp.under_price}
                          </span>
                        )}
                        {highLow && (
                          <span className={cn(
                            "px-1 py-0.5 rounded text-[7px] font-bold",
                            highLow === "HIGH" ? "bg-cosmic-green/20 text-cosmic-green" : "bg-cosmic-red/20 text-cosmic-red"
                          )}>
                            {highLow}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Astro info summary */}
          {pz && (
            <div className="flex items-center gap-2 text-[8px] text-muted-foreground">
              <span>{pz.symbol} {pz.sign}</span>
              <span>·</span>
              <span>{pz.element} {pz.quality}</span>
              <span>·</span>
              <span>Ruler: {pz.rulerSymbol} {pz.ruler}</span>
            </div>
          )}

          <button
            onClick={(e) => { e.stopPropagation(); navigate(`/player/${player.id}`); }}
            className="text-[9px] text-primary hover:underline"
          >
            View full profile →
          </button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

const GameDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { formatInUserTZ, getTZAbbrev } = useTimezone();
  const [activeTab, setActiveTab] = useState<"odds" | "insights" | "matchup">("odds");
  const [gameSubTab, setGameSubTab] = useState<"gamelines" | "player_props" | "team_props" | "game_props">("gamelines");

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

  // Fetch players for both teams - league-filtered
  const { data: players } = useQuery({
    queryKey: ["game-players", game?.home_abbr, game?.away_abbr, game?.league],
    queryFn: async () => {
      if (!game) return [];
      const { data } = await supabase
        .from("players")
        .select("id, name, position, team, birth_date, league")
        .in("team", [game.home_abbr, game.away_abbr])
        .eq("league", game.league)
        .limit(50);
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
  const gameStartPH = getPlanetaryHourAt(new Date(game.start_time), game.venue_lat ?? 40.7);

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
            {formatInUserTZ(game.start_time)} {getTZAbbrev()}
            {gameStartPH && <span className="ml-1 text-cosmic-indigo">{gameStartPH.symbol} {gameStartPH.planet}</span>}
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
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground justify-center mb-3">
            <MapPin className="h-3 w-3" />
            <span>{game.venue}</span>
          </div>
        )}

        {/* Top tabs: Odds / Insights / Matchup */}
        <div className="flex gap-2 justify-center">
          {([
            { val: "odds" as const, icon: BarChart3, label: "Odds" },
            { val: "insights" as const, icon: Lightbulb, label: "Insights" },
            { val: "matchup" as const, icon: Swords, label: "Matchup" },
          ]).map(t => (
            <button
              key={t.val}
              onClick={() => setActiveTab(t.val)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold transition-colors border",
                activeTab === t.val
                  ? "bg-secondary border-border text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <div className="px-4 py-4 space-y-4">
        {/* Tracked Props */}
        <TrackedPropsWidget />

        {activeTab === "odds" && (
          <>
            {/* Sub-tabs for odds */}
            <div className="flex gap-3 overflow-x-auto no-scrollbar">
              {([
                { val: "gamelines" as const, label: "Gamelines" },
                { val: "player_props" as const, label: "Player props" },
                { val: "team_props" as const, label: "Team props" },
                { val: "game_props" as const, label: "Game props" },
              ]).map(t => (
                <button
                  key={t.val}
                  onClick={() => setGameSubTab(t.val)}
                  className={cn(
                    "text-sm font-semibold whitespace-nowrap transition-colors pb-1 border-b-2",
                    gameSubTab === t.val
                      ? "text-foreground border-foreground"
                      : "text-muted-foreground border-transparent hover:text-foreground"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {gameSubTab === "gamelines" && (
              <>
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

                {/* Period Markets */}
                <PeriodOddsSection gameId={game.id} league={game.league} />
              </>
            )}

            {gameSubTab === "player_props" && (
              <PlayerPropsSection gameId={game.id} />
            )}

            {(gameSubTab === "team_props" || gameSubTab === "game_props") && (
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground">Coming soon</p>
              </div>
            )}
          </>
        )}

        {activeTab === "insights" && (
          <>
            {/* Zodiac Matchup */}
            {awayZodiac && homeZodiac && elementCompat && (
              <section>
                <h3 className="text-xs font-semibold text-primary uppercase tracking-widest mb-3 flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5" />
                  Zodiac Matchup
                </h3>
                <div className="celestial-gradient rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-center flex-1">
                      <span className="text-2xl">{awayZodiac.symbol}</span>
                      <p className="text-xs font-semibold text-foreground mt-1">{awayZodiacSign}</p>
                      <p className="text-[10px] text-muted-foreground">{awayZodiac.element} · {awayZodiac.quality}</p>
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
                    </div>
                  </div>
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
            </section>

            {/* Horary Chart Analysis */}
            <HoraryChartSection
              gameId={game.id}
              startTime={game.start_time}
              venueLat={game.venue_lat ?? null}
              venueLng={game.venue_lng ?? null}
              homeAbbr={game.home_abbr}
              awayAbbr={game.away_abbr}
            />

            {/* Game Chart Rulers */}
            <GameChartRulers
              startTime={game.start_time}
              homeAbbr={game.home_abbr}
              awayAbbr={game.away_abbr}
              homeML={game.odds.moneyline.home}
              awayML={game.odds.moneyline.away}
              venueLat={game.venue_lat ?? null}
            />

            {/* Transit Scrubber */}
            <TransitScrubber
              startTime={game.start_time}
              venueLat={game.venue_lat ?? null}
              awayPlayers={awayPlayers}
              homePlayers={homePlayers}
              awayAbbr={game.away_abbr}
              homeAbbr={game.home_abbr}
            />

            {/* Synastry */}
            {awayPlayers.length > 0 && homePlayers.length > 0 && (
              <SynastrySection
                awayPlayers={awayPlayers}
                homePlayers={homePlayers}
                awayAbbr={game.away_abbr}
                homeAbbr={game.home_abbr}
              />
            )}
          </>
        )}

        {activeTab === "matchup" && (
          <>
            <GameMatchupTab
              gameId={game.id}
              homeAbbr={game.home_abbr}
              awayAbbr={game.away_abbr}
              homeTeam={game.home_team}
              awayTeam={game.away_team}
            />

            {/* Player Cards */}
            {(awayPlayers.length > 0 || homePlayers.length > 0) && (
              <section>
                <h3 className="text-xs font-semibold text-primary uppercase tracking-widest mb-3 flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  Rosters
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">{game.away_abbr}</p>
                    <div className="space-y-1.5">
                      {awayPlayers.slice(0, 12).map((p) => (
                        <PlayerCard key={p.id} player={p} gameId={game.id} navigate={navigate} />
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">{game.home_abbr}</p>
                    <div className="space-y-1.5">
                      {homePlayers.slice(0, 12).map((p) => (
                        <PlayerCard key={p.id} player={p} gameId={game.id} navigate={navigate} />
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default GameDetail;
