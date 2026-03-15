import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { Plus, Target, Check, X, Zap, Trash2, TrendingUp, TrendingDown, Activity, Clock, BarChart3 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";

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

/* ─── Pacing logic ─── */
function getPacing(tp: any, gameData: any) {
  if (!tp.live_stat_value || !tp.line || !gameData) return null;
  const stat = Number(tp.live_stat_value);
  const line = Number(tp.line);
  const progress = (stat / line) * 100;

  // Estimate game progress from quarter
  const quarter = gameData.quarter || 1;
  const gameProgress = Math.min((quarter / 4) * 100, 100);

  const pace = gameProgress > 0 ? (stat / (gameProgress / 100)) : stat;
  const projectedFinal = pace;
  const onPace = projectedFinal >= line;

  return {
    progress: Math.min(progress, 100),
    gameProgress,
    projectedFinal: Math.round(projectedFinal * 10) / 10,
    onPace,
    remaining: Math.max(line - stat, 0),
    stat,
    line,
  };
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
      const { error } = await supabase.from("tracked_props").insert({
        user_id: user.id,
        game_id: gameId,
        player_id: playerId || null,
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

  // Fetch game data for all tracked props to determine game status
  const gameIds = [...new Set(tracked?.map(tp => tp.game_id).filter(Boolean) || [])];
  const { data: gamesMap } = useQuery({
    queryKey: ["tracked-prop-games", gameIds.sort().join(",")],
    queryFn: async () => {
      if (!gameIds.length) return {};
      const { data } = await supabase
        .from("games")
        .select("id, status, home_abbr, away_abbr, home_team, away_team")
        .in("id", gameIds);
      const map: Record<string, any> = {};
      data?.forEach(g => { map[g.id] = g; });
      return map;
    },
    enabled: gameIds.length > 0,
    staleTime: 15_000,
    refetchInterval: 15_000,
  });

  // Auto-settle: batch-settle pregame tracked props whose games are now final
  useEffect(() => {
    if (!tracked || !gamesMap || !user) return;
    const stale = tracked.filter(tp => {
      const game = gamesMap[tp.game_id];
      const gameStatus = (game?.status || "").toLowerCase();
      return (
        (tp.status === "pregame" || tp.status === "live") &&
        ["final", "ended", "completed"].includes(gameStatus)
      );
    });
    if (stale.length === 0) return;

    (async () => {
      for (const tp of stale) {
        await supabase.from("tracked_props").update({
          status: "final",
          settled_at: new Date().toISOString(),
        }).eq("id", tp.id);
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

      {/* Live Props — most prominent */}
      {liveProps.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-cosmic-green flex items-center gap-1">
            <Activity className="h-3 w-3" /> Live ({liveProps.length})
          </p>
          {liveProps.map(tp => (
            <LivePropCard key={tp.id} tp={tp} gameData={gamesMap?.[tp.game_id]} onDelete={() => deleteMutation.mutate(tp.id)} />
          ))}
        </div>
      )}

      {/* Pregame Props */}
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

      {/* Settled Props */}
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

/* ─── Live Prop Card with Progress ─── */
function LivePropCard({ tp, gameData, onDelete }: { tp: any; gameData?: any; onDelete: () => void }) {
  const pacing = getPacing(tp, gameData);

  return (
    <div className="cosmic-card rounded-xl p-3 space-y-2 border-l-2 border-l-cosmic-green">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-foreground">{tp.player_name}</p>
          <p className="text-[10px] text-muted-foreground capitalize">
            {tp.market_type} · {tp.direction} {tp.line}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-cosmic-green animate-pulse" />
          <span className="text-[10px] text-cosmic-green font-semibold uppercase">Live</span>
          <button onClick={onDelete} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title="Remove">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Progress Bar with Pacing */}
      {pacing ? (
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-bold font-display tabular-nums text-foreground">
                {pacing.stat}
              </span>
              <span className="text-sm text-muted-foreground">/ {pacing.line}</span>
            </div>
            <span className={cn(
              "text-[10px] font-semibold px-2 py-0.5 rounded-full",
              pacing.onPace
                ? "bg-cosmic-green/15 text-cosmic-green"
                : "bg-cosmic-red/15 text-cosmic-red"
            )}>
              {pacing.onPace ? "On Pace" : "Behind"}
            </span>
          </div>

          {/* Animated progress bar — stat vs line */}
          <div className="relative h-2.5 bg-border rounded-full overflow-hidden">
            {/* Current stat fill */}
            <div
              className={cn(
                "h-full rounded-full transition-all duration-700 ease-out",
                pacing.onPace ? "bg-cosmic-green" : "bg-cosmic-gold"
              )}
              style={{ width: `${pacing.progress}%` }}
            />
            {/* Projected final marker (prop-specific) */}
            {pacing.projectedFinal > 0 && (
              <div
                className={cn(
                  "absolute top-0 h-full w-0.5 border-l border-dashed",
                  pacing.onPace ? "border-cosmic-green/70" : "border-cosmic-red/70"
                )}
                style={{ left: `${Math.min((pacing.projectedFinal / pacing.line) * 100, 120)}%` }}
                title={`Projected: ${pacing.projectedFinal}`}
              />
            )}
            {/* Line threshold marker at 100% */}
            <div
              className="absolute top-0 h-full w-0.5 bg-foreground/50"
              style={{ left: '100%' }}
              title={`Line: ${pacing.line}`}
            />
          </div>

          <div className="flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground">
              {pacing.remaining > 0 ? `Need ${pacing.remaining.toFixed(1)} more` : "✓ Line cleared"}
            </p>
            <p className="text-[10px] text-muted-foreground tabular-nums">
              Proj: {pacing.projectedFinal}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-baseline gap-1">
          <span className="text-xl font-bold font-display tabular-nums text-foreground">
            {tp.live_stat_value ?? "–"}
          </span>
          <span className="text-sm text-muted-foreground">/ {tp.line}</span>
        </div>
      )}

      {tp.odds && (
        <p className="text-[10px] text-muted-foreground">
          Odds: {Number(tp.odds) > 0 ? "+" : ""}{tp.odds}
        </p>
      )}
      {tp.notes && <p className="text-[10px] text-muted-foreground italic">{tp.notes}</p>}
    </div>
  );
}

/* ─── Pregame Prop Card ─── */
function PregamePropCard({ tp, gameData, onDelete }: { tp: any; gameData?: any; onDelete: () => void }) {
  return (
    <div className="cosmic-card rounded-xl p-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-foreground">{tp.player_name}</p>
          <p className="text-[10px] text-muted-foreground capitalize">
            {tp.market_type} · {tp.direction} {tp.line}
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
          <p className="text-xs font-semibold text-foreground">{tp.player_name}</p>
          <p className="text-[10px] text-muted-foreground capitalize">
            {tp.market_type} · {tp.direction} {tp.line}
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
              settled.verdict === "win"
                ? "bg-cosmic-green/15 text-cosmic-green"
                : "bg-cosmic-red/15 text-cosmic-red"
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
