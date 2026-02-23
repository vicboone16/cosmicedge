import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { ModelSelectorBar } from "./ModelSelectorBar";
import { ModelStatusBanner } from "./ModelStatusBanner";
import { ModelPropCard } from "./ModelPropCard";
import { useIsAdmin } from "@/hooks/use-admin";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import type { NebulaOverlay, SelectedModel } from "@/hooks/use-nebula-overlay";

interface Props {
  overlayRows: NebulaOverlay[];
  isLoading: boolean;
  onRefresh: () => void;
  /** Whether base prop cards exist (for status banner) */
  hasBaseProps?: boolean;
  /** Show prop_type filter + confidence slider (game detail) */
  showFilters?: boolean;
  /** Show search bar (player/team pages) */
  showSearch?: boolean;
}

const PROP_TYPES = [
  { value: "all", label: "All" },
  { value: "points", label: "PTS" },
  { value: "rebounds", label: "REB" },
  { value: "assists", label: "AST" },
  { value: "threes", label: "3PM" },
  { value: "steals", label: "STL" },
  { value: "blocks", label: "BLK" },
  { value: "pts_reb_ast", label: "PRA" },
];

export function ModelsTab({ overlayRows, isLoading, onRefresh, hasBaseProps = true, showFilters = false, showSearch = false }: Props) {
  const navigate = useNavigate();
  const { isAdmin } = useIsAdmin();
  const [selectedModel, setSelectedModel] = useState<SelectedModel>("nebula_v1");
  const [propFilter, setPropFilter] = useState("all");
  const [minConfidence, setMinConfidence] = useState(0);
  const [search, setSearch] = useState("");

  const latestPredTs = useMemo(() => {
    if (overlayRows.length === 0) return null;
    return overlayRows.reduce((max, r) => r.pred_ts > max ? r.pred_ts : max, overlayRows[0].pred_ts);
  }, [overlayRows]);

  const filteredRows = useMemo(() => {
    let rows = [...overlayRows];
    if (propFilter !== "all") rows = rows.filter(r => r.prop_type === propFilter);
    if (minConfidence > 0) rows = rows.filter(r => Number(r.confidence) >= minConfidence / 100);
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(r =>
        (r.player_name || "").toLowerCase().includes(q) ||
        (r.player_team || "").toLowerCase().includes(q) ||
        r.prop_type.toLowerCase().includes(q)
      );
    }
    // Sort by edge_score desc
    rows.sort((a, b) => Number(b.edge_score) - Number(a.edge_score));
    return rows;
  }, [overlayRows, propFilter, minConfidence, search]);

  return (
    <div className="space-y-3">
      <ModelSelectorBar selected={selectedModel} onChange={setSelectedModel} />

      <ModelStatusBanner
        hasBaseProps={hasBaseProps}
        hasOverlay={overlayRows.length > 0}
        latestPredTs={latestPredTs}
        isLoading={isLoading}
        onRefresh={onRefresh}
      />

      {/* Search */}
      {showSearch && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search player or team..."
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-secondary text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
        </div>
      )}

      {/* Filters */}
      {showFilters && (
        <div className="space-y-2">
          <div className="flex gap-1 flex-wrap">
            {PROP_TYPES.map(pt => (
              <button
                key={pt.value}
                onClick={() => setPropFilter(pt.value)}
                className={cn(
                  "px-2 py-1 rounded-full text-[10px] font-semibold transition-colors",
                  propFilter === pt.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                )}
              >
                {pt.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-muted-foreground whitespace-nowrap">Min Confidence: {minConfidence}%</span>
            <Slider
              value={[minConfidence]}
              onValueChange={([v]) => setMinConfidence(v)}
              min={0}
              max={90}
              step={5}
              className="flex-1"
            />
          </div>
        </div>
      )}

      {/* Summary */}
      {overlayRows.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">
            {filteredRows.length} edge{filteredRows.length !== 1 ? "s" : ""} found
          </span>
        </div>
      )}

      {/* Cards */}
      <div className="space-y-2">
        {filteredRows.length === 0 && !isLoading && (
          <div className="cosmic-card rounded-xl p-6 text-center">
            <p className="text-sm text-muted-foreground">
              {overlayRows.length === 0 ? "No model predictions available yet." : "No results match your filters."}
            </p>
          </div>
        )}
        {filteredRows.map(row => (
          <ModelPropCard
            key={`${row.game_id}:${row.player_id}:${row.prop_type}`}
            overlay={row}
            selectedModel={selectedModel}
            isAdmin={isAdmin}
            onPlayerClick={(pid) => navigate(`/player/${pid}`)}
          />
        ))}
      </div>
    </div>
  );
}
