import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Activity, TrendingUp, AlertTriangle, CheckCircle, XCircle, Pause, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useSlipLiveSync } from "@/hooks/use-slip-live-sync";

interface LiveLeg {
  id: string;
  player_name_raw: string;
  player_id?: string | null;
  stat_type: string;
  line: number;
  direction: string;
  live_value?: number | null;
  progress?: number | null;
  result?: string | null;
  match_status?: string;
  game_id?: string | null;
}

interface GameGroup {
  game_id: string;
  game: any;
  snapshot: any;
  legs: LiveLeg[];
}

function getLegState(leg: LiveLeg, gameStatus?: string) {
  if (leg.result === "win") return { label: "Hit ✓", color: "text-cosmic-green", barColor: "bg-cosmic-green", icon: CheckCircle };
  if (leg.result === "loss") return { label: "Miss", color: "text-cosmic-red", barColor: "bg-cosmic-red", icon: XCircle };
  if (leg.result === "void") return { label: "Void", color: "text-muted-foreground", barColor: "bg-muted", icon: Pause };
  if (leg.result === "push") return { label: "Push", color: "text-cosmic-gold", barColor: "bg-cosmic-gold", icon: Pause };
  if (["final", "ended", "completed"].includes((gameStatus || "").toLowerCase())) {
    return { label: "Final", color: "text-muted-foreground", barColor: "bg-muted-foreground", icon: Clock };
  }

  if (leg.live_value == null) return { label: "Pregame", color: "text-muted-foreground", barColor: "bg-muted-foreground/30", icon: Clock };

  const pct = leg.line > 0 ? (Number(leg.live_value) / Number(leg.line)) * 100 : 0;
  if (pct >= 100) return { label: "Cleared ✓", color: "text-cosmic-green", barColor: "bg-cosmic-green", icon: CheckCircle };
  if (pct >= 65) return { label: "On Track", color: "text-cosmic-green", barColor: "bg-cosmic-green", icon: TrendingUp };
  if (pct >= 40) return { label: "Pacing", color: "text-cosmic-gold", barColor: "bg-cosmic-gold", icon: TrendingUp };
  return { label: "Behind", color: "text-cosmic-red", barColor: "bg-cosmic-red", icon: AlertTriangle };
}

function GameGroupHeader({ game, snapshot }: { game: any; snapshot: any }) {
  const normalizedStatus = (snapshot?.status || game?.status || "").toLowerCase();
  const isLive = ["live", "in_progress", "halftime"].includes(normalizedStatus);
  const isFinal = ["final", "ended", "completed"].includes(normalizedStatus);

  return (
    <div className="flex items-center justify-between px-3 py-2 bg-secondary/40 rounded-lg border border-border/50">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-[8px] font-bold px-1.5 py-0">
          {game?.league || "NBA"}
        </Badge>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-bold text-foreground">{game?.away_abbr || "AWY"}</span>
          <span className="text-sm font-black tabular-nums text-foreground">{game?.away_score ?? "–"}</span>
          <span className="text-[9px] text-muted-foreground">vs</span>
          <span className="text-sm font-black tabular-nums text-foreground">{game?.home_score ?? "–"}</span>
          <span className="text-[11px] font-bold text-foreground">{game?.home_abbr || "HME"}</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        {isLive && (
          <>
            <span className="h-1.5 w-1.5 rounded-full bg-cosmic-green animate-pulse" />
            <span className="text-[9px] font-semibold text-cosmic-green">
              Q{snapshot?.quarter || "?"} {snapshot?.clock || ""}
            </span>
          </>
        )}
        {isFinal && <span className="text-[9px] font-semibold text-muted-foreground">Final</span>}
        {!isLive && !isFinal && <span className="text-[9px] text-muted-foreground">Pregame</span>}
      </div>
    </div>
  );
}

function LegProgressRow({ leg, gameStatus }: { leg: LiveLeg; gameStatus?: string }) {
  const state = getLegState(leg, gameStatus);
  const StateIcon = state.icon;
  const pct = leg.line > 0 && leg.live_value != null
    ? Math.min((Number(leg.live_value) / Number(leg.line)) * 100, 120)
    : 0;
  const liveVal = leg.live_value != null ? Number(leg.live_value) : null;
  const initials = leg.player_name_raw.split(" ").map(w => w[0]).join("").slice(0, 2);

  return (
    <div className="py-2.5 px-1">
      {/* Player row */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <Avatar className="h-7 w-7 shrink-0">
            <AvatarFallback className="text-[9px] bg-secondary font-bold">{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-foreground truncate">{leg.player_name_raw}</p>
            <p className="text-[9px] text-muted-foreground capitalize truncate">{leg.stat_type}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="text-right">
            <p className="text-[10px] font-bold text-foreground capitalize">{leg.direction} {leg.line}</p>
          </div>
          <div className={cn("flex items-center gap-0.5", state.color)}>
            <StateIcon className="h-3 w-3" />
            <span className="text-[8px] font-bold">{state.label}</span>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="relative h-3 bg-secondary/60 rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-700 ease-out", state.barColor)}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
        {/* Line marker at 100% */}
        <div className="absolute top-0 h-full w-0.5 bg-foreground/40" style={{ left: "100%" }} />
        {/* Current value pill */}
        {liveVal != null && (
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 pointer-events-none"
            style={{ left: `${Math.min(pct, 100)}%` }}
          >
            <span className={cn(
              "text-[8px] font-black tabular-nums px-1 py-0.5 rounded-full",
              pct >= 100 ? "bg-cosmic-green text-cosmic-green-foreground" : "bg-foreground text-background"
            )}>
              {liveVal}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export function SlipLiveTracker({ picks, slipMeta }: {
  picks: LiveLeg[];
  slipMeta?: { stake?: number; payout?: number; entry_type?: string; book?: string };
}) {
  // Activate live stat sync — polls player_game_stats and writes live_value back to picks
  useSlipLiveSync(picks, true);

  // Fetch game data for all unique game IDs
  const gameIds = [...new Set(picks.map(p => p.game_id).filter(Boolean) as string[])];

  const { data: gamesMap } = useQuery({
    queryKey: ["slip-tracker-games", gameIds.join(",")],
    queryFn: async () => {
      if (!gameIds.length) return {};
      const { data } = await supabase
        .from("games")
        .select("id, league, status, home_team, away_team, home_abbr, away_abbr, home_score, away_score")
        .in("id", gameIds);
      const map: Record<string, any> = {};
      data?.forEach(g => { map[g.id] = g; });
      return map;
    },
    enabled: gameIds.length > 0,
    refetchInterval: 15_000,
  });

  const { data: snapshotsMap } = useQuery({
    queryKey: ["slip-tracker-snapshots", gameIds.join(",")],
    queryFn: async () => {
      if (!gameIds.length) return {};
      const { data } = await supabase
        .from("game_state_snapshots")
        .select("game_id, home_score, away_score, quarter, clock, status")
        .in("game_id", gameIds)
        .order("captured_at", { ascending: false });
      const map: Record<string, any> = {};
      data?.forEach(s => { if (!map[s.game_id]) map[s.game_id] = s; });
      return map;
    },
    enabled: gameIds.length > 0,
    refetchInterval: 15_000,
  });

  // Group legs by game
  const groups: GameGroup[] = [];
  const ungrouped: LiveLeg[] = [];
  const gameGroupMap: Record<string, LiveLeg[]> = {};

  for (const pick of picks) {
    if (pick.game_id && gamesMap?.[pick.game_id]) {
      if (!gameGroupMap[pick.game_id]) gameGroupMap[pick.game_id] = [];
      gameGroupMap[pick.game_id].push(pick);
    } else {
      ungrouped.push(pick);
    }
  }

  for (const [gid, legs] of Object.entries(gameGroupMap)) {
    groups.push({ game_id: gid, game: gamesMap?.[gid], snapshot: snapshotsMap?.[gid], legs });
  }

  const hitCount = picks.filter(p =>
    p.result === "win" || (p.live_value != null && p.line > 0 && Number(p.live_value) >= p.line)
  ).length;
  const behindCount = picks.filter(p => {
    if (p.result || p.live_value == null) return false;
    const pct = p.line > 0 ? (Number(p.live_value) / Number(p.line)) * 100 : 0;
    return pct < 40;
  }).length;

  const hasAnyLive = picks.some(p => p.live_value != null || p.result);

  return (
    <div className="space-y-3">
      {/* Slip header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-primary" />
          <p className="text-[11px] font-bold text-foreground">Live Progress</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={cn("text-[8px]", hitCount > 0 ? "text-cosmic-green border-cosmic-green/30" : "")}>
            {hitCount}/{picks.length} hitting
          </Badge>
          {behindCount > 0 && (
            <Badge variant="outline" className="text-[8px] text-cosmic-red border-cosmic-red/30">
              {behindCount} behind
            </Badge>
          )}
        </div>
      </div>

      {slipMeta && (slipMeta.stake || slipMeta.payout) && (
        <div className="flex items-center gap-3 px-3 py-1.5 bg-secondary/30 rounded-lg text-[10px]">
          {slipMeta.book && <span className="capitalize font-semibold text-foreground">{slipMeta.book}</span>}
          {slipMeta.entry_type && <span className="text-muted-foreground capitalize">{slipMeta.entry_type}</span>}
          {slipMeta.stake && slipMeta.stake > 0 && <span className="text-muted-foreground">${Number(slipMeta.stake).toFixed(2)}</span>}
          {slipMeta.payout && slipMeta.payout > 0 && <span className="text-cosmic-green font-semibold">→ ${Number(slipMeta.payout).toFixed(2)}</span>}
        </div>
      )}

      {!hasAnyLive && (
        <div className="p-4 rounded-xl bg-secondary/20 border border-border text-center">
          <Clock className="h-5 w-5 text-muted-foreground/40 mx-auto mb-1.5" />
          <p className="text-[11px] text-muted-foreground">Live tracking will appear once games begin</p>
        </div>
      )}

      {/* Game groups */}
      {groups.map(group => (
        <div key={group.game_id} className="space-y-0.5">
          <GameGroupHeader game={group.game} snapshot={group.snapshot} />
          <div className="divide-y divide-border/30">
            {group.legs.map(leg => (
              <LegProgressRow key={leg.id} leg={leg} gameStatus={group.game?.status} />
            ))}
          </div>
        </div>
      ))}

      {/* Ungrouped legs */}
      {ungrouped.length > 0 && (
        <div className="space-y-0.5">
          {groups.length > 0 && (
            <div className="px-3 py-1.5 bg-secondary/30 rounded-lg">
              <span className="text-[9px] font-semibold text-muted-foreground uppercase">Unmatched Games</span>
            </div>
          )}
          <div className="divide-y divide-border/30">
            {ungrouped.map(leg => (
              <LegProgressRow key={leg.id} leg={leg} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
