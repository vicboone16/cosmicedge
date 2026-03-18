import { useState } from "react";
import { ArrowRight, TrendingUp, Shield, Zap, ArrowUpDown, Loader2, Target, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import type { LegScore } from "@/lib/slip-optimizer-engine";
import { stripMarkdownArtifacts } from "@/lib/display-labels";

interface ReplacementCandidate {
  player_name: string;
  player_id: string;
  game_id: string;
  prop_type: string;
  line: number;
  side: string;
  mu: number | null;
  edge_score: number;
  hit_probability: number;
  live_edge: number;
  minutes_security: number;
  volatility: number;
  correlation_penalty: number;
  composite_score: number;
  tag: string;
  one_liner: string | null;
  odds: number | null;
  hit_l10: number | null;
  streak: number | null;
}

const TAG_CONFIG: Record<string, { label: string; className: string; icon: any }> = {
  safer: { label: "Safer", className: "text-cosmic-green border-cosmic-green/30", icon: Shield },
  stronger_edge: { label: "Stronger Edge", className: "text-cosmic-gold border-cosmic-gold/30", icon: Zap },
  lower_volatility: { label: "Lower Vol", className: "text-cosmic-cyan border-cosmic-cyan/30", icon: TrendingUp },
  better_matchup: { label: "Better Matchup", className: "text-primary border-primary/30", icon: ArrowUpDown },
  stronger_signal: { label: "Stronger Signal", className: "text-cosmic-gold border-cosmic-gold/30", icon: Zap },
};

function StatChip({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-secondary/40">
      <span className="text-[7px] text-muted-foreground">{label}</span>
      <span className={cn("text-[8px] font-bold tabular-nums",
        good ? "text-cosmic-green" : "text-muted-foreground"
      )}>{value}</span>
    </div>
  );
}

interface Props {
  weakestLeg: LegScore | null;
  aiSuggestions: string | null;
  loading: boolean;
  onRequestSuggestions: () => void;
  existingGameIds?: string[];
  existingPlayerNames?: string[];
}

export function SlipReplacementDrawer({ weakestLeg, aiSuggestions, loading, onRequestSuggestions, existingGameIds, existingPlayerNames }: Props) {
  const [replacements, setReplacements] = useState<ReplacementCandidate[]>([]);
  const [quantLoading, setQuantLoading] = useState(false);
  const [quantError, setQuantError] = useState<string | null>(null);

  const handleFindReplacements = async () => {
    setQuantLoading(true);
    setQuantError(null);
    try {
      const res = await supabase.functions.invoke("find-replacement-props", {
        body: {
          weak_leg: weakestLeg ? {
            player_name: weakestLeg.player_name_raw,
            stat_type: weakestLeg.stat_type,
            line: weakestLeg.line,
            direction: weakestLeg.direction,
            game_id: weakestLeg.game_id,
          } : null,
          existing_game_ids: existingGameIds || [],
          existing_player_names: existingPlayerNames || [],
          stat_type: weakestLeg?.stat_type || "points",
          line: weakestLeg?.line || 0,
          direction: weakestLeg?.direction || "over",
        },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.replacements) {
        setReplacements(res.data.replacements);
      }
    } catch (e: any) {
      setQuantError(e.message || "Failed to find replacements");
    } finally {
      setQuantLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
        <ArrowUpDown className="h-3 w-3" /> Replacement Suggestions
      </p>

      {weakestLeg && (
        <div className="p-2 rounded-lg bg-cosmic-red/5 border border-cosmic-red/20">
          <p className="text-[9px] text-muted-foreground mb-1">Weakest Leg to Replace</p>
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-cosmic-red/15 flex items-center justify-center text-[10px] font-black text-cosmic-red shrink-0">
              {weakestLeg.grade}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold text-foreground truncate">{weakestLeg.player_name_raw}</p>
              <p className="text-[8px] text-muted-foreground capitalize">{weakestLeg.stat_type} · {weakestLeg.direction} {weakestLeg.line} · Score {weakestLeg.score}</p>
            </div>
          </div>
        </div>
      )}

      {/* Quant replacement engine */}
      {replacements.length === 0 && !quantLoading && !loading && (
        <div className="flex gap-1.5">
          <button
            onClick={handleFindReplacements}
            className="flex-1 p-2.5 rounded-lg border border-dashed border-primary/30 hover:bg-primary/5 transition-colors text-center"
          >
            <Target className="h-4 w-4 text-primary mx-auto mb-1" />
            <p className="text-[10px] font-semibold text-primary">Quant Search</p>
            <p className="text-[8px] text-muted-foreground">Weighted ranking model</p>
          </button>
          <button
            onClick={onRequestSuggestions}
            className="flex-1 p-2.5 rounded-lg border border-dashed border-cosmic-gold/30 hover:bg-cosmic-gold/5 transition-colors text-center"
          >
            <Zap className="h-4 w-4 text-cosmic-gold mx-auto mb-1" />
            <p className="text-[10px] font-semibold text-cosmic-gold">AI Search</p>
            <p className="text-[8px] text-muted-foreground">AI-powered alternatives</p>
          </button>
        </div>
      )}

      {(quantLoading || loading) && (
        <div className="p-3 rounded-lg border border-primary/20 bg-primary/5 flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <p className="text-[10px] text-primary">Searching for replacement candidates…</p>
        </div>
      )}

      {quantError && (
        <p className="text-[9px] text-cosmic-red">{quantError}</p>
      )}

      {/* Quant replacement cards */}
      {replacements.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-[9px] font-semibold text-muted-foreground">Top Replacements</p>
            <button onClick={handleFindReplacements} className="text-[8px] text-primary flex items-center gap-0.5">
              <RefreshCw className="h-2.5 w-2.5" /> Refresh
            </button>
          </div>
          {replacements.map((r, i) => {
            const tagCfg = TAG_CONFIG[r.tag] || TAG_CONFIG.stronger_signal;
            const TagIcon = tagCfg.icon;
            return (
              <div key={i} className="p-2 rounded-lg bg-secondary/20 border border-border space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-6 w-6 rounded-lg bg-primary/10 flex items-center justify-center text-[9px] font-black text-primary shrink-0">
                      #{i + 1}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold text-foreground truncate">{r.player_name}</p>
                      <p className="text-[8px] text-muted-foreground capitalize">{r.prop_type} · {r.side} {r.line}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className={cn("text-[7px] flex items-center gap-0.5", tagCfg.className)}>
                    <TagIcon className="h-2 w-2" /> {tagCfg.label}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-1">
                  <StatChip label="Hit" value={`${r.hit_probability}%`} good={r.hit_probability >= 60} />
                  <StatChip label="Edge" value={`${r.live_edge > 0 ? "+" : ""}${r.live_edge}%`} good={r.live_edge > 5} />
                  <StatChip label="MinSec" value={`${r.minutes_security}`} good={r.minutes_security >= 70} />
                  <StatChip label="Vol" value={`${r.volatility}%`} good={r.volatility <= 30} />
                  <StatChip label="Score" value={`${r.composite_score}`} good={r.composite_score >= 60} />
                </div>
                {r.mu != null && (
                  <p className="text-[8px] text-muted-foreground">
                    Projected: <span className="font-semibold text-foreground">{r.mu.toFixed(1)}</span> vs line {r.line}
                    {r.hit_l10 != null && <span> · L10: {Math.round(r.hit_l10 * 100)}%</span>}
                    {r.streak != null && r.streak >= 3 && <span className="text-cosmic-green"> · 🔥{r.streak} streak</span>}
                  </p>
                )}
                {r.one_liner && (
                  <p className="text-[8px] text-muted-foreground italic">{r.one_liner}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {aiSuggestions && (
        <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 space-y-1.5">
          <p className="text-[9px] font-semibold text-primary">AI Suggestions</p>
          <div className="text-[10px] text-foreground leading-relaxed whitespace-pre-wrap">
            {stripMarkdownArtifacts(aiSuggestions).split(/\*\*(.*?)\*\*/g).map((part, i) =>
              i % 2 === 1
                ? <strong key={i} className="text-primary">{part}</strong>
                : <span key={i}>{part}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
