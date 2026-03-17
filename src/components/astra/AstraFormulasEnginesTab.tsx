import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Cpu, FlaskConical, Play, Info, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DataSourceBadge } from "@/components/ui/DataSourceBadge";
import { InfoHint } from "@/components/ui/InfoHint";

interface Props {
  onRunInMachina?: (formulaSlug: string) => void;
}

/** Explain where each formula category is used in the app */
const CATEGORY_USAGE: Record<string, string> = {
  projection: "Used by Astra AI and Nebula engine to project player stat outputs. Feeds tracked props, edge scores, and live prop displays.",
  edge: "Determines Edge Score badges across Signal Lab, Slate Quick Props, and Prop Intelligence Drawer.",
  probability: "Calculates hit probabilities shown in every prop card and used by the Slip Optimizer.",
  simulation: "Powers Monte Carlo visualizations in the Prop Intelligence Drawer (P10/P90 distribution).",
  volatility: "Drives consistency/volatile archetype badges and risk grades in Astra assessments.",
  pace: "Feeds PacePulse game environment adjustments. Affects all projection-based outputs.",
  matchup: "Used by the Matchup Engine to adjust projections based on opponent defense quality.",
  astro: "Applied as overlay multipliers from TransitLift. Visible in Celestial Insights and Astra reasoning.",
  default: "General-purpose formula used across multiple engines.",
};

/** Mini instruction for the whole page */
const PAGE_INSTRUCTIONS = [
  "These formulas power the CosmicEdge prediction engine. They run automatically — you don't need to use them manually.",
  "Tap 'Run in Machina' (admin only) to test a formula with custom inputs.",
  "Variables shown are the inputs each formula needs. Most are fetched automatically from player/game data.",
  "If a formula shows ★ it is featured — core to the prediction pipeline.",
];

export default function AstraFormulasEnginesTab({ onRunInMachina }: Props) {
  const [expandedFormula, setExpandedFormula] = useState<string | null>(null);
  const [expandedEngine, setExpandedEngine] = useState<string | null>(null);

  const { data: formulas, isLoading: fLoading } = useQuery({
    queryKey: ["ce-formulas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ce_formulas")
        .select("*")
        .order("display_order")
        .order("formula_name");
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: engines, isLoading: eLoading } = useQuery({
    queryKey: ["ce-engines"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ce_engine_registry")
        .select("*")
        .eq("status", "active")
        .order("display_order")
        .order("engine_name");
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const isLoading = fLoading || eLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page-level instructions */}
      <div className="cosmic-card rounded-xl p-4 space-y-2 border-primary/20">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-primary shrink-0" />
          <h2 className="text-sm font-bold text-foreground">How to read this page</h2>
        </div>
        <ul className="space-y-1">
          {PAGE_INSTRUCTIONS.map((inst, i) => (
            <li key={i} className="text-xs text-muted-foreground leading-relaxed flex gap-2">
              <span className="text-primary font-bold shrink-0">•</span>
              <span>{inst}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Formulas section */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-bold text-foreground">Formulas</h2>
          <InfoHint text="Formulas define the math behind each prediction. They are used by engines to calculate projections, edge scores, and probabilities." />
          <DataSourceBadge source="runtime" compact />
          <span className="text-[10px] text-muted-foreground ml-auto">{formulas?.length ?? 0} registered</span>
        </div>

        {formulas && formulas.length > 0 ? (
          <div className="space-y-2">
            {formulas.map((f) => {
              const vars = f.variables && typeof f.variables === "object" && !Array.isArray(f.variables)
                ? Object.entries(f.variables as Record<string, string>)
                : [];
              const isExpanded = expandedFormula === f.id;
              const cat = (f.category ?? "default").toLowerCase();
              const usageNote = CATEGORY_USAGE[cat] || CATEGORY_USAGE.default;

              return (
                <div key={f.id} className="cosmic-card rounded-xl p-4 space-y-2 hover:border-primary/20 transition-colors">
                  <button
                    onClick={() => setExpandedFormula(isExpanded ? null : f.id)}
                    className="w-full flex items-center justify-between text-left"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="text-xs font-bold text-foreground truncate">{f.formula_name}</p>
                      {f.is_featured && (
                        <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-cosmic-gold/10 text-cosmic-gold font-semibold shrink-0">★ Core</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[9px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                        {f.category}
                      </span>
                      {isExpanded
                        ? <ChevronUp className="h-3 w-3 text-muted-foreground" />
                        : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
                    </div>
                  </button>

                  {/* Always show plain english summary */}
                  {f.plain_english && (
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {f.plain_english}
                    </p>
                  )}

                  {/* Usage note */}
                  <p className="text-[11px] text-primary/70 leading-relaxed italic">
                    Used in: {usageNote}
                  </p>

                  {isExpanded && (
                    <div className="space-y-3 pt-2 border-t border-border/50">
                      {/* Formula expression */}
                      {f.formula_text && (
                        <div>
                          <p className="text-[10px] font-semibold text-foreground/70 mb-1">Formula</p>
                          <code className="block text-xs bg-secondary/50 rounded-lg px-3 py-2 text-primary font-mono whitespace-pre-wrap break-words leading-relaxed">
                            {f.formula_text}
                          </code>
                        </div>
                      )}

                      {/* Variables */}
                      {vars.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold text-foreground/70 mb-1.5">Variables</p>
                          <div className="space-y-1">
                            {vars.map(([key, val]) => (
                              <div key={key} className="flex items-start gap-2 text-xs">
                                <code className="font-mono font-bold text-primary shrink-0">{key}</code>
                                <span className="text-muted-foreground">{val}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Should you edit this? */}
                      <div className="bg-muted/30 rounded-lg p-2.5">
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          <strong className="text-foreground/80">Should you change this?</strong> No — this formula runs automatically. Constants are tuned for production accuracy. Only adjust via Machina if you're experimenting with model weights.
                        </p>
                      </div>

                      {onRunInMachina && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-7 px-3 gap-1.5"
                          onClick={() => onRunInMachina(f.slug || f.formula_name)}
                        >
                          <Play className="h-3 w-3" /> Test in Machina
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No formulas available.</p>
        )}
      </div>

      {/* Engines section */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-bold text-foreground">Engines</h2>
          <InfoHint text="Engines are the runtime processors that combine formulas with live data to produce predictions. They run automatically during prop evaluation." />
          <DataSourceBadge source="runtime" compact />
          <span className="text-[10px] text-muted-foreground ml-auto">{engines?.length ?? 0} active</span>
        </div>

        <div className="bg-muted/30 rounded-lg p-3 mb-2">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Engines are the runtime processors that take formulas, data, and context to produce predictions. They run automatically during prop evaluation and live game analysis. You do not need to invoke them manually.
          </p>
        </div>

        {engines && engines.length > 0 ? (
          <div className="space-y-2">
            {engines.map((e) => {
              const inputs = Array.isArray(e.input_objects) ? (e.input_objects as string[]) : [];
              const outputs = Array.isArray(e.output_objects) ? (e.output_objects as string[]) : [];
              const isExpanded = expandedEngine === e.id;

              return (
                <div key={e.id} className="cosmic-card rounded-xl p-4 space-y-2">
                  <button
                    onClick={() => setExpandedEngine(isExpanded ? null : e.id)}
                    className="w-full flex items-center justify-between text-left"
                  >
                    <p className="text-xs font-bold text-foreground">{e.engine_name}</p>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[9px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                        {e.layer}
                      </span>
                      {e.version && (
                        <span className="text-[10px] text-muted-foreground">v{e.version}</span>
                      )}
                      {isExpanded
                        ? <ChevronUp className="h-3 w-3 text-muted-foreground" />
                        : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
                    </div>
                  </button>

                  {e.description && (
                    <p className="text-xs text-muted-foreground leading-relaxed">{e.description}</p>
                  )}

                  {isExpanded && (
                    <div className="space-y-2 pt-2 border-t border-border/50">
                      {e.purpose && (
                        <p className="text-xs text-foreground/70 leading-relaxed italic">{e.purpose}</p>
                      )}

                      {inputs.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold text-foreground/70 mb-1">Inputs</p>
                          <div className="flex flex-wrap gap-1.5">
                            {inputs.map((inp) => (
                              <span key={inp} className="text-[10px] px-2 py-1 rounded-lg bg-secondary text-muted-foreground">
                                {inp}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {outputs.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold text-primary mb-1">Outputs</p>
                          <div className="flex flex-wrap gap-1.5">
                            {outputs.map((out) => (
                              <span key={out} className="text-[10px] px-2 py-1 rounded-lg bg-primary/10 text-primary">
                                {out}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="bg-muted/30 rounded-lg p-2.5">
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          <strong className="text-foreground/80">Status:</strong> Active · runs automatically during prop evaluation
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No engines registered.</p>
        )}
      </div>
    </div>
  );
}
