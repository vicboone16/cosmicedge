import { useState, lazy, Suspense } from "react";
import { cn } from "@/lib/utils";
import { useIsAdmin } from "@/hooks/use-admin";
import { useSaveModel, type CustomModel } from "@/hooks/use-custom-models";
import { FlaskConical, Database, Loader2, Wrench, Plus } from "lucide-react";
import type { CustomModelData } from "@/lib/model-factors";

const ModelBuilderForm = lazy(() => import("@/components/models/ModelBuilderForm"));
const ModelRegistryPanel = lazy(() => import("@/components/models/ModelRegistryPanel"));

type Tab = "builder" | "registry";

export default function ModelWorkspacePage() {
  const { isAdmin, isLoading: adminLoading } = useIsAdmin();
  const [tab, setTab] = useState<Tab>("builder");
  const [editingModel, setEditingModel] = useState<(CustomModelData & { id?: string }) | undefined>();
  const saveMut = useSaveModel();

  if (adminLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <FlaskConical className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-semibold text-foreground">Model Workspace</p>
          <p className="text-xs text-muted-foreground mt-1">Admin access required. Coming soon for all users.</p>
        </div>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; icon: typeof FlaskConical }[] = [
    { key: "builder", label: editingModel?.id ? "Edit Model" : "New Model", icon: editingModel?.id ? Wrench : Plus },
    { key: "registry", label: "My Models", icon: Database },
  ];

  function handleSave(data: CustomModelData & { id?: string }) {
    saveMut.mutate(data, {
      onSuccess: () => {
        setEditingModel(undefined);
        setTab("registry");
      },
    });
  }

  function handleEdit(model: CustomModel) {
    setEditingModel({
      id: model.id,
      name: model.name,
      description: model.description ?? "",
      sport: model.sport,
      market_type: model.market_type,
      target_output: model.target_output,
      factors: model.factors as any,
      tags: model.tags ?? [],
      notes: model.notes ?? "",
    });
    setTab("builder");
  }

  function handleNewModel() {
    setEditingModel(undefined);
    setTab("builder");
  }

  return (
    <div className="min-h-screen">
      <header className="px-4 pt-12 pb-4 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="flex items-center gap-2 mb-2">
          <FlaskConical className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold font-display text-foreground">Model Workspace</h1>
        </div>
        <p className="text-[10px] text-muted-foreground mb-3">
          Build, manage, and execute custom prediction models
        </p>
        <div className="flex items-center gap-2">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => { if (t.key === "builder" && tab !== "builder") handleNewModel(); else setTab(t.key); }}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-full text-[10px] font-semibold transition-colors border whitespace-nowrap",
                tab === t.key
                  ? "bg-secondary border-border text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <t.icon className="h-3 w-3" />
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <div className="px-4 py-4">
        <Suspense fallback={<div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>}>
          {tab === "builder" && (
            <ModelBuilderForm
              key={editingModel?.id ?? "new"}
              initial={editingModel}
              onSave={handleSave}
              saving={saveMut.isPending}
            />
          )}
          {tab === "registry" && (
            <ModelRegistryPanel onEdit={handleEdit} />
          )}
        </Suspense>
      </div>
    </div>
  );
}
