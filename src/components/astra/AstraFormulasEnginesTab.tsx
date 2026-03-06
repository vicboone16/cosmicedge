import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Cpu, FlaskConical } from "lucide-react";

export default function AstraFormulasEnginesTab() {
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
    <div className="space-y-5">
      {/* Formulas section */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-bold text-foreground">Formulas</h2>
        </div>

        {formulas && formulas.length > 0 ? (
          <div className="space-y-2">
            {formulas.map((f) => {
              const vars = f.variables && typeof f.variables === "object" && !Array.isArray(f.variables)
                ? Object.entries(f.variables as Record<string, string>)
                : [];
              return (
                <div key={f.id} className="cosmic-card rounded-lg p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-foreground">{f.formula_name}</p>
                    <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">
                      {f.category}
                    </span>
                  </div>
                  {f.formula_text && (
                    <code className="block text-[10px] bg-secondary/50 rounded px-2 py-1 text-primary font-mono break-all">
                      {f.formula_text}
                    </code>
                  )}
                  {f.plain_english && (
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      {f.plain_english}
                    </p>
                  )}
                  {vars.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {vars.map(([key, val]) => (
                        <span key={key} className="text-[8px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                          {key}: {val}
                        </span>
                      ))}
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
        </div>

        {engines && engines.length > 0 ? (
          <div className="space-y-2">
            {engines.map((e) => {
              const inputs = Array.isArray(e.input_objects) ? (e.input_objects as string[]) : [];
              const outputs = Array.isArray(e.output_objects) ? (e.output_objects as string[]) : [];
              return (
                <div key={e.id} className="cosmic-card rounded-lg p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-foreground">{e.engine_name}</p>
                    <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">
                      {e.layer}
                    </span>
                  </div>
                  {e.description && (
                    <p className="text-[10px] text-muted-foreground leading-relaxed">{e.description}</p>
                  )}
                  {e.purpose && (
                    <p className="text-[10px] text-foreground/70 leading-relaxed italic">{e.purpose}</p>
                  )}
                  {inputs.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      <span className="text-[8px] text-muted-foreground mr-1">In:</span>
                      {inputs.map((inp) => (
                        <span key={inp} className="text-[8px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">
                          {inp}
                        </span>
                      ))}
                    </div>
                  )}
                  {outputs.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      <span className="text-[8px] text-primary mr-1">Out:</span>
                      {outputs.map((out) => (
                        <span key={out} className="text-[8px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                          {out}
                        </span>
                      ))}
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
