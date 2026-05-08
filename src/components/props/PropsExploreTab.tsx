import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/use-admin";
import { toast } from "sonner";
import {
  Flame, Zap, TrendingUp, Star, BarChart3, Activity,
  Search, X, SlidersHorizontal, LayoutGrid, List,
  ChevronDown, ChevronUp, ArrowUpDown,
} from "lucide-react";
import { useTopPropsToday, type TopProp, getPropLabel, getEdgeTier } from "@/hooks/use-top-props";
import { PropChip } from "@/components/slate/PropChip";
import { usePropDrawer } from "@/hooks/use-prop-drawer";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

/* ─── Carousel section wrapper ─── */
function CarouselSection({
  title, icon, children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
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

/* ─── Featured card (large) ─── */
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
        <span className={cn("text-[10px] font-semibold flex items-center gap-0.5", isOver ? "text-cosmic-green" : "text-cosmic-red")}>
          {isOver ? <TrendingUp className="h-2.5 w-2.5" /> : null}
          {isOver ? "Over" : "Under"}
          {prop.odds != null && (
            <span className="ml-1 text-muted-foreground tabular-nums font-normal">
              {prop.odds > 0 ? `+${prop.odds}` : prop.odds}
            </span>
          )}
        </span>
        <span className={cn("text-[10px] font-bold tabular-nums", Number(edgeDiff) > 0 ? "text-cosmic-green" : "text-muted-foreground")}>
          Edge {Number(edgeDiff) > 0 ? "+" : ""}{edgeDiff}
        </span>
      </div>

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
        {props.map(p => <PropChip key={p.id} prop={p} size="medium" />)}
      </div>
    </CarouselSection>
  );
}

/* ─── Searchable list row ─── */
function PropListRow({ prop }: { prop: TopProp }) {
  const { openProp } = usePropDrawer();
  const edgeScore = prop.edge_score_v11 ?? prop.edge_score;
  const tier = getEdgeTier(edgeScore);
  const isOver = prop.side === "over" || prop.side == null;
  const propLabel = getPropLabel(prop.prop_type);
  const edgeDiff = prop.line != null ? (prop.mu - prop.line).toFixed(1) : "—";

  return (
    <button
      onClick={() => openProp(prop)}
      className="w-full cosmic-card rounded-xl px-4 py-3 flex items-center gap-3 text-left hover:border-primary/30 transition-all"
    >
      {/* Player + matchup */}
      <div className="flex-1 min-w-0 space-y-0.5">
        <p className="text-sm font-bold text-foreground truncate">{prop.player_name}</p>
        <p className="text-[10px] text-muted-foreground truncate">
          {prop.player_team}
          {prop.home_abbr && prop.away_abbr && ` · ${prop.away_abbr}@${prop.home_abbr}`}
          <span className="mx-1">·</span>
          <span className="font-semibold text-foreground/70 uppercase">{propLabel}</span>
        </p>
      </div>

      {/* Line → projection */}
      <div className="text-center shrink-0 space-y-0.5">
        <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Line → Proj</p>
        <p className="text-xs font-bold tabular-nums text-foreground">
          {prop.line != null ? Number(prop.line) : "—"}
          <span className="text-muted-foreground mx-1">→</span>
          <span className={isOver ? "text-cosmic-green" : "text-cosmic-red"}>{prop.mu.toFixed(1)}</span>
        </p>
      </div>

      {/* Edge + tier */}
      <div className="text-right shrink-0 space-y-1">
        <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0 h-4 font-bold", tier.className)}>
          {edgeScore.toFixed(0)}
        </Badge>
        <p className={cn("text-[10px] font-bold tabular-nums", Number(edgeDiff) > 0 ? "text-cosmic-green" : "text-muted-foreground")}>
          {Number(edgeDiff) > 0 ? "+" : ""}{edgeDiff} edge
        </p>
      </div>
    </button>
  );
}

/* ─── Sort options ─── */
type SortKey = "edge" | "projection" | "edgeDiff" | "streak" | "hitL10";
type StatFilter = "all" | "points" | "rebounds" | "assists" | "pts_reb_ast" | "pts_reb" | "pts_ast";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "edge", label: "Edge Score" },
  { key: "projection", label: "Projection" },
  { key: "edgeDiff", label: "Diff vs Line" },
  { key: "streak", label: "Streak" },
  { key: "hitL10", label: "Hit Rate L10" },
];

const STAT_FILTERS: { key: StatFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "points", label: "PTS" },
  { key: "rebounds", label: "REB" },
  { key: "assists", label: "AST" },
  { key: "pts_reb_ast", label: "PRA" },
  { key: "pts_reb", label: "PR" },
  { key: "pts_ast", label: "PA" },
];

/* ═══════════════════════════════════════════
   MAIN EXPORT
════════════════════════════════════════════ */
export function PropsExploreTab() {
  const { data: allProps, isLoading, refetch } = useTopPropsToday(200);
  const { isAdmin } = useIsAdmin();
  const [runningPredictions, setRunningPredictions] = useState(false);

  /* ─── Search / filter / sort state ─── */
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("edge");
  const [sortDesc, setSortDesc] = useState(true);
  const [statFilter, setStatFilter] = useState<StatFilter>("all");
  const [viewMode, setViewMode] = useState<"explore" | "list">("explore");
  const [showFilters, setShowFilters] = useState(false);

  const handleRunPredictions = async () => {
    setRunningPredictions(true);
    try {
      const now = new Date();
      const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(now); endOfDay.setHours(23, 59, 59, 999);
      const { data: games } = await supabase
        .from("games")
        .select("id")
        .eq("league", "NBA")
        .gte("start_time", startOfDay.toISOString())
        .lte("start_time", endOfDay.toISOString());
      if (!games || games.length === 0) {
        toast.error("No NBA games found for today");
        setRunningPredictions(false);
        return;
      }
      let total = 0;
      for (const g of games) {
        const { data } = await supabase.functions.invoke("nebula-prop-engine", { body: { game_id: g.id } });
        total += data?.predictions || 0;
      }
      toast.success(`Generated ${total} predictions across ${games.length} games`);
      refetch();
    } catch (e) {
      console.error("Prediction run error:", e);
      toast.error("Failed to run predictions");
    }
    setRunningPredictions(false);
  };

  /* ─── Sorted/filtered list for list view ─── */
  const sortedFiltered = useMemo(() => {
    if (!allProps) return [];
    let result = [...allProps];

    // Stat filter
    if (statFilter !== "all") {
      result = result.filter(p => p.prop_type === statFilter);
    }

    // Search
    const q = search.toLowerCase().trim();
    if (q) {
      result = result.filter(p =>
        p.player_name?.toLowerCase().includes(q) ||
        p.player_team?.toLowerCase().includes(q) ||
        getPropLabel(p.prop_type).toLowerCase().includes(q) ||
        `${p.away_abbr ?? ""}@${p.home_abbr ?? ""}`.toLowerCase().includes(q)
      );
    }

    // Sort
    result.sort((a, b) => {
      let va = 0, vb = 0;
      if (sortKey === "edge") {
        va = a.edge_score_v11 ?? a.edge_score;
        vb = b.edge_score_v11 ?? b.edge_score;
      } else if (sortKey === "projection") {
        va = a.mu;
        vb = b.mu;
      } else if (sortKey === "edgeDiff") {
        va = a.line != null ? a.mu - a.line : 0;
        vb = b.line != null ? b.mu - b.line : 0;
      } else if (sortKey === "streak") {
        va = a.streak ?? 0;
        vb = b.streak ?? 0;
      } else if (sortKey === "hitL10") {
        va = a.hit_l10 ?? 0;
        vb = b.hit_l10 ?? 0;
      }
      return sortDesc ? vb - va : va - vb;
    });

    return result;
  }, [allProps, search, sortKey, sortDesc, statFilter]);

  /* ─── Carousel buckets (explore mode) ─── */
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
      <div className="cosmic-card rounded-2xl p-8 text-center space-y-4 mx-4">
        <TrendingUp className="h-8 w-8 text-muted-foreground/30 mx-auto" />
        <p className="text-sm font-medium text-foreground">No model predictions available yet</p>
        <p className="text-xs text-muted-foreground max-w-xs mx-auto">
          The Nebula prediction engine needs to run for today's games.
        </p>
        {isAdmin && (
          <button
            onClick={handleRunPredictions}
            disabled={runningPredictions}
            className="mx-auto px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
          >
            {runningPredictions ? (
              <><div className="h-3 w-3 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />Running predictions...</>
            ) : (
              <><Zap className="h-3 w-3" />Run Predictions for Today</>
            )}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8">

      {/* ─── Search + Controls bar ─── */}
      <div className="px-4 space-y-2 sticky top-0 z-20 bg-background/90 backdrop-blur-xl pt-2 pb-3 border-b border-border/40">

        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search player, team, game, stat…"
            className="w-full pl-9 pr-8 py-2.5 rounded-xl bg-secondary/60 border border-border/60 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Controls row */}
        <div className="flex items-center gap-2">

          {/* Stat filter chips */}
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar flex-1">
            {STAT_FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setStatFilter(f.key)}
                className={cn(
                  "shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all",
                  statFilter === f.key
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-secondary/50 text-muted-foreground border-border/50 hover:border-primary/40"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Filter/sort toggle */}
          <button
            onClick={() => setShowFilters(v => !v)}
            className={cn(
              "shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[10px] font-bold border transition-all",
              showFilters ? "bg-primary/15 text-primary border-primary/40" : "bg-secondary/50 text-muted-foreground border-border/50"
            )}
          >
            <SlidersHorizontal className="h-3 w-3" />
            Sort
          </button>

          {/* View toggle */}
          <div className="flex border border-border/60 rounded-xl overflow-hidden shrink-0">
            <button
              onClick={() => setViewMode("explore")}
              className={cn("px-2 py-1.5 text-[10px] transition-all", viewMode === "explore" ? "bg-primary text-primary-foreground" : "bg-secondary/50 text-muted-foreground hover:text-foreground")}
            >
              <LayoutGrid className="h-3 w-3" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn("px-2 py-1.5 text-[10px] transition-all", viewMode === "list" ? "bg-primary text-primary-foreground" : "bg-secondary/50 text-muted-foreground hover:text-foreground")}
            >
              <List className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* Sort panel */}
        {showFilters && (
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            {SORT_OPTIONS.map(opt => (
              <button
                key={opt.key}
                onClick={() => {
                  if (sortKey === opt.key) setSortDesc(d => !d);
                  else { setSortKey(opt.key); setSortDesc(true); }
                  setViewMode("list");
                }}
                className={cn(
                  "shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all",
                  sortKey === opt.key
                    ? "bg-primary/15 text-primary border-primary/40"
                    : "bg-secondary/50 text-muted-foreground border-border/50 hover:border-primary/30"
                )}
              >
                {opt.label}
                {sortKey === opt.key && (
                  sortDesc ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronUp className="h-2.5 w-2.5" />
                )}
              </button>
            ))}
          </div>
        )}

        {/* Result count in list mode or when searching */}
        {(viewMode === "list" || search || statFilter !== "all") && (
          <p className="text-[10px] text-muted-foreground px-0.5">
            {sortedFiltered.length} prop{sortedFiltered.length !== 1 ? "s" : ""}
            {search && <> matching <span className="font-semibold text-foreground">"{search}"</span></>}
            {statFilter !== "all" && <> · {STAT_FILTERS.find(f => f.key === statFilter)?.label}</>}
          </p>
        )}
      </div>

      {/* ─── LIST VIEW ─── */}
      {(viewMode === "list" || search || statFilter !== "all") ? (
        <div className="px-4 space-y-2">
          {sortedFiltered.length === 0 ? (
            <div className="text-center py-12 space-y-2">
              <Search className="h-8 w-8 text-muted-foreground/30 mx-auto" />
              <p className="text-sm text-muted-foreground">No props match your search</p>
              <button onClick={() => { setSearch(""); setStatFilter("all"); }} className="text-xs text-primary hover:underline">
                Clear filters
              </button>
            </div>
          ) : (
            sortedFiltered.map(p => <PropListRow key={p.id} prop={p} />)
          )}
        </div>
      ) : (
        /* ─── EXPLORE / CAROUSEL VIEW ─── */
        <div className="space-y-6 px-4">
          <CarouselSection title="Featured Props" icon={<Star className="h-3.5 w-3.5 text-cosmic-gold" />}>
            <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
              {featured.map(p => <FeaturedPropCard key={p.id} prop={p} />)}
            </div>
          </CarouselSection>

          <CarouselSection title="Best Props Today" icon={<Zap className="h-3.5 w-3.5 text-primary" />}>
            <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
              {bestToday.map(p => <PropChip key={p.id} prop={p} size="medium" />)}
            </div>
          </CarouselSection>

          {trending.length > 0 && (
            <CarouselSection title="Hot Streaks" icon={<Flame className="h-3.5 w-3.5 text-cosmic-gold" />}>
              <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
                {trending.map(p => <PropChip key={p.id} prop={p} size="medium" />)}
              </div>
            </CarouselSection>
          )}

          <StatGroupCarousel title="Points" icon={<BarChart3 className="h-3.5 w-3.5 text-cosmic-green" />} props={byPoints} />
          <StatGroupCarousel title="Assists" icon={<Activity className="h-3.5 w-3.5 text-blue-400" />} props={byAssists} />
          <StatGroupCarousel title="Rebounds" icon={<TrendingUp className="h-3.5 w-3.5 text-yellow-500" />} props={byRebounds} />
          <StatGroupCarousel title="Combos" icon={<Zap className="h-3.5 w-3.5 text-purple-400" />} props={byCombos} />
        </div>
      )}
    </div>
  );
}
