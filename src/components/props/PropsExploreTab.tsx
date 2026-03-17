import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/use-admin";
import { toast } from "sonner";
import { Flame, Zap, TrendingUp, Star, BarChart3, Activity } from "lucide-react";
import { useTopPropsToday, type TopProp, getPropLabel, getEdgeTier } from "@/hooks/use-top-props";
import { PropChip } from "@/components/slate/PropChip";
import { usePropDrawer } from "@/hooks/use-prop-drawer";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

function CarouselSection({
  title,
  icon,
  children,
  emptyText,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  emptyText?: string;
}) {
  return (
    <section className="space-y-2.5">
      <h3 className="text-xs font-bold text-foreground uppercase tracking-widest flex items-center gap-1.5 px-1">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function FeaturedPropCard({ prop }: { prop: TopProp }) {
  const { openProp } = usePropDrawer();
  const edgeScore = prop.edge_score_v11 ?? prop.edge_score;
  const tier = getEdgeTier(edgeScore);
  const isOver = prop.side === "over" || prop.side == null;
  const propLabel = getPropLabel(prop.prop_type);
  const edgeDiff = prop.line != null ? (prop.mu - prop.line).toFixed(1) : "—";

  return (
    <button
      onClick={() => openProp(prop)}
      className="shrink-0 w-[220px] cosmic-card rounded-2xl p-3.5 space-y-2 text-left hover:border-primary/30 transition-all group"
    >
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-foreground truncate">{prop.player_name}</p>
          <p className="text-[10px] text-muted-foreground">
            {prop.player_team}
            {prop.home_abbr && prop.away_abbr && ` · ${prop.away_abbr} @ ${prop.home_abbr}`}
          </p>
        </div>
        <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0 h-4 font-bold shrink-0 ml-2", tier.className)}>
          {edgeScore.toFixed(0)} {tier.label}
        </Badge>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <span className="text-[10px] font-bold text-muted-foreground uppercase">{propLabel}</span>
          <span className="text-base font-bold tabular-nums text-foreground">{prop.line != null ? Number(prop.line) : "—"}</span>
          <span className="text-[10px] text-muted-foreground">→</span>
          <span className={cn("text-base font-bold tabular-nums", isOver ? "text-cosmic-green" : "text-cosmic-red")}>
            {prop.mu.toFixed(1)}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <span className={cn(
            "text-[10px] font-semibold flex items-center gap-0.5",
            isOver ? "text-cosmic-green" : "text-cosmic-red"
          )}>
            {isOver ? <TrendingUp className="h-2.5 w-2.5" /> : null}
            {isOver ? "Over" : "Under"}
          </span>
          {prop.odds != null && (
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {prop.odds > 0 ? `+${prop.odds}` : prop.odds}
            </span>
          )}
        </div>
        <span className={cn(
          "text-[10px] font-bold tabular-nums",
          Number(edgeDiff) > 0 ? "text-cosmic-green" : "text-muted-foreground"
        )}>
          Edge {Number(edgeDiff) > 0 ? "+" : ""}{edgeDiff}
        </span>
      </div>

      {/* Signal chips */}
      <div className="flex gap-1 flex-wrap">
        {prop.streak != null && prop.streak >= 4 && (
          <span className="text-[7px] px-1.5 py-0.5 rounded-full font-semibold bg-cosmic-green/10 text-cosmic-green">
            🔥 {prop.streak} Streak
          </span>
        )}
        {prop.hit_l10 != null && prop.hit_l10 >= 0.7 && (
          <span className="text-[7px] px-1.5 py-0.5 rounded-full font-semibold bg-primary/10 text-primary">
            Momentum
          </span>
        )}
        {edgeScore >= 65 && (
          <span className="text-[7px] px-1.5 py-0.5 rounded-full font-semibold bg-blue-400/10 text-blue-400">
            Defense Edge
          </span>
        )}
      </div>
    </button>
  );
}

function StatGroupCarousel({ title, icon, props }: { title: string; icon: React.ReactNode; props: TopProp[] }) {
  if (props.length === 0) return null;
  return (
    <CarouselSection title={title} icon={icon}>
      <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
        {props.map(p => (
          <PropChip key={p.id} prop={p} size="medium" />
        ))}
      </div>
    </CarouselSection>
  );
}

export function PropsExploreTab() {
  const { data: allProps, isLoading } = useTopPropsToday(50);

  const { featured, bestToday, byPoints, byAssists, byRebounds, byCombos, trending } = useMemo(() => {
    if (!allProps || allProps.length === 0) {
      return { featured: [], bestToday: [], byPoints: [], byAssists: [], byRebounds: [], byCombos: [], trending: [] };
    }

    const sorted = [...allProps].sort((a, b) => {
      const sa = a.edge_score_v11 ?? a.edge_score;
      const sb = b.edge_score_v11 ?? b.edge_score;
      return sb - sa;
    });

    return {
      featured: sorted.slice(0, 8),
      bestToday: sorted.slice(0, 15),
      byPoints: sorted.filter(p => p.prop_type === "points").slice(0, 10),
      byAssists: sorted.filter(p => p.prop_type === "assists").slice(0, 10),
      byRebounds: sorted.filter(p => p.prop_type === "rebounds").slice(0, 10),
      byCombos: sorted.filter(p => ["pts_reb_ast", "pts_reb", "pts_ast", "reb_ast"].includes(p.prop_type)).slice(0, 10),
      trending: sorted.filter(p => p.streak != null && p.streak >= 3).slice(0, 10),
    };
  }, [allProps]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!allProps || allProps.length === 0) {
    return (
      <div className="cosmic-card rounded-2xl p-8 text-center space-y-3 mx-4">
        <TrendingUp className="h-8 w-8 text-muted-foreground/30 mx-auto" />
        <p className="text-sm font-medium text-foreground">No model predictions available yet</p>
        <p className="text-xs text-muted-foreground max-w-xs mx-auto">
          Prop intelligence surfaces as games approach. Check back closer to tip-off.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 px-4 pb-8">
      {/* Featured Props — large cards */}
      <CarouselSection title="Featured Props" icon={<Star className="h-3.5 w-3.5 text-cosmic-gold" />}>
        <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
          {featured.map(p => (
            <FeaturedPropCard key={p.id} prop={p} />
          ))}
        </div>
      </CarouselSection>

      {/* Best Props Today — medium cards */}
      <CarouselSection title="Best Props Today" icon={<Zap className="h-3.5 w-3.5 text-primary" />}>
        <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
          {bestToday.map(p => (
            <PropChip key={p.id} prop={p} size="medium" />
          ))}
        </div>
      </CarouselSection>

      {/* Trending Streaks */}
      {trending.length > 0 && (
        <CarouselSection title="Hot Streaks" icon={<Flame className="h-3.5 w-3.5 text-cosmic-gold" />}>
          <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
            {trending.map(p => (
              <PropChip key={p.id} prop={p} size="medium" />
            ))}
          </div>
        </CarouselSection>
      )}

      {/* By Stat */}
      <StatGroupCarousel title="Points" icon={<BarChart3 className="h-3.5 w-3.5 text-cosmic-green" />} props={byPoints} />
      <StatGroupCarousel title="Assists" icon={<Activity className="h-3.5 w-3.5 text-blue-400" />} props={byAssists} />
      <StatGroupCarousel title="Rebounds" icon={<TrendingUp className="h-3.5 w-3.5 text-yellow-500" />} props={byRebounds} />
      <StatGroupCarousel title="Combos" icon={<Zap className="h-3.5 w-3.5 text-purple-400" />} props={byCombos} />
    </div>
  );
}
