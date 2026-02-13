import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { Plus, Target, Check, X, Zap } from "lucide-react";
import { toast } from "@/hooks/use-toast";

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
  gameId,
  playerName,
  playerId,
  marketType,
  line,
  overPrice,
  underPrice,
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

export function TrackedPropsWidget() {
  const { user } = useAuth();

  const { data: tracked } = useQuery({
    queryKey: ["tracked-props", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("tracked_props")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);
      return data || [];
    },
    enabled: !!user,
    refetchInterval: 15_000,
  });

  if (!tracked || tracked.length === 0) return null;

  return (
    <section>
      <h3 className="text-xs font-semibold text-primary uppercase tracking-widest mb-3 flex items-center gap-1.5">
        <Target className="h-3.5 w-3.5" />
        My Tracked Props
      </h3>
      <div className="space-y-2">
        {tracked.map(tp => {
          const progress = tp.line ? Math.min(((tp.live_stat_value as number) / (tp.line as number)) * 100, 100) : 0;
          const remaining = Math.max((tp.line as number) - (tp.live_stat_value as number), 0);
          const statusColors: Record<string, string> = {
            pregame: "text-muted-foreground",
            live: "text-cosmic-cyan",
            hit: "text-cosmic-green",
            missed: "text-cosmic-red",
            push: "text-cosmic-gold",
          };

          return (
            <div key={tp.id} className="cosmic-card rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-foreground">{tp.player_name}</p>
                  <p className="text-[10px] text-muted-foreground capitalize">
                    {tp.market_type} · {tp.direction} {tp.line}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {tp.status === "hit" && <Check className="h-4 w-4 text-cosmic-green" />}
                  <span className={cn("text-[10px] font-semibold uppercase", statusColors[tp.status || "pregame"])}>
                    {tp.status}
                  </span>
                </div>
              </div>

              {/* Live progress */}
              {(tp.status === "live" || tp.status === "hit") && (
                <div>
                  <div className="flex items-baseline gap-1 mb-1">
                    <span className="text-xl font-bold font-display tabular-nums text-foreground">
                      {tp.live_stat_value as number}
                    </span>
                    <span className="text-sm text-muted-foreground">/ {tp.line as number}</span>
                  </div>
                  <div className="h-2 bg-border rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        tp.status === "hit" ? "bg-cosmic-green" : "bg-primary"
                      )}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  {tp.status === "live" && remaining > 0 && (
                    <p className="text-[10px] text-muted-foreground mt-1">Need {remaining.toFixed(1)} more</p>
                  )}
                </div>
              )}

              {tp.notes && (
                <p className="text-[10px] text-muted-foreground italic">{tp.notes}</p>
              )}

              {tp.odds && (
                <p className="text-[10px] text-muted-foreground">
                  Odds: {(tp.odds as number) > 0 ? "+" : ""}{tp.odds}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
