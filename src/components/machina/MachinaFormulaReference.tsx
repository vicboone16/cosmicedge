import { useState } from "react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FACTOR_LIBRARY } from "@/lib/model-factors";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Search, BookOpen, Sigma, Database, ChevronDown, ChevronUp } from "lucide-react";

const UNIVERSAL_LEGEND = [
  { symbol: "μ", name: "Projected Mean", desc: "The model's projected average output for a stat" },
  { symbol: "σ", name: "Standard Deviation", desc: "Spread of recent performance around the mean" },
  { symbol: "L", name: "Sportsbook Line", desc: "The posted prop/total/spread line" },
  { symbol: "P", name: "Probability", desc: "Model-estimated chance of an outcome" },
  { symbol: "k", name: "Calibration Constant", desc: "Tuning scalar for logistic transform (default 1.5)" },
  { symbol: "N", name: "Sample Size", desc: "Number of games in the lookback window" },
  { symbol: "xᵢ", name: "Observed Value", desc: "Actual stat value in game i" },
  { symbol: "Δ", name: "Delta / Difference", desc: "Change between two values (e.g., edge = μ - L)" },
  { symbol: "w", name: "Weight", desc: "Factor importance (0-100 scale in model builder)" },
  { symbol: "z", name: "Z-Score", desc: "Standardized edge: (μ - L) / σ" },
];

export default function MachinaFormulaReference() {
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: formulas, isLoading: formulasLoading } = useQuery({
    queryKey: ["machina-formulas"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ce_formulas")
        .select("*")
        .order("display_order")
        .order("formula_name");
      return data ?? [];
    },
  });

  const { data: engines } = useQuery({
    queryKey: ["machina-engines-ref"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ce_engine_registry")
        .select("engine_key, engine_name, description, purpose, input_objects, output_objects, layer, status")
        .order("display_order");
      return data ?? [];
    },
  });

  const filteredFormulas = formulas?.filter((f: any) =>
    !search || f.formula_name.toLowerCase().includes(search.toLowerCase()) || (f.category ?? "").toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  const filteredFactors = FACTOR_LIBRARY.filter((f) =>
    !search || f.name.toLowerCase().includes(search.toLowerCase()) || f.key.toLowerCase().includes(search.toLowerCase())
  );

  if (formulasLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search formulas, variables, factors..." className="pl-8 bg-secondary text-xs h-9" />
      </div>

      {/* Universal Variable Legend */}
      <section>
        <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5 mb-2">
          <Sigma className="h-3.5 w-3.5 text-primary" /> Universal Variable Legend
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {UNIVERSAL_LEGEND.map((v) => (
            <div key={v.symbol} className="px-3 py-2 rounded-lg bg-secondary/30 border border-border/50">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold font-mono text-primary">{v.symbol}</span>
                <span className="text-[10px] font-semibold text-foreground">{v.name}</span>
              </div>
              <p className="text-[9px] text-muted-foreground mt-0.5">{v.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Formulas */}
      <section>
        <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5 mb-2">
          <BookOpen className="h-3.5 w-3.5 text-primary" /> Formula Registry ({filteredFormulas.length})
        </h3>
        <div className="space-y-2">
          {filteredFormulas.map((f: any) => {
            const isOpen = expandedId === f.id;
            return (
              <div key={f.id} className="rounded-xl border border-border bg-card">
                <button onClick={() => setExpandedId(isOpen ? null : f.id)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-foreground">{f.formula_name}</span>
                      {f.category && <Badge variant="outline" className="text-[8px]">{f.category}</Badge>}
                      {f.is_featured && <Badge className="text-[7px] bg-cosmic-gold">Featured</Badge>}
                    </div>
                    {f.plain_english && <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{f.plain_english}</p>}
                  </div>
                  {isOpen ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
                    {f.formula_text && (
                      <div>
                        <span className="text-[10px] font-bold text-muted-foreground uppercase">Equation</span>
                        <p className="text-xs font-mono text-primary mt-0.5 break-all">{f.formula_text}</p>
                      </div>
                    )}
                    {f.plain_english && (
                      <div>
                        <span className="text-[10px] font-bold text-muted-foreground uppercase">Plain English</span>
                        <p className="text-xs text-muted-foreground mt-0.5">{f.plain_english}</p>
                      </div>
                    )}
                    {f.variables && typeof f.variables === "object" && (
                      <div>
                        <span className="text-[10px] font-bold text-muted-foreground uppercase">Variables</span>
                        <div className="space-y-1 mt-1">
                          {Object.entries(f.variables as Record<string, string>).map(([k, v]) => (
                            <div key={k} className="flex items-center gap-2 text-[10px]">
                              <span className="font-mono font-bold text-primary w-10">{k}</span>
                              <span className="text-muted-foreground">{v}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {f.example_input && (
                      <div>
                        <span className="text-[10px] font-bold text-muted-foreground uppercase">Example</span>
                        <pre className="text-[10px] font-mono text-muted-foreground mt-0.5 whitespace-pre-wrap">{JSON.stringify(f.example_input, null, 2)}</pre>
                        {f.example_output && <p className="text-[10px] font-mono text-cosmic-green mt-1">→ {JSON.stringify(f.example_output)}</p>}
                      </div>
                    )}
                    {f.notes && (
                      <p className="text-[10px] text-muted-foreground italic">{f.notes}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {filteredFormulas.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">No formulas match your search.</p>
          )}
        </div>
      </section>

      {/* Factor Source Map */}
      <section>
        <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5 mb-2">
          <Database className="h-3.5 w-3.5 text-primary" /> Factor Source Map ({filteredFactors.length})
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-[10px]">
            <thead className="bg-secondary/50">
              <tr>
                <th className="text-left px-3 py-2 text-muted-foreground font-semibold">Factor</th>
                <th className="text-left px-2 py-2 text-muted-foreground font-semibold">Category</th>
                <th className="text-left px-2 py-2 text-muted-foreground font-semibold">Source Table</th>
                <th className="text-left px-2 py-2 text-muted-foreground font-semibold">Metric</th>
                <th className="text-center px-2 py-2 text-muted-foreground font-semibold">Live</th>
                <th className="text-right px-3 py-2 text-muted-foreground font-semibold">Default W</th>
              </tr>
            </thead>
            <tbody>
              {filteredFactors.map((f) => (
                <tr key={f.key} className="border-t border-border/50">
                  <td className="px-3 py-1.5 text-foreground font-medium">{f.name}</td>
                  <td className="px-2 py-1.5"><Badge variant="outline" className="text-[8px]">{f.category}</Badge></td>
                  <td className="px-2 py-1.5 text-muted-foreground font-mono">{f.source ?? "—"}</td>
                  <td className="px-2 py-1.5 text-muted-foreground font-mono">{f.sourceMetric ?? "—"}</td>
                  <td className="text-center px-2 py-1.5">{f.live ? <span className="text-cosmic-green">●</span> : <span className="text-muted-foreground">○</span>}</td>
                  <td className="text-right px-3 py-1.5 font-mono text-foreground">{f.defaultWeight}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Engine Registry */}
      {engines && engines.length > 0 && (
        <section>
          <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5 mb-2">
            <Sigma className="h-3.5 w-3.5 text-primary" /> Engine Registry ({engines.length})
          </h3>
          <div className="space-y-2">
            {engines.map((e: any) => (
              <div key={e.engine_key} className="px-3 py-2.5 rounded-lg bg-secondary/30 border border-border/50">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">{e.engine_name}</span>
                  <Badge variant="outline" className="text-[8px]">{e.layer ?? "core"}</Badge>
                  <Badge variant="outline" className={cn("text-[8px]", e.status === "active" ? "text-cosmic-green border-cosmic-green/30" : "")}>{e.status}</Badge>
                </div>
                {e.description && <p className="text-[10px] text-muted-foreground mt-0.5">{e.description}</p>}
                {e.purpose && <p className="text-[9px] text-muted-foreground italic mt-0.5">{e.purpose}</p>}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
