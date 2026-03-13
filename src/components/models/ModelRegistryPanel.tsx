import { useState } from "react";
import { cn } from "@/lib/utils";
import { useCustomModels, useDeleteModel, useToggleModelActive, useDuplicateModel, type CustomModel } from "@/hooks/use-custom-models";
import { FACTOR_LIBRARY, MARKET_TYPES, TARGET_OUTPUTS } from "@/lib/model-factors";
import { Badge } from "@/components/ui/badge";
import { Power, Copy, Trash2, Pencil, ChevronDown, ChevronUp, Loader2, FlaskConical } from "lucide-react";

interface Props {
  onEdit: (model: CustomModel) => void;
  onRun?: (model: CustomModel) => void;
}

export default function ModelRegistryPanel({ onEdit, onRun }: Props) {
  const { data: models, isLoading } = useCustomModels();
  const deleteMut = useDeleteModel();
  const toggleMut = useToggleModelActive();
  const dupMut = useDuplicateModel();
  const [expanded, setExpanded] = useState<string | null>(null);

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;

  if (!models?.length) {
    return (
      <div className="text-center py-12">
        <FlaskConical className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">No saved models yet</p>
        <p className="text-[10px] text-muted-foreground mt-1">Create your first model in the Builder tab</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {models.map((m) => {
        const isOpen = expanded === m.id;
        const enabledFactors = (m.factors as any[]).filter((f: any) => f.enabled);
        const marketLabel = MARKET_TYPES.find((mt) => mt.value === m.market_type)?.label ?? m.market_type;
        const outputLabel = TARGET_OUTPUTS.find((t) => t.value === m.target_output)?.label ?? m.target_output;

        return (
          <div key={m.id} className={cn("rounded-xl border transition-all", m.is_active ? "border-primary/30 bg-card" : "border-border bg-secondary/30")}>
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={() => setExpanded(isOpen ? null : m.id)}>
              <div className={cn("h-2 w-2 rounded-full shrink-0", m.is_active ? "bg-cosmic-green" : "bg-muted-foreground/30")} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground truncate">{m.name}</span>
                  <Badge variant="outline" className="text-[8px]">{m.sport}</Badge>
                  <Badge variant="outline" className="text-[8px]">{marketLabel}</Badge>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">{enabledFactors.length} factors · {outputLabel}</p>
              </div>
              {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </div>

            {/* Expanded Details */}
            {isOpen && (
              <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
                {m.description && <p className="text-xs text-muted-foreground">{m.description}</p>}

                {/* Factors preview */}
                <div>
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Active Factors</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {enabledFactors.map((f: any) => {
                      const meta = FACTOR_LIBRARY.find((fl) => fl.key === f.key);
                      return (
                        <Badge key={f.key} variant="secondary" className="text-[9px] gap-1">
                          {meta?.name ?? f.key}
                          <span className="text-muted-foreground font-mono">w{f.weight}</span>
                        </Badge>
                      );
                    })}
                  </div>
                </div>

                {/* Tags */}
                {m.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {m.tags.map((t) => <Badge key={t} variant="outline" className="text-[8px]">{t}</Badge>)}
                  </div>
                )}

                {/* Notes */}
                {m.notes && <p className="text-[10px] text-muted-foreground italic">{m.notes}</p>}

                {/* Actions */}
                <div className="flex items-center gap-2 pt-1">
                  <button onClick={() => toggleMut.mutate({ id: m.id, is_active: !m.is_active })} className={cn("flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold border transition-colors", m.is_active ? "border-cosmic-green/30 text-cosmic-green hover:bg-cosmic-green/10" : "border-border text-muted-foreground hover:text-foreground")}>
                    <Power className="h-3 w-3" /> {m.is_active ? "Active" : "Activate"}
                  </button>
                  <button onClick={() => onEdit(m)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold border border-border text-muted-foreground hover:text-foreground transition-colors">
                    <Pencil className="h-3 w-3" /> Edit
                  </button>
                  <button onClick={() => dupMut.mutate(m)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold border border-border text-muted-foreground hover:text-foreground transition-colors">
                    <Copy className="h-3 w-3" /> Duplicate
                  </button>
                  {onRun && (
                    <button onClick={() => onRun(m)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
                      <FlaskConical className="h-3 w-3" /> Run
                    </button>
                  )}
                  <button onClick={() => { if (confirm("Delete this model?")) deleteMut.mutate(m.id); }} className="ml-auto flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors">
                    <Trash2 className="h-3 w-3" /> Delete
                  </button>
                </div>

                <p className="text-[9px] text-muted-foreground">Created {new Date(m.created_at).toLocaleDateString()} · Updated {new Date(m.updated_at).toLocaleDateString()}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
