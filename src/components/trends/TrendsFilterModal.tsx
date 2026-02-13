import { useState } from "react";
import { X, ChevronDown, ChevronUp, SlidersHorizontal, Bookmark, Flame, User, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TrendFilters {
  scope: "all" | "player" | "team";
  leagues: string[];
  direction: "all" | "over" | "under";
  hitRateMin: number;
  sampleWindow: number;
  oddsMin: number | null;
  oddsMax: number | null;
  propositions: string[];
}

const DEFAULT_FILTERS: TrendFilters = {
  scope: "all",
  leagues: [],
  direction: "all",
  hitRateMin: 0,
  sampleWindow: 5,
  oddsMin: null,
  oddsMax: null,
  propositions: [],
};

interface FilterTemplate {
  name: string;
  filters: TrendFilters;
}

const FILTER_GROUPS = [
  "Players",
  "Teams",
  "Games",
  "Splits",
  "Propositions",
  "Leagues",
  "Over / Under",
  "Hit Rate",
  "Odds",
];

const PROPOSITIONS = ["Points", "Rebounds", "Assists", "Steals", "Blocks", "Threes", "PRA", "Saves", "Shots"];

export function TrendsFilterModal({
  open,
  onClose,
  filters,
  onApply,
  resultCount,
}: {
  open: boolean;
  onClose: () => void;
  filters: TrendFilters;
  onApply: (f: TrendFilters) => void;
  resultCount: number;
}) {
  const [tab, setTab] = useState<"current" | "templates">("current");
  const [draft, setDraft] = useState<TrendFilters>({ ...filters });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [templates, setTemplates] = useState<FilterTemplate[]>([]);

  if (!open) return null;

  const toggleExpand = (g: string) => setExpanded(expanded === g ? null : g);

  const handleReset = () => setDraft({ ...DEFAULT_FILTERS });

  const handleSave = () => {
    const name = `Filter ${templates.length + 1}`;
    setTemplates([...templates, { name, filters: { ...draft } }]);
  };

  return (
    <div className="fixed inset-0 z-[60] bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-12 pb-3 border-b border-border">
        <button onClick={onClose}><X className="h-5 w-5 text-muted-foreground" /></button>
        <div className="flex bg-secondary rounded-full p-0.5">
          <button
            onClick={() => setTab("current")}
            className={cn(
              "flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold transition-colors",
              tab === "current" ? "bg-foreground text-background" : "text-muted-foreground"
            )}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Current
          </button>
          <button
            onClick={() => setTab("templates")}
            className={cn(
              "flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold transition-colors",
              tab === "templates" ? "bg-foreground text-background" : "text-muted-foreground"
            )}
          >
            <Bookmark className="h-3.5 w-3.5" />
            Templates
          </button>
        </div>
        <button onClick={handleReset} className="text-xs text-muted-foreground hover:text-foreground">Reset</button>
      </div>

      {tab === "current" ? (
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <h2 className="text-lg font-bold mb-4">Current filters</h2>

          {/* Scope toggle */}
          <div className="flex bg-secondary rounded-full p-0.5 mb-6">
            {([
              { val: "all" as const, icon: Flame, label: "All" },
              { val: "player" as const, icon: User, label: "Player" },
              { val: "team" as const, icon: Shield, label: "Team" },
            ]).map(s => (
              <button
                key={s.val}
                onClick={() => setDraft({ ...draft, scope: s.val })}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-full text-xs font-semibold transition-colors",
                  draft.scope === s.val ? "bg-foreground text-background" : "text-muted-foreground"
                )}
              >
                <s.icon className="h-3.5 w-3.5" />
                {s.label}
              </button>
            ))}
          </div>

          {/* Accordion groups */}
          <div className="space-y-0">
            {FILTER_GROUPS.map(group => (
              <div key={group} className="border-b border-border">
                <button
                  onClick={() => toggleExpand(group)}
                  className="w-full flex items-center justify-between py-4 text-sm font-semibold text-foreground"
                >
                  {group}
                  {expanded === group ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </button>
                {expanded === group && (
                  <div className="pb-4 space-y-2">
                    {group === "Leagues" && (
                      <div className="flex flex-wrap gap-2">
                        {["NBA", "NHL", "MLB", "NFL"].map(lg => {
                          const active = draft.leagues.includes(lg);
                          return (
                            <button
                              key={lg}
                              onClick={() => setDraft({
                                ...draft,
                                leagues: active ? draft.leagues.filter(l => l !== lg) : [...draft.leagues, lg],
                              })}
                              className={cn(
                                "px-3 py-1.5 rounded-full text-xs font-semibold transition-colors",
                                active ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                              )}
                            >
                              {lg}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {group === "Over / Under" && (
                      <div className="flex gap-2">
                        {(["all", "over", "under"] as const).map(d => (
                          <button
                            key={d}
                            onClick={() => setDraft({ ...draft, direction: d })}
                            className={cn(
                              "px-3 py-1.5 rounded-full text-xs font-semibold transition-colors capitalize",
                              draft.direction === d ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                            )}
                          >
                            {d}
                          </button>
                        ))}
                      </div>
                    )}
                    {group === "Hit Rate" && (
                      <div className="space-y-3">
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Min Hit Rate: {draft.hitRateMin}%</label>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={draft.hitRateMin}
                            onChange={e => setDraft({ ...draft, hitRateMin: Number(e.target.value) })}
                            className="w-full accent-primary"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Sample Window</label>
                          <div className="flex gap-2">
                            {[5, 10, 20].map(n => (
                              <button
                                key={n}
                                onClick={() => setDraft({ ...draft, sampleWindow: n })}
                                className={cn(
                                  "px-3 py-1.5 rounded-full text-xs font-semibold transition-colors",
                                  draft.sampleWindow === n ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                                )}
                              >
                                Last {n}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                    {group === "Propositions" && (
                      <div className="flex flex-wrap gap-2">
                        {PROPOSITIONS.map(p => {
                          const active = draft.propositions.includes(p);
                          return (
                            <button
                              key={p}
                              onClick={() => setDraft({
                                ...draft,
                                propositions: active ? draft.propositions.filter(x => x !== p) : [...draft.propositions, p],
                              })}
                              className={cn(
                                "px-3 py-1.5 rounded-full text-xs font-semibold transition-colors",
                                active ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                              )}
                            >
                              {p}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {!["Leagues", "Over / Under", "Hit Rate", "Propositions"].includes(group) && (
                      <p className="text-xs text-muted-foreground">No active filters</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <h2 className="text-lg font-bold mb-4">Saved Templates</h2>
          {templates.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No saved templates yet</p>
          ) : (
            <div className="space-y-2">
              {templates.map((t, i) => (
                <button
                  key={i}
                  onClick={() => { setDraft({ ...t.filters }); setTab("current"); }}
                  className="w-full cosmic-card rounded-xl p-3 text-left hover:border-primary/30 transition-colors"
                >
                  <p className="text-sm font-semibold text-foreground">{t.name}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {t.filters.leagues.length > 0 ? t.filters.leagues.join(", ") : "All leagues"} · {t.filters.direction} · ≥{t.filters.hitRateMin}% hit rate
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bottom actions */}
      <div className="px-4 py-4 border-t border-border flex gap-3 safe-area-bottom">
        <button
          onClick={handleSave}
          className="flex-1 py-3 rounded-xl text-sm font-semibold border border-border text-foreground hover:bg-secondary transition-colors"
        >
          SAVE FILTERS
        </button>
        <button
          onClick={() => { onApply(draft); onClose(); }}
          className="flex-1 py-3 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
        >
          SHOW {resultCount} RESULTS
        </button>
      </div>
    </div>
  );
}
