import { useState } from "react";
import { Trash2, ChevronDown, ChevronUp, Zap, AlertTriangle, CheckCircle, Clock, XCircle, Share2, Copy, RefreshCw, Edit3, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useBetSlips } from "@/hooks/use-bet-slips";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { SlipIntentSelector, SlipOptimizerPanel, INTENT_CONFIG, type SlipIntent } from "@/components/skyspread/SlipOptimizer";
import { SlipLiveTracker } from "@/components/skyspread/optimizer/SlipLiveTracker";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { displayStatName, displayEntryType, displayBookName } from "@/lib/display-labels";
import { useIsAdmin } from "@/hooks/use-admin";

const MATCH_BADGES: Record<string, { label: string; className: string }> = {
  exact_match: { label: "Matched", className: "bg-cosmic-green/15 text-cosmic-green" },
  fuzzy_match: { label: "Fuzzy Match", className: "bg-cosmic-gold/15 text-cosmic-gold" },
  synthetic_created: { label: "Imported Prop", className: "bg-cosmic-cyan/15 text-cosmic-cyan" },
  manual_confirmed: { label: "Confirmed", className: "bg-cosmic-green/15 text-cosmic-green" },
  unresolved: { label: "Unresolved", className: "bg-cosmic-red/15 text-cosmic-red" },
};

const RESULT_COLORS: Record<string, string> = {
  win: "text-cosmic-green",
  loss: "text-cosmic-red",
  push: "text-cosmic-gold",
};

const PERIOD_LABELS: Record<string, string> = {
  q1: "Q1", q2: "Q2", q3: "Q3", q4: "Q4",
  "1h": "1H", "2h": "2H",
  first3: "First 3 Min", first5: "First 5 Min", first10: "First 10 Min",
};

const parsePeriodStat = (statType: string): { period: string | null; cleanStat: string } => {
  const colonIdx = statType.indexOf(":");
  if (colonIdx > 0) {
    const prefix = statType.slice(0, colonIdx);
    if (PERIOD_LABELS[prefix]) return { period: prefix, cleanStat: statType.slice(colonIdx + 1) };
  }
  return { period: null, cleanStat: statType };
};

function PickRow({ pick, gameInfo, liveState, isAdmin }: { pick: any; gameInfo?: { away_abbr: string; home_abbr: string; status?: string } | null; liveState?: any; isAdmin?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [editLine, setEditLine] = useState<string>(String(pick.line ?? ""));
  const [editLiveValue, setEditLiveValue] = useState<string>(String(pick.live_value ?? ""));
  const [editResult, setEditResult] = useState<string>(pick.result || "");
  const [editGameId, setEditGameId] = useState<string>(pick.game_id || "");
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  // Fetch today's games for admin game re-link dropdown
  const { data: todayGames } = useQuery({
    queryKey: ["admin-relink-games"],
    queryFn: async () => {
      const now = new Date();
      const dayStart = new Date(now.getTime() - 36 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const dayEnd = new Date(now.getTime() + 36 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { data } = await supabase
        .from("games")
        .select("id, home_abbr, away_abbr, league, start_time, status")
        .gte("start_time", `${dayStart}T00:00:00Z`)
        .lte("start_time", `${dayEnd}T23:59:59Z`)
        .order("start_time", { ascending: true })
        .limit(100);
      return data || [];
    },
    enabled: !!isAdmin && editing,
    staleTime: 60_000,
  });

  const progress = pick.line > 0 && pick.live_value != null
    ? Math.min((Number(pick.live_value) / Number(pick.line)) * 100, 150)
    : 0;
  const hasLive = pick.live_value != null;
  const matchBadge = MATCH_BADGES[pick.match_status] || MATCH_BADGES.unresolved;
  const { period, cleanStat } = parsePeriodStat(pick.stat_type || "");
  const periodLabel = period ? PERIOD_LABELS[period] : null;

  const matchupLabel = gameInfo ? `${gameInfo.away_abbr} @ ${gameInfo.home_abbr}` : null;

  // Phase 4: Intelligence overlay from live_prop_state
  const hitProb = liveState?.hit_probability;
  const edge = liveState?.live_edge;
  const pacePct = liveState?.pace_pct;
  const statusLabel = liveState?.status_label;
  const foulRisk = liveState?.foul_risk_level;
  const projection = liveState?.projected_final;

  const statusColor = statusLabel === "likely_hit" ? "text-cosmic-green" :
    statusLabel === "danger" ? "text-cosmic-red" :
    statusLabel === "coinflip" ? "text-cosmic-gold" : null;

  const handleAdminSave = async () => {
    setSaving(true);
    try {
      const updates: Record<string, any> = {};
      const newLine = parseFloat(editLine);
      const newLive = editLiveValue === "" ? null : parseFloat(editLiveValue);
      if (!isNaN(newLine)) updates.line = newLine;
      if (editLiveValue === "") updates.live_value = null;
      else if (newLive != null && !isNaN(newLive)) updates.live_value = newLive;
      if (editResult && editResult !== pick.result) updates.result = editResult || null;
      updates.updated_at = new Date().toISOString();

      const { error } = await supabase.from("bet_slip_picks").update(updates).eq("id", pick.id);
      if (error) throw error;
      toast({ title: "Pick updated" });
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ["bet-slips"] });
    } catch (e: any) {
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="py-2 border-b border-border/30 last:border-b-0">
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground truncate">{pick.player_name_raw}</p>
          <p className="text-[10px] text-muted-foreground capitalize">
            {matchupLabel && (
              <span className="text-foreground/70 font-medium mr-1">{matchupLabel} ·</span>
            )}
            {periodLabel && <span className="text-primary font-semibold mr-1">{periodLabel}</span>}
            {displayStatName(cleanStat)} · {pick.direction} {Number(pick.line)}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {isAdmin && !editing && (
            <button
              onClick={(e) => { e.stopPropagation(); setEditing(true); }}
              className="text-muted-foreground hover:text-primary transition-colors p-0.5"
              title="Admin edit"
            >
              <Edit3 className="h-3 w-3" />
            </button>
          )}
          {statusLabel && statusColor && (
            <span className={cn("text-[8px] font-bold uppercase", statusColor)}>
              {statusLabel.replace("_", " ")}
            </span>
          )}
          <span className={cn("px-1.5 py-0.5 rounded-full text-[9px] font-semibold", matchBadge.className)}>
            {matchBadge.label}
          </span>
          {pick.result && (
            <span className={cn("text-[10px] font-bold uppercase", RESULT_COLORS[pick.result] || "text-muted-foreground")}>
              {pick.result}
            </span>
          )}
        </div>
      </div>

      {/* Admin inline edit panel */}
      {editing && isAdmin && (
        <div className="mt-2 p-2 rounded-lg bg-secondary/40 border border-border/50 space-y-2" onClick={e => e.stopPropagation()}>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[8px] text-muted-foreground uppercase font-semibold">Line</label>
              <input
                type="number"
                step="0.5"
                value={editLine}
                onChange={e => setEditLine(e.target.value)}
                className="w-full bg-background border border-border rounded px-2 py-1 text-xs tabular-nums"
              />
            </div>
            <div>
              <label className="text-[8px] text-muted-foreground uppercase font-semibold">Live Value</label>
              <input
                type="number"
                step="1"
                value={editLiveValue}
                onChange={e => setEditLiveValue(e.target.value)}
                className="w-full bg-background border border-border rounded px-2 py-1 text-xs tabular-nums"
                placeholder="—"
              />
            </div>
            <div>
              <label className="text-[8px] text-muted-foreground uppercase font-semibold">Result</label>
              <select
                value={editResult}
                onChange={e => setEditResult(e.target.value)}
                className="w-full bg-background border border-border rounded px-2 py-1 text-xs"
              >
                <option value="">Pending</option>
                <option value="win">Win</option>
                <option value="loss">Loss</option>
                <option value="push">Push</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setEditing(false)}
              className="text-[10px] text-muted-foreground hover:text-foreground px-2 py-1"
            >
              Cancel
            </button>
            <button
              onClick={handleAdminSave}
              disabled={saving}
              className="flex items-center gap-1 text-[10px] text-primary font-semibold hover:text-primary/80 px-2 py-1 bg-primary/10 rounded"
            >
              <Save className="h-3 w-3" />
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}

      {/* Intelligence strip (Phase 4) */}
      {(hitProb != null || edge != null || projection != null) && (
        <div className="flex items-center gap-2 mt-1 text-[8px]">
          {hitProb != null && (
            <span className={cn("font-bold",
              hitProb >= 0.7 ? "text-cosmic-green" : hitProb >= 0.45 ? "text-cosmic-gold" : "text-cosmic-red"
            )}>{Math.round(hitProb * 100)}% hit</span>
          )}
          {edge != null && (
            <span className={cn("font-semibold", edge > 0 ? "text-cosmic-green" : "text-cosmic-red")}>
              {edge > 0 ? "+" : ""}{edge.toFixed(1)}% edge
            </span>
          )}
          {pacePct != null && (
            <span className={cn("font-semibold", pacePct >= 100 ? "text-cosmic-green" : "text-cosmic-gold")}>
              {pacePct}% pace
            </span>
          )}
          {projection != null && (
            <span className={cn("font-semibold", projection >= pick.line ? "text-cosmic-green" : "text-cosmic-red")}>
              →{projection}
            </span>
          )}
          {foulRisk && foulRisk !== "low" && (
            <span className="text-cosmic-red font-semibold">⚠ {foulRisk}</span>
          )}
        </div>
      )}

      {/* Progress bar for live tracking */}
      {hasLive && (
        <div className="mt-1.5 space-y-1">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-bold tabular-nums text-foreground">{Number(pick.live_value)}</span>
            <span className="text-[10px] text-muted-foreground">/ {Number(pick.line)}</span>
          </div>
          <div className="h-2 bg-border rounded-full overflow-hidden relative">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                progress >= 100 ? "bg-cosmic-green" : progress >= 70 ? "bg-cosmic-gold" : "bg-primary"
              )}
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
            {projection != null && projection > 0 && (
              <div
                className={cn("absolute top-0 h-full w-0.5 border-l border-dashed",
                  projection >= pick.line ? "border-cosmic-green/70" : "border-cosmic-red/70"
                )}
                style={{ left: `${Math.min((projection / Number(pick.line)) * 100, 120)}%` }}
                title={`Projected: ${projection}`}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SlipCard({ slip, picks, isAdmin }: { slip: any; picks: any[]; isAdmin?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [viewTab, setViewTab] = useState<"entry" | "live" | "optimizer">("entry");
  const { deleteSlip, syncToTraxLedger } = useBetSlips();
  const { user } = useAuth();

  const intentState: SlipIntent = (slip.intent_state as SlipIntent) || "tracking_only";
  const intentCfg = INTENT_CONFIG[intentState];
  const IntentIcon = intentCfg.icon;

  const pickCount = picks?.length || 0;
  const hitCount = picks?.filter((p: any) => p.result === "win").length || 0;
  const lossCount = picks?.filter((p: any) => p.result === "loss").length || 0;

  // Fetch game info for all picks to show matchup
  const pickGameIds = [...new Set(picks?.map((p: any) => p.game_id).filter(Boolean) as string[])];
  const { data: gamesMap } = useQuery({
    queryKey: ["slip-card-games", pickGameIds.join(",")],
    queryFn: async () => {
      if (!pickGameIds.length) return {};
      const { data } = await supabase
        .from("games")
        .select("id, home_abbr, away_abbr, status")
        .in("id", pickGameIds);
      const map: Record<string, any> = {};
      data?.forEach(g => { map[g.id] = g; });
      return map;
    },
    enabled: pickGameIds.length > 0,
    staleTime: 60_000,
  });

  // Phase 4: Fetch live_prop_state for intelligence overlay on picks
  const pickPlayerIds = [...new Set(picks?.map((p: any) => p.player_id).filter(Boolean) as string[])];
  const { data: liveStatesMap } = useQuery({
    queryKey: ["slip-pick-live-state", pickGameIds.join(","), pickPlayerIds.join(",")],
    queryFn: async () => {
      if (!pickGameIds.length || !pickPlayerIds.length) return {};
      const { data } = await supabase
        .from("live_prop_state")
        .select("*")
        .in("game_id", pickGameIds)
        .in("player_id", pickPlayerIds);
      const map: Record<string, any> = {};
      for (const s of (data || [])) {
        const key = `${s.game_id}:${s.player_id}:${s.prop_type}`;
        map[key] = s;
      }
      return map;
    },
    enabled: pickGameIds.length > 0 && pickPlayerIds.length > 0,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });

  const getLiveStateForPick = (pick: any) => {
    if (!liveStatesMap || !pick.player_id || !pick.game_id) return null;
    const colonIdx = (pick.stat_type || "").indexOf(":");
    const cleanStat = colonIdx > 0 ? pick.stat_type.slice(colonIdx + 1) : pick.stat_type;
    return liveStatesMap[`${pick.game_id}:${pick.player_id}:${cleanStat}`] || null;
  };

  const statusIcon = slip.status === "settled"
    ? slip.result === "win" ? CheckCircle : slip.result === "loss" ? XCircle : Clock
    : Clock;
  const StatusIcon = statusIcon;

  // Build unique matchup labels for header
  const matchupLabels = pickGameIds
    .map(gid => gamesMap?.[gid])
    .filter(Boolean)
    .map(g => `${g.away_abbr}@${g.home_abbr}`)
    .filter((v, i, a) => a.indexOf(v) === i);

  const handleIntentChange = async (newIntent: SlipIntent) => {
    await supabase.from("bet_slips").update({ intent_state: newIntent } as any).eq("id", slip.id);
    slip.intent_state = newIntent;
    toast({ title: `Slip mode: ${INTENT_CONFIG[newIntent].label}` });
  };

  const handleOptimizerAction = (action: string) => {
    toast({ title: `Action: ${action}`, description: "Optimizer integration coming soon" });
  };

  const handleShareToFeed = async () => {
    if (!user) return;
    try {
      const picksSummary = picks.map((p: any) => `${p.player_name_raw} ${p.direction} ${p.line} ${p.stat_type}`).join(", ");
      const content = `🎯 ${slip.book} ${slip.entry_type} slip (${pickCount} picks)${slip.stake ? ` · $${Number(slip.stake).toFixed(2)}` : ""}${slip.payout ? ` → $${Number(slip.payout).toFixed(2)}` : ""}\n${picksSummary}`;
      const { error } = await supabase.from("feed_posts").insert({
        user_id: user.id,
        content,
      });
      if (error) {
        console.error("[ShareToFeed] Insert error:", error);
        toast({ title: "Failed to share", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Shared to feed! 🎉", description: "Visible to you and your friends" });
    } catch (e: any) {
      toast({ title: "Failed to share", description: e.message, variant: "destructive" });
    }
  };

  const handleCopySlip = () => {
    const lines = picks.map((p: any) => {
      const game = p.game_id && gamesMap?.[p.game_id];
      const matchup = game ? `${game.away_abbr}@${game.home_abbr}` : "";
      return `${p.player_name_raw}${matchup ? ` (${matchup})` : ""} — ${p.direction} ${p.line} ${p.stat_type}`;
    });
    const text = `${slip.book} ${slip.entry_type} | ${slip.stake ? `$${Number(slip.stake).toFixed(2)}` : ""}${slip.payout ? ` → $${Number(slip.payout).toFixed(2)}` : ""}\n${lines.join("\n")}`;
    navigator.clipboard.writeText(text);
    toast({ title: "Slip copied to clipboard!" });
  };

  return (
    <div className="cosmic-card rounded-xl overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-3 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <StatusIcon className={cn(
            "h-4 w-4 shrink-0",
            slip.status === "settled" && slip.result === "win" ? "text-cosmic-green" :
            slip.status === "settled" && slip.result === "loss" ? "text-cosmic-red" :
            "text-muted-foreground"
          )} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-semibold text-foreground capitalize">{displayBookName(slip.book)}</span>
              <span className="text-[10px] text-muted-foreground capitalize">· {displayEntryType(slip.entry_type)}</span>
              <span className="text-[10px] text-muted-foreground">· {pickCount} picks</span>
              {matchupLabels.length > 0 && (
                <span className="text-[9px] font-medium text-primary/80">
                  {matchupLabels.join(" · ")}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <p className="text-[10px] text-muted-foreground">
                {format(new Date(slip.created_at), "MMM d, h:mm a")}
                {slip.stake > 0 && ` · $${Number(slip.stake).toFixed(2)}`}
                {slip.payout > 0 && ` → $${Number(slip.payout).toFixed(2)}`}
              </p>
              <span className={cn("flex items-center gap-0.5 text-[9px] font-semibold", intentCfg.color)}>
                <IntentIcon className="h-2.5 w-2.5" />
                {intentCfg.label}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {hitCount > 0 && <span className="text-[10px] text-cosmic-green font-semibold">{hitCount}W</span>}
          {lossCount > 0 && <span className="text-[10px] text-cosmic-red font-semibold">{lossCount}L</span>}
          {expanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-3 pb-3 border-t border-border/30">
          {/* Intent selector (compact) */}
          <div className="pt-2 pb-2">
            <SlipIntentSelector value={intentState} onChange={handleIntentChange} compact />
          </div>

          {/* View tabs */}
          <div className="flex gap-1 bg-secondary/40 p-0.5 rounded-lg mb-2">
            {(["entry", "live", "optimizer"] as const).map(tab => (
              <button key={tab} onClick={(e) => { e.stopPropagation(); setViewTab(tab); }}
                className={cn("flex-1 py-1.5 rounded-md text-[10px] font-semibold transition-colors capitalize",
                  viewTab === tab ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}>
                {tab === "live" ? "Live Progress" : tab === "optimizer" ? "Intelligence" : "Entry"}
              </button>
            ))}
          </div>

          {/* Entry tab */}
          {viewTab === "entry" && (
            <div>
              {picks?.map((pick: any) => (
                <PickRow key={pick.id} pick={pick} gameInfo={pick.game_id ? gamesMap?.[pick.game_id] : null} liveState={getLiveStateForPick(pick)} isAdmin={isAdmin} />
              ))}
            </div>
          )}

          {/* Live Progress tab */}
          {viewTab === "live" && (
            <SlipLiveTracker
              picks={picks || []}
              slipMeta={{ stake: slip.stake, payout: slip.payout, entry_type: slip.entry_type, book: slip.book }}
            />
          )}

          {/* Optimizer tab */}
          {viewTab === "optimizer" && (
            <SlipOptimizerPanel
              slip={slip}
              picks={picks}
              intentState={intentState}
              onAction={handleOptimizerAction}
            />
          )}

          {/* Footer */}
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/30">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[9px] capitalize">{slip.source}</Badge>
              <button
                onClick={(e) => { e.stopPropagation(); syncToTraxLedger.mutate(slip.id); }}
                disabled={syncToTraxLedger.isPending}
                className="flex items-center gap-1 text-[10px] text-cosmic-cyan hover:text-cosmic-cyan/80 transition-colors font-semibold"
              >
                <RefreshCw className={cn("h-3 w-3", syncToTraxLedger.isPending && "animate-spin")} />
                {syncToTraxLedger.isPending ? "Syncing…" : "Sync to Trax & Ledger"}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleShareToFeed(); }}
                className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 transition-colors"
              >
                <Share2 className="h-3 w-3" />
                Share
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleCopySlip(); }}
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <Copy className="h-3 w-3" />
                Copy
              </button>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); deleteSlip.mutate(slip.id); }}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-destructive transition-colors"
            >
              <Trash2 className="h-3 w-3" />
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BetSlipCards() {
  const { slips, picksMap, isLoading } = useBetSlips();
  const { isAdmin } = useIsAdmin();
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map(i => (
          <div key={i} className="h-20 rounded-xl bg-secondary/30 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!slips?.length) {
    return (
      <div className="text-center py-12">
        <Zap className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No imported slips yet</p>
        <p className="text-[10px] text-muted-foreground mt-1">
          Import a bet slip from PrizePicks or another book
        </p>
      </div>
    );
  }

  const activeSlips = slips.filter(s => s.status === "active");
  const settledSlips = slips.filter(s => s.status === "settled");

  return (
    <div className="space-y-4">
      {activeSlips.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-primary flex items-center gap-1">
            <Zap className="h-3 w-3" /> Active ({activeSlips.length})
          </p>
          {activeSlips.map(slip => (
            <SlipCard key={slip.id} slip={slip} picks={picksMap?.[slip.id] || []} isAdmin={isAdmin} />
          ))}
        </div>
      )}

      {settledSlips.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Settled ({settledSlips.length})
          </p>
          {settledSlips.map(slip => (
            <SlipCard key={slip.id} slip={slip} picks={picksMap?.[slip.id] || []} isAdmin={isAdmin} />
          ))}
        </div>
      )}
    </div>
  );
}
