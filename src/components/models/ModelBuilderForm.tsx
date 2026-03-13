import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { FACTOR_LIBRARY, MARKET_TYPES, TARGET_OUTPUTS, SPORTS, buildDefaultFactors, type FactorConfig, type CustomModelData } from "@/lib/model-factors";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Save, RotateCcw, Beaker, Zap, Sparkles, Shield, Brain } from "lucide-react";

const CATEGORY_META: Record<string, { label: string; icon: typeof Beaker; color: string }> = {
  base:        { label: "Base Projection",  icon: Beaker,   color: "text-primary" },
  environment: { label: "Environment",      icon: Zap,      color: "text-accent" },
  adjustment:  { label: "Adjustment",       icon: Shield,   color: "text-cosmic-gold" },
  astro:       { label: "Astro",            icon: Sparkles, color: "text-cosmic-lavender" },
  advanced:    { label: "Advanced",         icon: Brain,    color: "text-cosmic-cyan" },
};

interface Props {
  initial?: CustomModelData & { id?: string };
  onSave: (model: CustomModelData & { id?: string }) => void;
  saving?: boolean;
}

export default function ModelBuilderForm({ initial, onSave, saving }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [sport, setSport] = useState(initial?.sport ?? "NBA");
  const [marketType, setMarketType] = useState(initial?.market_type ?? "player_prop");
  const [targetOutput, setTargetOutput] = useState(initial?.target_output ?? "over_under");
  const [factors, setFactors] = useState<FactorConfig[]>(initial?.factors ?? buildDefaultFactors());
  const [tags, setTags] = useState(initial?.tags?.join(", ") ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const enabledCount = factors.filter((f) => f.enabled).length;
  const totalWeight = factors.filter((f) => f.enabled).reduce((s, f) => s + f.weight, 0);

  const grouped = useMemo(() => {
    const groups: Record<string, (typeof FACTOR_LIBRARY[0] & { config: FactorConfig })[]> = {};
    for (const fl of FACTOR_LIBRARY) {
      const cfg = factors.find((f) => f.key === fl.key) ?? { key: fl.key, weight: fl.defaultWeight, enabled: false };
      if (!groups[fl.category]) groups[fl.category] = [];
      groups[fl.category].push({ ...fl, config: cfg });
    }
    return groups;
  }, [factors]);

  function updateFactor(key: string, patch: Partial<FactorConfig>) {
    setFactors((prev) =>
      prev.map((f) => (f.key === key ? { ...f, ...patch } : f))
    );
  }

  function resetFactors() {
    setFactors(buildDefaultFactors());
  }

  function handleSave() {
    if (!name.trim()) return;
    onSave({
      id: initial?.id,
      name: name.trim(),
      description,
      sport,
      market_type: marketType,
      target_output: targetOutput,
      factors,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      notes,
    });
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-xs font-semibold text-muted-foreground">Model Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My Prop Model v1" className="bg-secondary" />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold text-muted-foreground">Description</label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="High-pace PRA model" className="bg-secondary" />
        </div>
      </div>

      {/* ── Selectors ── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Sport</label>
          <div className="flex flex-wrap gap-1.5">
            {SPORTS.map((s) => (
              <button key={s.value} onClick={() => setSport(s.value)} className={cn("px-2.5 py-1 rounded-full text-[10px] font-semibold border transition-colors", sport === s.value ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/30")}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Market</label>
          <select value={marketType} onChange={(e) => setMarketType(e.target.value)} className="w-full bg-secondary border border-border rounded-lg px-2 py-1.5 text-xs text-foreground">
            {MARKET_TYPES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Output</label>
          <select value={targetOutput} onChange={(e) => setTargetOutput(e.target.value)} className="w-full bg-secondary border border-border rounded-lg px-2 py-1.5 text-xs text-foreground">
            {TARGET_OUTPUTS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>

      {/* ── Stats bar ── */}
      <div className="flex items-center gap-4 px-3 py-2 rounded-lg bg-secondary/50 border border-border">
        <span className="text-[10px] text-muted-foreground">{enabledCount} factors active</span>
        <span className="text-[10px] text-muted-foreground">Total weight: <strong className="text-foreground">{totalWeight}</strong></span>
        <button onClick={resetFactors} className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
          <RotateCcw className="h-3 w-3" /> Reset
        </button>
      </div>

      {/* ── Factor Library ── */}
      <div className="space-y-5">
        {Object.entries(grouped).map(([cat, items]) => {
          const meta = CATEGORY_META[cat];
          const Icon = meta.icon;
          return (
            <div key={cat}>
              <div className="flex items-center gap-2 mb-2">
                <Icon className={cn("h-3.5 w-3.5", meta.color)} />
                <span className="text-xs font-bold text-foreground">{meta.label}</span>
                <span className="text-[10px] text-muted-foreground">({items.filter((i) => i.config.enabled).length}/{items.length})</span>
              </div>
              <div className="space-y-2">
                {items.map((item) => (
                  <div key={item.key} className={cn("flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all", item.config.enabled ? "bg-card border-border" : "bg-secondary/30 border-transparent opacity-60")}>
                    <Switch
                      checked={item.config.enabled}
                      onCheckedChange={(v) => updateFactor(item.key, { enabled: v })}
                      className="scale-75"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-foreground truncate">{item.name}</span>
                        {item.live && <Badge variant="outline" className="text-[8px] px-1 py-0 border-cosmic-green/30 text-cosmic-green">LIVE</Badge>}
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate">{item.description}</p>
                    </div>
                    <div className="flex items-center gap-2 w-40 shrink-0">
                      <Slider
                        min={0} max={100} step={1}
                        value={[item.config.weight]}
                        onValueChange={([v]) => updateFactor(item.key, { weight: v })}
                        disabled={!item.config.enabled}
                        className="flex-1"
                      />
                      <span className="text-[10px] font-mono text-muted-foreground w-7 text-right">{item.config.weight}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Tags + Notes ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-muted-foreground">Tags (comma-separated)</label>
          <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="nba, props, pace-heavy" className="bg-secondary text-xs" />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-muted-foreground">Notes</label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Testing high-pace factor emphasis" className="bg-secondary text-xs" />
        </div>
      </div>

      {/* ── Save ── */}
      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving || !name.trim()} className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50 transition-opacity hover:opacity-90">
          <Save className="h-4 w-4" />
          {saving ? "Saving…" : initial?.id ? "Update Model" : "Save Model"}
        </button>
      </div>
    </div>
  );
}
