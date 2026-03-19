import { useState, useMemo } from "react";
import { useGameRoster } from "@/hooks/use-game-roster";
import { useIsAdmin } from "@/hooks/use-admin";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Star, MapPin, Orbit, Moon, Zap, Users, ChevronDown, ChevronUp, TrendingUp, TrendingDown, Lightbulb, Swords, Flame, AlertTriangle, Shield, ListOrdered, TableProperties } from "lucide-react";
import { GameMomentumBanner } from "@/components/game/GameMomentumBanner";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
import { PregameOddsSection } from "@/components/game/PregameOddsSection";
import { LiveOddsTracker } from "@/components/game/LiveOddsTracker";
import { SGOPlayerPropsAnalyzer } from "@/components/game/SGOPlayerPropsAnalyzer";
import { HoraryChartSection } from "@/components/game/HoraryChartSection";
import { AstrocartographySection } from "@/components/game/AstrocartographySection";
import { TransitScrubber } from "@/components/game/TransitScrubber";
import { AstraInsightsSection } from "@/components/game/AstraInsightsSection";
import { GameChartRulers } from "@/components/game/GameChartRulers";
import { GameMatchupTab } from "@/components/game/GameMatchupTab";
import { PlayByPlayTab } from "@/components/game/PlayByPlayTab";
import { GameStatsTab } from "@/components/game/GameStatsTab";
import { OracleTab } from "@/components/game/OracleTab";
import { LivePropsTab } from "@/components/game/LivePropsTab";
import { BestPropsSection } from "@/components/game/BestPropsSection";
import { PeriodScoresTicker } from "@/components/game/PeriodScoresTicker";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertSetupDialog } from "@/components/live/AlertSetupDialog";
import ArchetypeCard from "@/components/cosmic/ArchetypeCard";
import { LiveStoryLayer } from "@/components/game/LiveStoryLayer";

function formatOdds(odds: number | null): string {
  if (odds == null || odds === 0) return "—";
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
  injuryStatus,
  injuryNote,
  onHighlightTransit,
  isTransitHighlighted,
}: {
  player: { id: string; name: string; position: string | null; team: string | null; birth_date: string | null; league: string | null; headshot_url?: string | null };
  gameId: string;
  navigate: (path: string) => void;
  injuryStatus?: string | null;
  injuryNote?: string | null;
  onHighlightTransit?: () => void;
  isTransitHighlighted?: boolean;
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
        .not("over_price", "is", null)
        .not("under_price", "is", null)
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
          <Avatar className="h-8 w-8 shrink-0">
            {player.headshot_url && <AvatarImage src={player.headshot_url} alt={player.name} />}
            <AvatarFallback className="text-[10px] bg-secondary">
              {pz ? pz.symbol : player.name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <p className="text-[10px] font-medium text-foreground truncate">{player.name}</p>
              {injuryStatus && (
                <Badge variant="destructive" className="text-[7px] px-1 py-0 h-3.5">
                  {injuryStatus}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              <p className="text-[9px] text-muted-foreground">{pz?.sign} · {pz?.element}</p>
              {player.position && <span className="text-[9px] text-primary/70">· {player.position}</span>}
            </div>
            {injuryNote && <p className="text-[8px] text-destructive/80 truncate">{injuryNote}</p>}
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

          <div className="flex items-center gap-2">
            {onHighlightTransit && player.birth_date && (
              <button
                onClick={(e) => { e.stopPropagation(); onHighlightTransit(); }}
                className={cn(
                  "text-[9px] px-2 py-1 rounded-lg transition-colors",
                  isTransitHighlighted
                    ? "bg-primary/20 text-primary font-semibold"
                    : "bg-secondary/50 text-muted-foreground hover:text-foreground"
                )}
              >
                {isTransitHighlighted ? "✦ Transits" : "Show transits"}
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); navigate(`/player/${player.id}`); }}
              className="text-[9px] text-primary hover:underline"
            >
              View full profile →
            </button>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

const GameDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { formatInUserTZ, getTZAbbrev } = useTimezone();
  const [activeTab, setActiveTab] = useState<"odds" | "insights" | "matchup" | "pbp" | "stats" | "oracle" | "liveprops">("insights");
  const { isAdmin } = useIsAdmin();
  const [gameSubTab, setGameSubTab] = useState<"gamelines" | "player_props" | "team_props" | "game_props">("gamelines");
  const [transitSelectedPlayer, setTransitSelectedPlayer] = useState<{ id: string; name: string; position: string | null; team: string | null; birth_date: string | null } | null>(null);

  const { data: game, isLoading } = useQuery({
    queryKey: ["game", id],
    queryFn: async (): Promise<(GameWithOdds & { venue_lat?: number | null; venue_lng?: number | null }) | null> => {
      const { data, error } = await supabase.from("games").select("*").eq("id", id!).maybeSingle();
      if (error || !data) return null;

      const { data: oddsRows } = await supabase
        .from("odds_snapshots")
        .select("market_type, home_price, away_price, line, captured_at")
        .eq("game_id", data.id)
        .order("captured_at", { ascending: false })
        .limit(500);

      const { data: bdlRows } = await supabase
        .from("nba_game_odds")
        .select("market, home_line, away_line, total, home_odds, away_odds, over_odds, under_odds, updated_at")
        .eq("game_key", data.id)
        .order("updated_at", { ascending: false })
        .limit(500);

      const ml = oddsRows?.find((o) => o.market_type === "moneyline");
      const spread = oddsRows?.find((o) => o.market_type === "spread");
      const total = oddsRows?.find((o) => o.market_type === "total");

      const bdlMl = bdlRows?.find((o) => o.market === "h2h" || o.market === "moneyline");
      const bdlSpread = bdlRows?.find((o) => o.market === "spreads" || o.market === "spread");
      const bdlTotal = bdlRows?.find((o) => o.market === "totals" || o.market === "total");

      const hasMoneyline = !!(ml || bdlMl);
      const hasSpread = !!(spread || bdlSpread);
      const hasTotal = !!(total || bdlTotal);

      return {
        ...data,
        odds: {
          moneyline: {
            home: hasMoneyline ? (ml?.home_price ?? bdlMl?.home_odds ?? null) : null,
            away: hasMoneyline ? (ml?.away_price ?? bdlMl?.away_odds ?? null) : null,
          },
          spread: {
            home: hasSpread ? (spread?.home_price ?? bdlSpread?.home_odds ?? null) : null,
            away: hasSpread ? (spread?.away_price ?? bdlSpread?.away_odds ?? null) : null,
            line: hasSpread ? (spread?.line ?? bdlSpread?.home_line ?? null) : null,
          },
          total: {
            over: hasTotal ? (total?.home_price ?? bdlTotal?.over_odds ?? null) : null,
            under: hasTotal ? (total?.away_price ?? bdlTotal?.under_odds ?? null) : null,
            line: hasTotal ? (total?.line ?? bdlTotal?.total ?? null) : null,
          },
        },
      };
    },
    enabled: !!id,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return (status === "live" || status === "in_progress") ? 30_000 : false;
    },
  });
  // Canonical roster hook — merges players + depth_charts, prevents cross-team leakage
  const { data: gameRoster } = useGameRoster(game?.home_abbr, game?.away_abbr, game?.league);
  // Legacy compat: flatten into players array for existing consumers
  const players = useMemo(() => {
    if (!gameRoster) return [];
    return [...gameRoster.away, ...gameRoster.home];
  }, [gameRoster]);

  // Fetch injuries for both teams
  const { data: injuries } = useQuery({
    queryKey: ["game-injuries", game?.home_abbr, game?.away_abbr, game?.league],
    queryFn: async () => {
      if (!game) return [];
      const { data } = await supabase
        .from("injuries")
        .select("player_name, team_abbr, status, body_part, notes, player_id")
        .eq("league", game.league)
        .in("team_abbr", [game.home_abbr, game.away_abbr]);
      return data || [];
    },
    enabled: !!game,
  });

  // Fetch depth charts for both teams
  const { data: depthCharts } = useQuery({
    queryKey: ["game-depth-charts", game?.home_abbr, game?.away_abbr, game?.league],
    queryFn: async () => {
      if (!game) return [];
      const { data } = await supabase
        .from("depth_charts")
        .select("player_name, team_abbr, position, depth_order, player_id")
        .eq("league", game.league)
        .in("team_abbr", [game.home_abbr, game.away_abbr])
        .order("position")
        .order("depth_order");
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

  // Build injury lookup by player name
  const injuryMap = new Map<string, { status: string | null; notes: string | null }>();
  for (const inj of injuries || []) {
    injuryMap.set(inj.player_name.toLowerCase(), { status: inj.status, notes: inj.notes });
  }

  // Build depth chart lookup by team
  const awayDepth = (depthCharts || []).filter(d => d.team_abbr === game.away_abbr);
  const homeDepth = (depthCharts || []).filter(d => d.team_abbr === game.home_abbr);
  const awayInjuries = (injuries || []).filter(i => i.team_abbr === game.away_abbr);
  const homeInjuries = (injuries || []).filter(i => i.team_abbr === game.home_abbr);

  return (
    <div className="min-h-screen overflow-x-hidden relative">
      {/* Atmospheric background layer — adapts to pregame / live / final */}
      <LiveStoryLayer gameId={game.id} gameStatus={game.status ?? "scheduled"} />
      <header className="px-4 pt-12 pb-3 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-3 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          <span className="text-sm">Back</span>
        </button>

        {/* ESPN-style scoreboard */}
        <div className="flex items-center justify-center gap-4 py-3">
          {/* Away team */}
          <button onClick={() => navigate(`/team/${game.league}/${game.away_abbr}`)} className="text-center hover:opacity-80 transition-opacity">
            <p className="text-xl font-bold font-display">{game.away_abbr}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{game.away_team}</p>
          </button>

          {/* Scores + status */}
          <div className="flex items-center gap-3">
            {game.away_score != null && (
              <div className="flex items-center gap-1">
                <span className={cn(
                  "text-xl font-bold font-display tabular-nums",
                  game.status === "final" && (game.away_score ?? 0) > (game.home_score ?? 0) ? "text-foreground" : "text-muted-foreground"
                )}>
                  {game.away_score}
                </span>
                {game.status === "final" && (game.away_score ?? 0) > (game.home_score ?? 0) && (
                  <span className="text-cosmic-gold text-xs">◀</span>
                )}
              </div>
            )}
            <div className="text-center px-2">
              {game.status === "final" ? (
                <>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase">Final</p>
                  <p className="text-[9px] text-muted-foreground">
                    {new Date(game.start_time).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </p>
                </>
              ) : game.status === "live" || game.status === "in_progress" ? (
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-cosmic-green animate-pulse-glow" />
                  <span className="text-[10px] font-bold text-cosmic-green uppercase">Live</span>
                </span>
              ) : (
                <p className="text-[10px] text-muted-foreground">
                  {formatInUserTZ(game.start_time)} {getTZAbbrev()}
                </p>
              )}
              {gameStartPH && (
                <p className="text-[8px] text-cosmic-indigo mt-0.5">{gameStartPH.symbol} {gameStartPH.planet}</p>
              )}
            </div>
            {game.home_score != null && (
              <div className="flex items-center gap-1">
                {game.status === "final" && (game.home_score ?? 0) > (game.away_score ?? 0) && (
                  <span className="text-cosmic-gold text-xs">▶</span>
                )}
                <span className={cn(
                  "text-xl font-bold font-display tabular-nums",
                  game.status === "final" && (game.home_score ?? 0) > (game.away_score ?? 0) ? "text-foreground" : "text-muted-foreground"
                )}>
                  {game.home_score}
                </span>
              </div>
            )}
          </div>

          {/* Home team */}
          <button onClick={() => navigate(`/team/${game.league}/${game.home_abbr}`)} className="text-center hover:opacity-80 transition-opacity">
            <p className="text-xl font-bold font-display">{game.home_abbr}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{game.home_team}</p>
          </button>
        </div>

        {/* Period Scores */}
        {(game.status === "final" || game.status === "live" || game.status === "in_progress") && (
          <div className="flex justify-center mt-2">
            <PeriodScoresTicker gameId={game.id} league={game.league} isLive={game.status === "live" || game.status === "in_progress"} />
          </div>
        )}

        {game.venue && (
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground justify-center mb-2">
            <MapPin className="h-3 w-3" />
            <span>{game.venue}</span>
          </div>
        )}
        <div className="flex justify-center mb-3">
          <AlertSetupDialog gameId={game.id} homeTeam={game.home_abbr} awayTeam={game.away_abbr} />
        </div>

        {/* Tab bar - ESPN style underline tabs */}
        <div className="flex gap-1 justify-start sm:justify-center border-b border-border/50 -mx-4 px-4 overflow-x-auto no-scrollbar" style={{ touchAction: "pan-x" }}>
        {([
            { val: "oracle" as const, label: "Oracle" },
            { val: "liveprops" as const, label: "Live Props" },
            { val: "insights" as const, label: "Insights" },
            { val: "matchup" as const, label: "Matchup" },
            { val: "odds" as const, label: "Odds" },
            ...(isAdmin ? [{ val: "pbp" as const, label: "Plays" }] : []),
            { val: "stats" as const, label: "Stats" },
          ]).map(t => (
            <button
              key={t.val}
              onClick={() => setActiveTab(t.val)}
              className={cn(
                "px-4 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap border-b-2",
                activeTab === t.val
                  ? "text-primary border-primary"
                  : "text-muted-foreground border-transparent hover:text-foreground",
                t.val === "liveprops" && (game.status === "live" || game.status === "in_progress") && activeTab !== t.val && "text-cosmic-green"
              )}
            >
              {t.val === "liveprops" && (game.status === "live" || game.status === "in_progress") && (
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-cosmic-green mr-1 animate-pulse-glow" />
              )}
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <div className="px-4 py-4 space-y-4">

        {/* Momentum Banner — only for live/in-progress games (not pregame, not final) */}
        {(game.status === "live" || game.status === "in_progress") && (
          <GameMomentumBanner
            gameId={game.id}
            homeAbbr={game.home_abbr}
            awayAbbr={game.away_abbr}
            isLive
          />
        )}

        {/* Admin Game Diagnostics — available for all states */}
        {isAdmin && (
          <details className="cosmic-card rounded-lg p-3">
            <summary className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider cursor-pointer">
              Admin: Game Diagnostics
            </summary>
            <div className="mt-2 text-[9px] text-muted-foreground font-mono space-y-0.5">
              <p>Game ID: {game.id}</p>
              <p>External ID: {game.external_id ?? "none"}</p>
              <p>Status: <span className={cn(
                "font-bold",
                game.status === "live" || game.status === "in_progress" ? "text-cosmic-green" :
                game.status === "final" ? "text-muted-foreground" : "text-cosmic-gold"
              )}>{game.status ?? "unknown"}</span></p>
              <p>Phase: {game.status === "live" || game.status === "in_progress" ? "LIVE" : game.status === "final" ? "FINAL" : "PREGAME"}</p>
              <p>League: {game.league}</p>
              <p>Teams: {game.away_abbr} @ {game.home_abbr}</p>
              <p>Score: {game.away_score ?? "?"} – {game.home_score ?? "?"}</p>
              <p>LiveStoryLayer: {game.status === "live" || game.status === "in_progress" ? "live mode" : game.status === "final" ? "final mode" : "pregame mode"}</p>
              <p>Momentum banner: {game.status === "live" || game.status === "in_progress" ? "visible" : "hidden"}</p>
              {(game.status === "live" || game.status === "in_progress") && (
                <p className="text-cosmic-gold">PBP source: nba_pbp_events (game_key = gameId, provider = balldontlie)</p>
              )}
            </div>
          </details>
        )}

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
                {/* Markets (Current) */}
                <section>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
                    {(game.status === "live" || game.status === "in_progress") ? "Live Lines" : "Markets"}
                  </h3>
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

                {/* Pregame Odds (frozen at tipoff) */}
                <PregameOddsSection gameId={game.id} homeAbbr={game.home_abbr} awayAbbr={game.away_abbr} status={game.status} />

                {/* Live Odds Tracker (BDL primary, SGO fallback) */}
                <LiveOddsTracker gameId={game.id} homeAbbr={game.home_abbr} awayAbbr={game.away_abbr} league={game.league} />

                {/* Period Markets (legacy) */}
                <PeriodOddsSection gameId={game.id} league={game.league} />
              </>
            )}

            {gameSubTab === "player_props" && (
              <>
                <PlayerPropsSection gameId={game.id} />
                <SGOPlayerPropsAnalyzer gameId={game.id} homeAbbr={game.home_abbr} awayAbbr={game.away_abbr} />
              </>
            )}

            {gameSubTab === "team_props" && (
              <LiveOddsTracker gameId={game.id} homeAbbr={game.home_abbr} awayAbbr={game.away_abbr} league={game.league} />
            )}

            {gameSubTab === "game_props" && (
              <LiveOddsTracker gameId={game.id} homeAbbr={game.home_abbr} awayAbbr={game.away_abbr} league={game.league} />
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
                      <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">{game.away_abbr}</span>
                      <span className="text-2xl block">{awayZodiac.symbol}</span>
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
                      <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">{game.home_abbr}</span>
                      <span className="text-2xl block">{homeZodiac.symbol}</span>
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

            {/* Cosmic Archetype */}
            <ArchetypeCard entityId={game.id} entityType="game" />

            {/* Astra AI Game Analysis */}
            <AstraInsightsSection
              gameId={game.id}
              homeAbbr={game.home_abbr}
              awayAbbr={game.away_abbr}
              homeTeam={game.home_team}
              awayTeam={game.away_team}
              startTime={game.start_time}
              venue={game.venue}
              venueLat={game.venue_lat ?? null}
              venueLng={game.venue_lng ?? null}
              league={game.league}
            />

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
              selectedPlayer={transitSelectedPlayer}
              onSelectPlayer={setTransitSelectedPlayer}
            />

            {/* Astrocartography at Venue */}
            {players && players.length > 0 && (
              <AstrocartographySection
                gameId={game.id}
                players={players}
                venueLat={game.venue_lat ?? null}
                venueLng={game.venue_lng ?? null}
                homeAbbr={game.home_abbr}
                awayAbbr={game.away_abbr}
              />
            )}

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
              league={game.league}
            />

            {/* Injury Report */}
            {(awayInjuries.length > 0 || homeInjuries.length > 0) && (
              <section>
                <h3 className="text-xs font-semibold text-destructive uppercase tracking-widest mb-3 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Injury Report
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">{game.away_abbr}</p>
                    <div className="space-y-1.5">
                      {awayInjuries.length === 0 ? (
                        <p className="text-[9px] text-muted-foreground">No injuries</p>
                      ) : awayInjuries.map((inj, i) => (
                        <div key={i} className="cosmic-card rounded-lg p-2">
                          <div className="flex items-center gap-1">
                            <p className="text-[10px] font-medium text-foreground truncate">{inj.player_name}</p>
                            <Badge variant="destructive" className="text-[7px] px-1 py-0 h-3.5 shrink-0">
                              {inj.status}
                            </Badge>
                          </div>
                          {inj.body_part && <p className="text-[8px] text-muted-foreground">{inj.body_part}</p>}
                          {inj.notes && <p className="text-[8px] text-destructive/70 truncate">{inj.notes}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">{game.home_abbr}</p>
                    <div className="space-y-1.5">
                      {homeInjuries.length === 0 ? (
                        <p className="text-[9px] text-muted-foreground">No injuries</p>
                      ) : homeInjuries.map((inj, i) => (
                        <div key={i} className="cosmic-card rounded-lg p-2">
                          <div className="flex items-center gap-1">
                            <p className="text-[10px] font-medium text-foreground truncate">{inj.player_name}</p>
                            <Badge variant="destructive" className="text-[7px] px-1 py-0 h-3.5 shrink-0">
                              {inj.status}
                            </Badge>
                          </div>
                          {inj.body_part && <p className="text-[8px] text-muted-foreground">{inj.body_part}</p>}
                          {inj.notes && <p className="text-[8px] text-destructive/70 truncate">{inj.notes}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* Depth Charts */}
            {(awayDepth.length > 0 || homeDepth.length > 0) && (
              <section>
                <h3 className="text-xs font-semibold text-primary uppercase tracking-widest mb-3 flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5" />
                  Depth Chart
                </h3>
                <p className="text-[9px] text-muted-foreground mb-3 leading-relaxed">
                  Projected rotation order by position. Tap a player to view their profile. Zodiac signs are derived from birth data on file.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[{ abbr: game.away_abbr, depth: awayDepth }, { abbr: game.home_abbr, depth: homeDepth }].map(({ abbr, depth }) => {
                    const byPos = depth.reduce((acc, d) => {
                      (acc[d.position] = acc[d.position] || []).push(d);
                      return acc;
                    }, {} as Record<string, typeof depth>);
                    return (
                      <div key={abbr}>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">{abbr}</p>
                        <div className="space-y-2">
                          {Object.entries(byPos).slice(0, 6).map(([pos, entries]) => (
                            <div key={pos} className="cosmic-card rounded-lg p-2">
                              <p className="text-[9px] font-bold text-primary uppercase mb-1">{pos}</p>
                              {entries.map((e, i) => {
                                // Look up zodiac: try player_id first, then name match
                                const matchedPlayer = e.player_id
                                  ? players?.find(p => p.id === e.player_id)
                                  : players?.find(p => p.name.toLowerCase() === e.player_name.toLowerCase());
                                const zodiac = matchedPlayer?.birth_date ? getZodiacFromDateStr(matchedPlayer.birth_date) : null;
                                return (
                                  <button
                                    key={i}
                                    onClick={() => { if (e.player_id) navigate(`/player/${e.player_id}`); }}
                                    className={cn(
                                      "text-[9px] w-full text-left flex items-center gap-1 hover:bg-secondary/40 rounded px-1 py-0.5 transition-colors",
                                      i === 0 ? "font-semibold text-foreground" : "text-muted-foreground"
                                    )}
                                  >
                                    <span>{e.depth_order}. {e.player_name}</span>
                                    {zodiac && (
                                      <span className="text-[8px] text-primary/70 ml-auto">{zodiac.symbol} {zodiac.sign}</span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Player Cards */}
            {(awayPlayers.length > 0 || homePlayers.length > 0) && (
              <section>
                <h3 className="text-xs font-semibold text-primary uppercase tracking-widest mb-3 flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  Rosters
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">{game.away_abbr}</p>
                    <div className="space-y-1.5">
                    {awayPlayers.slice(0, 12).map((p) => {
                        const inj = injuryMap.get(p.name.toLowerCase());
                        return <PlayerCard key={p.id} player={p} gameId={game.id} navigate={navigate} injuryStatus={inj?.status} injuryNote={inj?.notes}
                          onHighlightTransit={() => setTransitSelectedPlayer(transitSelectedPlayer?.id === p.id ? null : p)}
                          isTransitHighlighted={transitSelectedPlayer?.id === p.id}
                        />;
                      })}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">{game.home_abbr}</p>
                    <div className="space-y-1.5">
                    {homePlayers.slice(0, 12).map((p) => {
                        const inj = injuryMap.get(p.name.toLowerCase());
                        return <PlayerCard key={p.id} player={p} gameId={game.id} navigate={navigate} injuryStatus={inj?.status} injuryNote={inj?.notes}
                          onHighlightTransit={() => setTransitSelectedPlayer(transitSelectedPlayer?.id === p.id ? null : p)}
                          isTransitHighlighted={transitSelectedPlayer?.id === p.id}
                        />;
                      })}
                    </div>
                  </div>
                </div>
              </section>
            )}
          </>
        )}

        {activeTab === "pbp" && isAdmin && (
          <PlayByPlayTab
            gameId={game.id}
            homeAbbr={game.home_abbr}
            awayAbbr={game.away_abbr}
            league={game.league}
            gameStatus={game.status || undefined}
          />
        )}

        {activeTab === "oracle" && (
          <>
            <OracleTab
              gameId={game.id}
              homeAbbr={game.home_abbr}
              awayAbbr={game.away_abbr}
              homeTeam={game.home_team}
              awayTeam={game.away_team}
              league={game.league}
              bookMLHome={game.odds.moneyline.home}
              bookMLAway={game.odds.moneyline.away}
              bookSpread={game.odds.spread.line}
              bookTotal={game.odds.total.line}
              homeScore={game.home_score}
              awayScore={game.away_score}
              isLive={game.status === "live" || game.status === "in_progress"}
            />
            <BestPropsSection gameId={game.id} />
          </>
        )}

        {activeTab === "liveprops" && (
          <LivePropsTab
            gameId={game.id}
            homeAbbr={game.home_abbr}
            awayAbbr={game.away_abbr}
            isLive={game.status === "live" || game.status === "in_progress"}
          />
        )}

        {activeTab === "stats" && (
          <GameStatsTab
            gameId={game.id}
            homeAbbr={game.home_abbr}
            awayAbbr={game.away_abbr}
            homeTeam={game.home_team}
            awayTeam={game.away_team}
            homeScore={game.home_score ?? null}
            awayScore={game.away_score ?? null}
            league={game.league}
          />
        )}
      </div>
    </div>
  );
};

export default GameDetail;
