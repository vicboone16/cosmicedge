import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo } from "react";
import { Flame, Snowflake, TrendingUp, Activity, Users, BarChart3, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNowStrict } from "date-fns";

/* ─── Signal Types ─── */
type SignalType = "hot_hand" | "cold_streak" | "momentum_shift" | "performance_vs_expected" | "rotation_impact" | "game_flow";

interface LiveSignal {
  id: string;
  type: SignalType;
  game_id: string;
  game_label: string;
  league: string;
  headline: string;
  description: string;
  player_name?: string;
  team?: string;
  timestamp: Date;
  severity: "info" | "notable" | "critical";
}

const SIGNAL_CONFIG: Record<SignalType, { icon: any; color: string; bg: string; label: string }> = {
  hot_hand: { icon: Flame, color: "text-cosmic-gold", bg: "bg-cosmic-gold/10 border-cosmic-gold/20", label: "Hot Hand" },
  cold_streak: { icon: Snowflake, color: "text-cosmic-cyan", bg: "bg-cosmic-cyan/10 border-cosmic-cyan/20", label: "Cold Streak" },
  momentum_shift: { icon: TrendingUp, color: "text-cosmic-green", bg: "bg-cosmic-green/10 border-cosmic-green/20", label: "Momentum" },
  performance_vs_expected: { icon: BarChart3, color: "text-primary", bg: "bg-primary/10 border-primary/20", label: "vs Expected" },
  rotation_impact: { icon: Users, color: "text-cosmic-indigo", bg: "bg-cosmic-indigo/10 border-cosmic-indigo/20", label: "Rotation" },
  game_flow: { icon: Activity, color: "text-cosmic-gold", bg: "bg-cosmic-gold/10 border-cosmic-gold/20", label: "Game Flow" },
};

/* ─── Signal Generation from PBP data ─── */
function generateSignals(
  pbpEvents: any[],
  snapshots: any[],
  games: any[]
): LiveSignal[] {
  const signals: LiveSignal[] = [];
  const now = new Date();

  // Build game lookup
  const gameMap: Record<string, any> = {};
  games.forEach(g => { gameMap[g.id] = g; });
  const snapMap: Record<string, any> = {};
  snapshots.forEach(s => { if (!snapMap[s.game_id]) snapMap[s.game_id] = s; });

  // Group PBP events by game and player for streak detection
  const gamePlayerEvents: Record<string, Record<string, any[]>> = {};
  for (const ev of pbpEvents) {
    const gid = ev.game_id;
    const player = ev.player || "unknown";
    if (!gamePlayerEvents[gid]) gamePlayerEvents[gid] = {};
    if (!gamePlayerEvents[gid][player]) gamePlayerEvents[gid][player] = [];
    gamePlayerEvents[gid][player].push(ev);
  }

  // Detect hot hands and cold streaks
  for (const [gameId, players] of Object.entries(gamePlayerEvents)) {
    const game = gameMap[gameId];
    if (!game) continue;
    const label = `${game.away_abbr || "AWY"} vs ${game.home_abbr || "HME"}`;

    for (const [player, events] of Object.entries(players)) {
      if (player === "unknown") continue;
      const recent = events.slice(-8);

      // Hot hand: 3+ consecutive makes
      let consecutiveMakes = 0;
      let recentPts = 0;
      for (let i = recent.length - 1; i >= 0; i--) {
        const ev = recent[i];
        const desc = String(ev.description || ev.event_type || "").toLowerCase();
        if (desc.includes("made") || desc.includes("make") || (ev.points_scored && ev.points_scored > 0)) {
          consecutiveMakes++;
          recentPts += ev.points_scored || 2;
        } else if (desc.includes("miss") || desc.includes("turnover")) {
          break;
        }
      }

      if (consecutiveMakes >= 3) {
        const lastEvt = recent[recent.length - 1];
        signals.push({
          id: `hot-${gameId}-${player}`,
          type: "hot_hand",
          game_id: gameId,
          game_label: label,
          league: game.league || "NBA",
          headline: `${player} — ${consecutiveMakes} straight makes`,
          description: `${recentPts} points in the last ${consecutiveMakes} possessions. Riding a hot streak.`,
          player_name: player,
          team: lastEvt?.team || undefined,
          timestamp: now,
          severity: consecutiveMakes >= 5 ? "critical" : "notable",
        });
      }

      // Cold streak: 4+ consecutive misses
      let consecutiveMisses = 0;
      for (let i = recent.length - 1; i >= 0; i--) {
        const desc = String(recent[i].description || recent[i].event_type || "").toLowerCase();
        if (desc.includes("miss") || desc.includes("turnover")) {
          consecutiveMisses++;
        } else if (desc.includes("made") || desc.includes("make")) {
          break;
        }
      }

      if (consecutiveMisses >= 4) {
        signals.push({
          id: `cold-${gameId}-${player}`,
          type: "cold_streak",
          game_id: gameId,
          game_label: label,
          league: game.league || "NBA",
          headline: `${player} — ${consecutiveMisses} straight misses`,
          description: `Cold shooting stretch. ${consecutiveMisses} consecutive missed attempts.`,
          player_name: player,
          timestamp: now,
          severity: consecutiveMisses >= 6 ? "critical" : "notable",
        });
      }
    }
  }

  // Momentum shifts from snapshots (score runs)
  for (const game of games) {
    if (game.status !== "live" && game.status !== "in_progress") continue;
    const snap = snapMap[game.id];
    if (!snap) continue;
    const label = `${game.away_abbr || "AWY"} vs ${game.home_abbr || "HME"}`;
    const diff = (snap.home_score || 0) - (snap.away_score || 0);

    // Check for significant lead changes or runs
    if (Math.abs(diff) >= 15) {
      const leader = diff > 0 ? (game.home_abbr || "Home") : (game.away_abbr || "Away");
      signals.push({
        id: `blowout-${game.id}`,
        type: "momentum_shift",
        game_id: game.id,
        game_label: label,
        league: game.league || "NBA",
        headline: `${leader} building ${Math.abs(diff)}-point lead`,
        description: `Significant separation developing. Q${snap.quarter || "?"} ${snap.clock || ""}`,
        team: leader,
        timestamp: now,
        severity: Math.abs(diff) >= 20 ? "critical" : "notable",
      });
    }

    // Performance vs expected: check if total is way off
    const total = (snap.home_score || 0) + (snap.away_score || 0);
    const quarter = parseInt(snap.quarter || "1");
    if (quarter >= 2) {
      const projectedTotal = (total / Math.max(quarter, 1)) * 4;
      if (projectedTotal > 240) {
        signals.push({
          id: `pace-high-${game.id}`,
          type: "game_flow",
          game_id: game.id,
          game_label: label,
          league: game.league || "NBA",
          headline: `High-scoring pace — projecting ${Math.round(projectedTotal)} total`,
          description: `Current scoring rate well above average through Q${quarter}.`,
          timestamp: now,
          severity: "notable",
        });
      }
      if (projectedTotal < 190 && projectedTotal > 0) {
        signals.push({
          id: `pace-low-${game.id}`,
          type: "game_flow",
          game_id: game.id,
          game_label: label,
          league: game.league || "NBA",
          headline: `Defensive grind — projecting ${Math.round(projectedTotal)} total`,
          description: `Scoring pace running below expected through Q${quarter}.`,
          timestamp: now,
          severity: "info",
        });
      }
    }
  }

  return signals.sort((a, b) => {
    const sev = { critical: 0, notable: 1, info: 2 };
    return (sev[a.severity] ?? 2) - (sev[b.severity] ?? 2);
  });
}

/* ─── Signal Card ─── */
function SignalCard({ signal }: { signal: LiveSignal }) {
  const cfg = SIGNAL_CONFIG[signal.type];
  const Icon = cfg.icon;

  return (
    <div className={cn("p-3 rounded-xl border transition-all", cfg.bg, signal.severity === "critical" && "ring-1 ring-inset ring-current/20")}>
      <div className="flex items-start gap-2.5">
        <div className={cn("mt-0.5 h-7 w-7 rounded-lg flex items-center justify-center shrink-0", cfg.color, "bg-current/10")}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <Badge variant="outline" className="text-[7px] px-1 py-0 font-bold">{signal.league}</Badge>
            <span className="text-[9px] text-muted-foreground">{signal.game_label}</span>
            {signal.severity === "critical" && <Zap className="h-2.5 w-2.5 text-cosmic-gold" />}
          </div>
          <p className="text-[11px] font-bold text-foreground leading-tight">{signal.headline}</p>
          <p className="text-[9px] text-muted-foreground mt-0.5 leading-snug">{signal.description}</p>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Feed Component ─── */
export function LiveSignalFeed({ maxSignals = 20, compact = false }: { maxSignals?: number; compact?: boolean }) {
  // Fetch live games
  const { data: liveGames } = useQuery({
    queryKey: ["live-signal-games"],
    queryFn: async () => {
      const { data } = await supabase
        .from("games")
        .select("id, league, status, home_team, away_team, home_abbr, away_abbr, home_score, away_score")
        .in("status", ["live", "in_progress"])
        .limit(20);
      return data || [];
    },
    refetchInterval: 15_000,
  });

  const liveGameIds = useMemo(() => (liveGames || []).map(g => g.id), [liveGames]);

  // Fetch snapshots for live games
  const { data: snapshots } = useQuery({
    queryKey: ["live-signal-snapshots", liveGameIds.join(",")],
    queryFn: async () => {
      if (!liveGameIds.length) return [];
      const { data } = await supabase
        .from("game_state_snapshots")
        .select("game_id, home_score, away_score, quarter, clock, status")
        .in("game_id", liveGameIds)
        .order("captured_at", { ascending: false });
      // Dedupe to latest per game
      const seen = new Set<string>();
      return (data || []).filter(s => { if (seen.has(s.game_id)) return false; seen.add(s.game_id); return true; });
    },
    enabled: liveGameIds.length > 0,
    refetchInterval: 15_000,
  });

  // Fetch recent PBP events
  const { data: pbpEvents } = useQuery({
    queryKey: ["live-signal-pbp", liveGameIds.join(",")],
    queryFn: async () => {
      if (!liveGameIds.length) return [];
      // Try nba_pbp_events first (NBA specific)
      const { data } = await supabase
        .from("nba_pbp_events")
        .select("game_id, player, event_type, description, points_scored, team, period, clock")
        .in("game_id", liveGameIds.map(id => id))
        .order("created_at", { ascending: false })
        .limit(500);
      return data || [];
    },
    enabled: liveGameIds.length > 0,
    refetchInterval: 20_000,
  });

  const signals = useMemo(() => {
    if (!liveGames?.length) return [];
    return generateSignals(pbpEvents || [], snapshots || [], liveGames).slice(0, maxSignals);
  }, [liveGames, snapshots, pbpEvents, maxSignals]);

  if (!liveGames?.length) {
    return (
      <div className="p-6 text-center rounded-xl bg-secondary/20 border border-border">
        <Activity className="h-6 w-6 text-muted-foreground/30 mx-auto mb-2" />
        <p className="text-xs text-muted-foreground">No live games right now</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">Live signals will appear when games are in progress</p>
      </div>
    );
  }

  if (signals.length === 0) {
    return (
      <div className="p-4 text-center rounded-xl bg-secondary/20 border border-border">
        <Zap className="h-5 w-5 text-muted-foreground/30 mx-auto mb-1.5" />
        <p className="text-xs text-muted-foreground">Monitoring {liveGames.length} live game{liveGames.length > 1 ? "s" : ""}...</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">Signals will appear as streaks and trends develop</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-cosmic-green animate-pulse" />
          <p className="text-[11px] font-bold text-foreground">Live Signals</p>
        </div>
        <Badge variant="outline" className="text-[8px]">{signals.length} active</Badge>
      </div>
      <div className="space-y-1.5">
        {signals.map(signal => (
          <SignalCard key={signal.id} signal={signal} />
        ))}
      </div>
    </div>
  );
}
