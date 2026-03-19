import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { Plus, Target, Check, X, Zap, Trash2, TrendingUp, TrendingDown, Activity, Clock, BarChart3, Shield, AlertTriangle, Gauge } from "lucide-react";
import { MomentumChip } from "@/components/game/GameMomentumBanner";
import { FitScoreBadge } from "@/components/profile/BettingProfileCard";
import { PlayerMomentumChip } from "@/components/game/PlayerMomentumChip";
import { usePlayerMomentum } from "@/hooks/use-player-momentum";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { displayStatName, cleanSourceLabel } from "@/lib/display-labels";
import { ensureInternalPlayerId, isBdlId, batchResolvePlayerNames } from "@/lib/resolve-bdl-player";

/* ─── Settled display logic ─── */
function getSettledDisplay(tp: any) {
  const isFinal = tp.status === "hit" || tp.status === "missed" || tp.status === "final" || tp.status === "push";
  if (!isFinal) return null;

  let actualDir: "over" | "under" | "push" | null = tp.result_direction || null;
  if (!actualDir && tp.live_stat_value != null && tp.line != null) {
    const stat = Number(tp.live_stat_value);
    const line = Number(tp.line);
    if (stat > line) actualDir = "over";
    else if (stat < line) actualDir = "under";
    else actualDir = "push";
  }

  let verdict: "win" | "loss" | "push" | null = null;
  if (tp.direction && actualDir) {
    if (actualDir === "push") verdict = "push";
    else if (tp.direction === actualDir) verdict = "win";
    else verdict = "loss";
  }

  return { actualDir, verdict };
}

/* ─── Period/market parsing ─── */
function parseTrackedPeriodAndMarket(rawMarket: string) {
  const market = (rawMarket || "").toLowerCase().trim();
  const idx = market.indexOf(":");
  if (idx > 0) {
    const prefix = market.slice(0, idx);
    const suffix = market.slice(idx + 1);
    if (["q1", "q2", "q3", "q4", "1h", "2h", "full"].includes(prefix)) {
      return { period: prefix, market: suffix };
    }
  }
  return { period: "full", market };
}

/* ─── Stat map for live sync ─── */
const TRACKED_STAT_MAP: Record<string, string[]> = {
  points: ["points"], player_points: ["points"], pts: ["points"],
  rebounds: ["rebounds"], player_rebounds: ["rebounds"], reb: ["rebounds"],
  assists: ["assists"], player_assists: ["assists"], ast: ["assists"],
  steals: ["steals"], stl: ["steals"],
  blocks: ["blocks"], blk: ["blocks"],
  turnovers: ["turnovers"], tov: ["turnovers"],
  threes: ["three_made"], three_made: ["three_made"], "3pm": ["three_made"],
  pra: ["points", "rebounds", "assists"],
  "pts+reb+ast": ["points", "rebounds", "assists"],
  "pts+rebs+asts": ["points", "rebounds", "assists"],
  player_points_rebounds_assists: ["points", "rebounds", "assists"],
  player_points_rebounds: ["points", "rebounds"],
  "pts+reb": ["points", "rebounds"],
  player_points_assists: ["points", "assists"],
  "pts+ast": ["points", "assists"],
  player_rebounds_assists: ["rebounds", "assists"],
  "reb+ast": ["rebounds", "assists"],
  "rebs+asts": ["rebounds", "assists"],
  player_steals_blocks: ["steals", "blocks"],
  "stl+blk": ["steals", "blocks"],
  "blks+stls": ["steals", "blocks"],
  fouls: ["personal_fouls"], personal_fouls: ["personal_fouls"],
  fantasy_score: ["fantasy_points"], "fantasy score": ["fantasy_points"],
  fantasy_points: ["fantasy_points"],
};

/* ─── Status label colors ─── */
function getStatusLabelStyle(label: string) {
  switch (label) {
    case "likely_hit": return { bg: "bg-cosmic-green/15", text: "text-cosmic-green", label: "Likely Hit" };
    case "coinflip": return { bg: "bg-cosmic-gold/15", text: "text-cosmic-gold", label: "Coin Flip" };
    case "danger": return { bg: "bg-cosmic-red/15", text: "text-cosmic-red", label: "Danger" };
    case "final": return { bg: "bg-muted/30", text: "text-muted-foreground", label: "Final" };
    default: return { bg: "bg-cosmic-cyan/15", text: "text-cosmic-cyan", label: "Pregame" };
  }
}

/* ─── Track Prop Button (used on prop cards) ─── */
interface TrackPropFormProps {
  gameId: string;
  playerName: string;
  playerId?: string;
  marketType: string;
  line: number;
  overPrice: number | null;
  underPrice: number | null;
  onClose?: () => void;
}

export function TrackPropButton({
  gameId, playerName, playerId, marketType, line, overPrice, underPrice,
}: TrackPropFormProps) {
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<"over" | "under">("over");
  const [notes, setNotes] = useState("");
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not logged in");
      // Resolve BDL numeric player_id to internal UUID before storing
      const resolvedPlayerId = await ensureInternalPlayerId(playerId, playerName);
      const { error } = await supabase.from("tracked_props").insert({
        user_id: user.id,
        game_id: gameId,
        player_id: resolvedPlayerId || playerId || null,
        player_name: playerName,
        market_type: marketType,
        line,
        direction,
        odds: direction === "over" ? overPrice : underPrice,
        notes: notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tracked-props"] });
      toast({ title: "Prop tracked!", description: `${playerName} ${direction} ${line} ${marketType}` });
      setOpen(false);
      setNotes("");
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
        title="Track this prop"
      >
        <Target className="h-3.5 w-3.5" />
      </button>
    );
  }

  return (
    <div className="mt-2 p-2 rounded-lg bg-secondary/50 border border-border space-y-2">
      <div className="flex items-center gap-2">
        <p className="text-[10px] font-semibold text-foreground flex-1">{playerName} · {marketType} {line}</p>
        <button onClick={() => setOpen(false)} className="text-muted-foreground"><X className="h-3 w-3" /></button>
      </div>
      <div className="flex gap-2">
        {(["over", "under"] as const).map(d => (
          <button
            key={d}
            onClick={() => setDirection(d)}
            className={cn(
              "flex-1 py-1.5 rounded-lg text-[10px] font-semibold capitalize transition-colors",
              direction === d ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
            )}
          >
            {d} {d === "over" ? overPrice : underPrice}
          </button>
        ))}
      </div>
      <input
        value={notes}
        onChange={e => setNotes(e.target.value)}
        placeholder="Why I'm taking this..."
        className="w-full text-[10px] px-2 py-1.5 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground"
      />
      <button
        onClick={() => createMutation.mutate()}
        disabled={createMutation.isPending}
        className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-[10px] font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5"
      >
        <Zap className="h-3 w-3" />
        {createMutation.isPending ? "Tracking..." : "Track Prop"}
      </button>
    </div>
  );
}

/* ─── Tracked Props Widget (Full) ─── */
export function TrackedPropsWidget({ gameId, showHeader = true }: { gameId?: string; showHeader?: boolean }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: tracked } = useQuery({
    queryKey: ["tracked-props", user?.id, gameId],
    queryFn: async () => {
      if (!user) return [];
      let query = supabase
        .from("tracked_props")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (gameId) {
        query = query.eq("game_id", gameId);
      }
      const { data } = await query;
      return data || [];
    },
    enabled: !!user,
    refetchInterval: 15_000,
  });

  // Fetch game data for all tracked props
  const gameIds = [...new Set(tracked?.map(tp => tp.game_id).filter(Boolean) || [])];
  const { data: gamesMap } = useQuery({
    queryKey: ["tracked-prop-games", gameIds.sort().join(",")],
    queryFn: async () => {
      if (!gameIds.length) return {};
      const { data } = await supabase
        .from("games")
        .select("id, status, home_abbr, away_abbr, home_team, away_team, home_score, away_score")
        .in("id", gameIds);
      const map: Record<string, any> = {};
      data?.forEach(g => { map[g.id] = g; });
      return map;
    },
    enabled: gameIds.length > 0,
    staleTime: 15_000,
    refetchInterval: 15_000,
  });

  // Fetch live_prop_state for intelligence overlay
  const playerIds = [...new Set(tracked?.map(tp => tp.player_id).filter(Boolean) || [])];
  const { data: liveStates } = useQuery({
    queryKey: ["live-prop-state", gameIds.sort().join(","), playerIds.sort().join(",")],
    queryFn: async () => {
      if (!gameIds.length || !playerIds.length) return {};
      const { data } = await supabase
        .from("live_prop_state")
        .select("*")
        .in("game_id", gameIds)
        .in("player_id", playerIds);
      const map: Record<string, any> = {};
      for (const s of (data || [])) {
        const key = `${s.game_id}:${s.player_id}:${s.prop_type}:${s.line}:${s.period_scope}`;
        map[key] = s;
      }
      return map;
    },
    enabled: gameIds.length > 0 && playerIds.length > 0,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });

  // Sync live values from player_game_stats + settle when final
  useEffect(() => {
    if (!tracked?.length || !gamesMap || !user) return;
    const syncable = tracked.filter(tp => tp.player_id && tp.game_id);
    if (!syncable.length) return;

    (async () => {
      const uniqueGameIds = [...new Set(syncable.map(tp => tp.game_id))];
      let uniquePlayerIds = [...new Set(syncable.map(tp => tp.player_id))];

      // Detect BDL numeric IDs and resolve them to internal UUIDs
      const bdlIdPicks = syncable.filter(tp => isBdlId(tp.player_id));
      const resolvedIdMap = new Map<string, string>(); // bdlId → internalId

      if (bdlIdPicks.length > 0) {
        // Batch resolve by player name
        const nameMap = await batchResolvePlayerNames(
          bdlIdPicks.map(tp => tp.player_name),
          "NBA"
        );

        for (const tp of bdlIdPicks) {
          const internalId = nameMap.get(tp.player_name);
          if (internalId) {
            resolvedIdMap.set(tp.player_id!, internalId);
            // Also update the DB to fix the stored ID for future syncs
            await supabase.from("tracked_props").update({ player_id: internalId } as any).eq("id", tp.id);
          }
        }

        // Add resolved UUIDs to query set
        uniquePlayerIds = [
          ...new Set([
            ...uniquePlayerIds.filter(id => !isBdlId(id)),
            ...resolvedIdMap.values(),
          ]),
        ];
      }

      const { data: statRows } = await supabase
        .from("player_game_stats")
        .select("player_id, game_id, period, points, rebounds, assists, steals, blocks, turnovers, three_made, fg_made, ft_made, fantasy_points, minutes, fouls, personal_fouls")
        .in("game_id", uniqueGameIds)
        .in("player_id", uniquePlayerIds)
        .in("period", ["full", "q1", "q2", "q3", "q4", "first_half", "second_half"]);

      if (!statRows?.length) return;
      const byKey = new Map<string, any>();
      for (const row of statRows) {
        byKey.set(`${row.player_id}:${row.game_id}:${String(row.period || "full")}`, row);
      }

      const updates: Array<{ id: string; payload: Record<string, any> }> = [];
      for (const tp of syncable) {
        const gameStatus = String(gamesMap?.[tp.game_id]?.status || "").toLowerCase();
        const { period, market } = parseTrackedPeriodAndMarket(tp.market_type || "");
        const columns = TRACKED_STAT_MAP[market] || TRACKED_STAT_MAP[market.replace(/^player_/, "")];
        if (!columns?.length) continue;

        const sumCols = (row: any) => columns.reduce((acc, c) => acc + (Number(row?.[c]) || 0), 0);
        let statValue: number | null = null;

        // Check if the player actually has a full-game stats row (proves they played)
        const fullRow = byKey.get(`${tp.player_id}:${tp.game_id}:full`);
        const playerActuallyPlayed = fullRow && (Number(fullRow.minutes) > 0 || Number(fullRow.points) > 0);

        if (["q1", "q2", "q3", "q4", "full"].includes(period)) {
          const row = byKey.get(`${tp.player_id}:${tp.game_id}:${period}`);
          if (row) statValue = sumCols(row);
        } else if (period === "1h") {
          const direct = byKey.get(`${tp.player_id}:${tp.game_id}:first_half`);
          if (direct) statValue = sumCols(direct);
          else {
            const q1 = byKey.get(`${tp.player_id}:${tp.game_id}:q1`);
            const q2 = byKey.get(`${tp.player_id}:${tp.game_id}:q2`);
            if (q1 || q2) statValue = sumCols(q1) + sumCols(q2);
          }
        } else if (period === "2h") {
          const direct = byKey.get(`${tp.player_id}:${tp.game_id}:second_half`);
          if (direct) statValue = sumCols(direct);
          else {
            const q3 = byKey.get(`${tp.player_id}:${tp.game_id}:q3`);
            const q4 = byKey.get(`${tp.player_id}:${tp.game_id}:q4`);
            if (q3 || q4) statValue = sumCols(q3) + sumCols(q4);
          }
        }

        // Skip if no stat data found at all
        if (statValue == null) continue;

        const payload: Record<string, any> = {
          live_stat_value: statValue,
          progress: tp.line ? Math.max(0, Math.min((Number(statValue) / Number(tp.line)) * 100, 999)) : null,
          status: ["live", "in_progress", "halftime"].includes(gameStatus) ? "live" : tp.status,
        };

        // Only settle as final if: game is final AND player actually played (has minutes/points)
        // This prevents grading with 0 stats when data is missing
        if (["final", "ended", "completed"].includes(gameStatus) && playerActuallyPlayed) {
          const line = Number(tp.line || 0);
          const dir = String(tp.direction || "over").toLowerCase();
          const actualDir = statValue > line ? "over" : statValue < line ? "under" : "push";
          payload.result_direction = actualDir;
          payload.status = actualDir === "push" ? "push" : dir === actualDir ? "hit" : "missed";
          payload.settled_at = tp.settled_at || new Date().toISOString();
        } else if (["final", "ended", "completed"].includes(gameStatus) && !playerActuallyPlayed) {
          // Game is final but no stats — mark as "final" (neutral) not hit/missed
          payload.status = "final";
          payload.result_direction = null;
        }

        const shouldUpdate =
          Number(tp.live_stat_value ?? -9999) !== Number(payload.live_stat_value) ||
          String(tp.status || "") !== String(payload.status || "");

        if (shouldUpdate) updates.push({ id: tp.id, payload });
      }

      if (!updates.length) return;
      for (const u of updates) {
        await supabase.from("tracked_props").update(u.payload as any).eq("id", u.id);
      }
      queryClient.invalidateQueries({ queryKey: ["tracked-props"] });
    })();
  }, [tracked, gamesMap, user, queryClient]);

  const deleteMutation = useMutation({
    mutationFn: async (propId: string) => {
      const { error } = await supabase.from("tracked_props").delete().eq("id", propId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tracked-props"] });
      toast({ title: "Prop removed" });
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  // Helper to find live_prop_state for a tracked prop
  const getLiveState = (tp: any) => {
    if (!liveStates || !tp.player_id || !tp.game_id) return null;
    const { period, market } = parseTrackedPeriodAndMarket(tp.market_type || "");
    const key = `${tp.game_id}:${tp.player_id}:${market}:${tp.line}:${period}`;
    return liveStates[key] || null;
  };

  if (!tracked || tracked.length === 0) {
    return (
      <div className="text-center py-12">
        <Target className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No tracked props yet</p>
        <p className="text-[10px] text-muted-foreground mt-1">Track props from game pages to monitor them here</p>
      </div>
    );
  }

  const liveProps = tracked.filter(tp => tp.status === "live");
  const pregameProps = tracked.filter(tp => tp.status === "pregame");
  const settledProps = tracked.filter(tp => tp.status === "hit" || tp.status === "missed" || tp.status === "final" || tp.status === "push");

  return (
    <section className="space-y-4">
      {showHeader && (
        <h3 className="text-xs font-semibold text-primary uppercase tracking-widest flex items-center gap-1.5">
          <Target className="h-3.5 w-3.5" />
          Tracked Props
          <span className="text-muted-foreground ml-1">({tracked.length})</span>
        </h3>
      )}

      {liveProps.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-cosmic-green flex items-center gap-1">
            <Activity className="h-3 w-3" /> Live ({liveProps.length})
          </p>
          {liveProps.map(tp => (
            <LivePropCard key={tp.id} tp={tp} gameData={gamesMap?.[tp.game_id]} liveState={getLiveState(tp)} onDelete={() => deleteMutation.mutate(tp.id)} />
          ))}
        </div>
      )}

      {pregameProps.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-cosmic-cyan flex items-center gap-1">
            <Clock className="h-3 w-3" /> Pregame ({pregameProps.length})
          </p>
          {pregameProps.map(tp => (
            <PregamePropCard key={tp.id} tp={tp} gameData={gamesMap?.[tp.game_id]} onDelete={() => deleteMutation.mutate(tp.id)} />
          ))}
        </div>
      )}

      {settledProps.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <BarChart3 className="h-3 w-3" /> Settled ({settledProps.length})
          </p>
          {settledProps.map(tp => (
            <SettledPropCard key={tp.id} tp={tp} onDelete={() => deleteMutation.mutate(tp.id)} />
          ))}
        </div>
      )}
    </section>
  );
}

/* ─── Live Prop Card with Intelligence ─── */
function LivePropCard({ tp, gameData, liveState, onDelete }: { tp: any; gameData?: any; liveState?: any; onDelete: () => void }) {
  const stat = Number(tp.live_stat_value ?? liveState?.current_value ?? 0);
  const line = Number(tp.line || 0);
  const progress = line > 0 ? Math.min((stat / line) * 100, 150) : 0;

  // Use live_prop_state intelligence if available
  const projection = liveState?.projected_final;
  const hitProb = liveState?.hit_probability;
  const pacePct = liveState?.pace_pct;
  const edge = liveState?.live_edge;
  const ev = liveState?.expected_return;
  const projMin = liveState?.projected_minutes;
  const minSecurity = liveState?.minutes_security_score;
  const foulRisk = liveState?.foul_risk_level;
  const blowoutProb = liveState?.blowout_probability;
  const statusLabel = liveState?.status_label;
  const volatility = liveState?.volatility;
  const astroNote = liveState?.astro_note;

  const statusStyle = statusLabel ? getStatusLabelStyle(statusLabel) : null;
  const onPace = projection != null ? projection >= line : stat >= (progress / 100) * line;

  return (
    <div className={cn(
      "cosmic-card rounded-xl p-3 space-y-2 border-l-2",
      statusLabel === "danger" ? "border-l-cosmic-red" :
      statusLabel === "likely_hit" ? "border-l-cosmic-green" :
      statusLabel === "coinflip" ? "border-l-cosmic-gold" :
      "border-l-cosmic-green"
    )}>
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-foreground">{cleanSourceLabel(tp.player_name)}</p>
          <p className="text-[10px] text-muted-foreground capitalize">
            {tp.direction} {tp.line} {displayStatName(tp.market_type || "")}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {statusStyle && (
            <span className={cn("text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase", statusStyle.bg, statusStyle.text)}>
              {statusStyle.label}
            </span>
          )}
          <span className="h-1.5 w-1.5 rounded-full bg-cosmic-green animate-pulse" />
          <button onClick={onDelete} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title="Remove">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Game context */}
      {(gameData || liveState) && (
        <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
          {gameData && <span>{gameData.away_abbr} {gameData.away_score ?? 0} – {gameData.home_abbr} {gameData.home_score ?? 0}</span>}
          {liveState?.game_quarter && <span>• Q{liveState.game_quarter}</span>}
          {liveState?.game_clock && <span>{liveState.game_clock}</span>}
        </div>
      )}

      {/* Current + Projection + Progress bar */}
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold font-display tabular-nums text-foreground">{stat}</span>
            <span className="text-sm text-muted-foreground">/ {line}</span>
          </div>
          {projection != null && (
            <div className="text-right">
              <span className={cn("text-sm font-bold tabular-nums", projection >= line ? "text-cosmic-green" : "text-cosmic-red")}>
                → {projection}
              </span>
              <span className="text-[8px] text-muted-foreground block">Projected</span>
            </div>
          )}
        </div>

        {/* Progress bar */}
        <div className="relative h-2.5 bg-border rounded-full overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all duration-700 ease-out", onPace ? "bg-cosmic-green" : "bg-cosmic-gold")}
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
          {projection != null && projection > 0 && (
            <div
              className={cn("absolute top-0 h-full w-0.5 border-l border-dashed", projection >= line ? "border-cosmic-green/70" : "border-cosmic-red/70")}
              style={{ left: `${Math.min((projection / line) * 100, 120)}%` }}
              title={`Projected: ${projection}`}
            />
          )}
        </div>
      </div>

      {/* Intelligence grid */}
      {(hitProb != null || pacePct != null || edge != null) && (
        <div className="grid grid-cols-3 gap-1.5">
          {hitProb != null && (
            <IntelCell
              label="Hit Prob"
              value={`${Math.round(hitProb * 100)}%`}
              color={hitProb >= 0.7 ? "text-cosmic-green" : hitProb >= 0.45 ? "text-cosmic-gold" : "text-cosmic-red"}
            />
          )}
          {pacePct != null && (
            <IntelCell
              label="Pace"
              value={`${pacePct}%`}
              color={pacePct >= 100 ? "text-cosmic-green" : pacePct >= 80 ? "text-cosmic-gold" : "text-cosmic-red"}
            />
          )}
          {edge != null && (
            <IntelCell
              label="Edge"
              value={`${edge > 0 ? "+" : ""}${edge}%`}
              color={edge > 5 ? "text-cosmic-green" : edge > 0 ? "text-cosmic-gold" : "text-cosmic-red"}
            />
          )}
          {ev != null && (
            <IntelCell
              label="EV"
              value={`${ev > 0 ? "+" : ""}${ev}u`}
              color={ev > 0 ? "text-cosmic-green" : "text-cosmic-red"}
            />
          )}
          {projMin != null && (
            <IntelCell label="Proj Min" value={String(projMin)} color="text-foreground" />
          )}
          {minSecurity != null && (
            <IntelCell
              label="Min Security"
              value={String(minSecurity)}
              color={minSecurity >= 70 ? "text-cosmic-green" : minSecurity >= 40 ? "text-cosmic-gold" : "text-cosmic-red"}
            />
          )}
        </div>
      )}

      {/* Risk flags */}
      {(foulRisk && foulRisk !== "low") || (blowoutProb != null && blowoutProb > 0.3) ? (
        <div className="flex flex-wrap gap-1">
          {foulRisk && foulRisk !== "low" && (
            <span className={cn(
              "text-[8px] px-1.5 py-0.5 rounded-full font-semibold",
              foulRisk === "extreme" || foulRisk === "severe" ? "bg-cosmic-red/15 text-cosmic-red" : "bg-cosmic-gold/15 text-cosmic-gold"
            )}>
              ⚠ Foul: {foulRisk}
            </span>
          )}
          {blowoutProb != null && blowoutProb > 0.3 && (
            <span className="text-[8px] px-1.5 py-0.5 rounded-full font-semibold bg-cosmic-red/15 text-cosmic-red">
              ⚠ Blowout: {Math.round(blowoutProb * 100)}%
            </span>
          )}
          {volatility != null && volatility > 50 && (
            <span className="text-[8px] px-1.5 py-0.5 rounded-full font-semibold bg-cosmic-gold/15 text-cosmic-gold">
              High Vol
            </span>
          )}
        </div>
      ) : null}

      {/* Game Momentum + Player Momentum + Fit + Astro */}
      <div className="flex flex-wrap items-center gap-1.5">
        <MomentumChip gameId={tp.game_id} isLive />
        <FitScoreBadge marketType={tp.market_type || ""} statType={tp.market_type} isLive />
        {astroNote && (
          <span className="text-[8px] text-cosmic-purple italic">✦ {astroNote}</span>
        )}
      </div>

      {tp.notes && <p className="text-[10px] text-muted-foreground italic">{cleanSourceLabel(tp.notes)}</p>}
    </div>
  );
}

/* ─── Intelligence Cell ─── */
function IntelCell({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="text-center">
      <p className={cn("text-xs font-bold tabular-nums", color)}>{value}</p>
      <p className="text-[7px] text-muted-foreground uppercase tracking-wider">{label}</p>
    </div>
  );
}

/* ─── Pregame Prop Card ─── */
function PregamePropCard({ tp, gameData, onDelete }: { tp: any; gameData?: any; onDelete: () => void }) {
  return (
    <div className="cosmic-card rounded-xl p-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-foreground">{cleanSourceLabel(tp.player_name)}</p>
          <p className="text-[10px] text-muted-foreground capitalize">
            {displayStatName(tp.market_type || "")} · {tp.direction} {tp.line}
          </p>
          {gameData && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {gameData.away_abbr} @ {gameData.home_abbr}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {tp.odds && (
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {Number(tp.odds) > 0 ? "+" : ""}{tp.odds}
            </span>
          )}
          <span className="text-[10px] text-cosmic-cyan font-semibold uppercase">Pregame</span>
          <button onClick={onDelete} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title="Remove">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
      {tp.notes && <p className="text-[10px] text-muted-foreground italic mt-1">{tp.notes}</p>}
    </div>
  );
}

/* ─── Settled Prop Card ─── */
function SettledPropCard({ tp, onDelete }: { tp: any; onDelete: () => void }) {
  const settled = getSettledDisplay(tp);

  return (
    <div className="cosmic-card rounded-xl p-3 opacity-80">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-foreground">{cleanSourceLabel(tp.player_name)}</p>
          <p className="text-[10px] text-muted-foreground capitalize">
            {displayStatName(tp.market_type || "")} · {tp.direction} {tp.line}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {settled?.actualDir && settled.actualDir !== "push" && (
            <span className={cn(
              "flex items-center gap-0.5 text-[10px] font-semibold capitalize",
              settled.actualDir === "over" ? "text-cosmic-green" : "text-cosmic-red"
            )}>
              {settled.actualDir === "over" ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {settled.actualDir}
            </span>
          )}
          {settled?.actualDir === "push" && (
            <span className="text-[10px] font-semibold text-cosmic-gold">Push</span>
          )}
          {settled?.verdict && settled.verdict !== "push" && (
            <span className={cn(
              "px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase",
              settled.verdict === "win" ? "bg-cosmic-green/15 text-cosmic-green" : "bg-cosmic-red/15 text-cosmic-red"
            )}>
              {settled.verdict}
            </span>
          )}
          <span className="text-[10px] font-semibold uppercase text-muted-foreground">Final</span>
          <button onClick={onDelete} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title="Remove">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {tp.live_stat_value != null && (
        <p className="text-[10px] text-muted-foreground mt-1">
          Final stat: <span className="font-semibold text-foreground">{Number(tp.live_stat_value)}</span> / {Number(tp.line)} line
        </p>
      )}
      {tp.notes && <p className="text-[10px] text-muted-foreground italic mt-1">{tp.notes}</p>}
    </div>
  );
}
