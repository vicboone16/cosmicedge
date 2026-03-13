import { useState, lazy, Suspense } from "react";
import { cn } from "@/lib/utils";
import { useIsAdmin } from "@/hooks/use-admin";
import { useSaveModel, type CustomModel } from "@/hooks/use-custom-models";
import {
  Cpu, Loader2, LayoutDashboard, Brain, Wrench, History,
  Database, Play, Pencil, BookOpen
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { CustomModelData } from "@/lib/model-factors";

const MachinaOverview = lazy(() => import("@/components/machina/MachinaOverview"));
const PredictionStudioPanel = lazy(() => import("@/components/models/PredictionStudioPanel"));
const ModelBuilderForm = lazy(() => import("@/components/models/ModelBuilderForm"));
const BacktestConsolePanel = lazy(() => import("@/components/models/BacktestConsolePanel"));
const ModelRegistryPanel = lazy(() => import("@/components/models/ModelRegistryPanel"));
const MachinaEngineRunner = lazy(() => import("@/components/machina/MachinaEngineRunner"));
const MachinaManualInput = lazy(() => import("@/components/machina/MachinaManualInput"));
const MachinaFormulaReference = lazy(() => import("@/components/machina/MachinaFormulaReference"));

type Tab = "overview" | "studio" | "builder" | "backtest" | "saved" | "engines" | "manual" | "reference";

const TABS: { key: Tab; label: string; icon: typeof Cpu }[] = [
  { key: "overview",  label: "Overview",    icon: LayoutDashboard },
  { key: "studio",    label: "AI Studio",   icon: Brain },
  { key: "builder",   label: "Builder",     icon: Wrench },
  { key: "backtest",  label: "Backtest",    icon: History },
  { key: "saved",     label: "Models",      icon: Database },
  { key: "engines",   label: "Engines",     icon: Play },
  { key: "manual",    label: "Manual",      icon: Pencil },
  { key: "reference", label: "Reference",   icon: BookOpen },
];

export default function MachinaPage() {
  const { isAdmin, isLoading: adminLoading } = useIsAdmin();
  const [tab, setTab] = useState<Tab>("overview");
  const [editingModel, setEditingModel] = useState<(CustomModelData & { id?: string }) | undefined>();
  const saveMut = useSaveModel();

  if (adminLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <Cpu className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-semibold text-foreground">Machina</p>
          <p className="text-xs text-muted-foreground mt-1">Admin access required.</p>
        </div>
      </div>
    );
  }

  function handleSave(data: CustomModelData & { id?: string }) {
    saveMut.mutate(data, {
      onSuccess: () => {
        setEditingModel(undefined);
        setTab("saved");
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

  function handleRunFromRegistry(_model: CustomModel) {
    setTab("studio");
  }

  function handleNewModel() {
    setEditingModel(undefined);
    setTab("builder");
  }

  function handleNavigate(t: string) {
    setTab(t as Tab);
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="px-4 pt-12 pb-4 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="flex items-center gap-2 mb-1">
          <Cpu className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold font-display text-foreground">Machina</h1>
          <Badge variant="outline" className="text-[8px] px-1.5 py-0 h-4 font-bold bg-primary/10 text-primary border-primary/20">Admin</Badge>
        </div>
        <p className="text-[10px] text-muted-foreground mb-3">
          Advanced model lab · Build, execute, backtest & compare prediction models
        </p>

        {/* Tab bar */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => {
                if (t.key === "builder" && tab !== "builder") handleNewModel();
                else setTab(t.key);
              }}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-semibold transition-colors border whitespace-nowrap shrink-0",
                tab === t.key
                  ? "bg-foreground text-background border-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/50"
              )}
            >
              <t.icon className="h-3 w-3" />
              {t.label}
            </button>
          ))}
        </div>
      </header>

      {/* Content */}
      <div className="px-4 py-4">
        <Suspense fallback={<div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>}>
          {tab === "overview" && <MachinaOverview onNavigate={handleNavigate} />}
          {tab === "studio" && <PredictionStudioPanel />}
          {tab === "builder" && (
            <ModelBuilderForm
              key={editingModel?.id ?? "new"}
              initial={editingModel}
              onSave={handleSave}
              saving={saveMut.isPending}
            />
          )}
          {tab === "backtest" && <BacktestConsolePanel />}
          {tab === "saved" && <ModelRegistryPanel onEdit={handleEdit} onRun={handleRunFromRegistry} />}
          {tab === "engines" && <MachinaEngineRunner />}
          {tab === "manual" && <MachinaManualInput />}
          {tab === "reference" && <MachinaFormulaReference />}
        </Suspense>
      </div>
    </div>
  );
}
