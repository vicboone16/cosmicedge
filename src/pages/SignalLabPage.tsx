import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { FlaskConical, TrendingUp, Flame, Activity, Shield, Sparkles, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getPropLabel, getEdgeTier, type TopProp } from "@/hooks/use-top-props";
import { usePropDrawer } from "@/hooks/use-prop-drawer";

const SIGNAL_TABS = [
  { key: "streaks", label: "Over Streaks", icon: Flame },
  { key: "momentum", label: "Momentum", icon: TrendingUp },
  { key: "usage", label: "Usage Shift", icon: Activity },
  { key: "defense", label: "Defense", icon: Shield },
  { key: "astro", label: "Astro Signals", icon: Sparkles },
] as const;

type SignalTab = typeof SIGNAL_TABS[number]["key"];

export default function SignalLabPage() {
  const { openProp } = usePropDrawer();
  const [activeTab, setActiveTab] = useState<SignalTab>("streaks");
  const [search, setSearch] = useState("");

  // Fetch top overlay props to derive signal data
  const { data: overlays, isLoading } = useQuery({
    queryKey: ["signal-lab-overlays"],
    queryFn: async () => {
      const now = new Date();
      const start = new Date(now); start.setHours(0, 0, 0, 0);
      const end = new Date(now); end.setDate(end.getDate() + 2);
      const { data } = await supabase
        .from("np_v_prop_overlay" as any)
        .select("*")
        .gte("game_start_time", start.toISOString())
        .lte("game_start_time", end.toISOString())
        .order("edge_score_v11", { ascending: false, nullsFirst: false } as any)
        .order("edge_score", { ascending: false })
        .limit(200);
      return (data || []) as any[];
    },
    staleTime: 60_000,
  });

  const filtered = useMemo(() => {
    if (!overlays) return [];
    let items = overlays;
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(o =>
        (o.player_name || "").toLowerCase().includes(q) ||
        (o.player_team || "").toLowerCase().includes(q)
      );
    }
    return items;
  }, [overlays, search]);

  // Derive signal-specific lists
  const streakCards = useMemo(() =>
    filtered.filter(o => o.streak != null && o.streak >= 3).sort((a, b) => (b.streak ?? 0) - (a.streak ?? 0)).slice(0, 30),
    [filtered]
  );
  const momentumCards = useMemo(() =>
    filtered.filter(o => o.hit_l10 != null).sort((a, b) => Math.abs((b.hit_l10 ?? 0) - 0.5) - Math.abs((a.hit_l10 ?? 0) - 0.5)).slice(0, 30),
    [filtered]
  );
  const usageCards = useMemo(() =>
    filtered.filter(o => o.mu > 0).sort((a, b) => (b.edge_score_v11 ?? b.edge_score) - (a.edge_score_v11 ?? a.edge_score)).slice(0, 30),
    [filtered]
  );
  const defenseCards = useMemo(() =>
    filtered.sort((a, b) => (b.edge_score_v11 ?? b.edge_score) - (a.edge_score_v11 ?? a.edge_score)).slice(0, 30),
    [filtered]
  );
  const astroCards = useMemo(() =>
    filtered.filter(o => o.astro && typeof o.astro === "object" && Object.keys(o.astro).length > 0).slice(0, 30),
    [filtered]
  );

  function getActiveCards(): any[] {
    switch (activeTab) {
      case "streaks": return streakCards;
      case "momentum": return momentumCards;
      case "usage": return usageCards;
      case "defense": return defenseCards;
      case "astro": return astroCards;
    }
  }

  const cards = getActiveCards();

  return (
    <div className="min-h-screen pb-24">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/50 px-4 pt-12 pb-3">
        <div className="flex items-center gap-2 mb-1">
          <FlaskConical className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-xl font-bold font-display tracking-tight">Signal Lab</h1>
            <p className="text-[10px] text-muted-foreground">Trends, streaks, momentum, and model signals</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative mt-2 mb-3">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search players or teams..." className="pl-8 h-8 text-xs" />
        </div>

        {/* Signal tabs */}
        <div className="flex gap-1 overflow-x-auto no-scrollbar -mx-4 px-4">
          {SIGNAL_TABS.map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={cn(
                  "flex items-center gap-1 px-3 py-1.5 rounded-full text-[10px] font-semibold transition-colors whitespace-nowrap shrink-0",
                  activeTab === t.key
                    ? "bg-foreground text-background"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-3 w-3" />
                {t.label}
              </button>
            );
          })}
        </div>
      </header>

      <div className="px-4 py-4 space-y-3">
        {isLoading ? (
          <div className="text-center py-12">
            <FlaskConical className="h-6 w-6 text-primary mx-auto mb-2 animate-pulse" />
            <p className="text-sm text-muted-foreground">Analyzing signals...</p>
          </div>
        ) : cards.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-muted-foreground">No signals detected for this category</p>
            <p className="text-xs text-muted-foreground mt-1">Check back closer to game time</p>
          </div>
        ) : (
          cards.map((o: any) => (
            <SignalCard key={o.id} overlay={o} tab={activeTab} onTap={() => openProp(o as TopProp)} />
          ))
        )}
      </div>
    </div>
  );
}

function SignalCard({ overlay, tab, onTap }: { overlay: any; tab: SignalTab; onTap: () => void }) {
  const edgeScore = overlay.edge_score_v11 ?? overlay.edge_score ?? 0;
  const tier = getEdgeTier(edgeScore);
  const propLabel = getPropLabel(overlay.prop_type || "");

  const signalDetail = (() => {
    switch (tab) {
      case "streaks":
        return `${overlay.streak ?? 0} straight over · Hit L10: ${((overlay.hit_l10 ?? 0) * 100).toFixed(0)}%`;
      case "momentum":
        const hitPct = ((overlay.hit_l10 ?? 0) * 100).toFixed(0);
        return `L10 hit rate: ${hitPct}% · Projection: ${overlay.mu?.toFixed(1) ?? "—"}`;
      case "usage":
        return `Proj: ${overlay.mu?.toFixed(1) ?? "—"} vs Line: ${overlay.line ?? "—"} · Edge: ${edgeScore.toFixed(0)}`;
      case "defense":
        return `Proj: ${overlay.mu?.toFixed(1) ?? "—"} vs Line: ${overlay.line ?? "—"} · σ: ${overlay.sigma?.toFixed(1) ?? "—"}`;
      case "astro":
        const astro = overlay.astro;
        if (!astro || typeof astro !== "object") return "Astro context available";
        const keys = Object.keys(astro).slice(0, 3);
        return keys.map(k => `${k}: ${JSON.stringify(astro[k])}`).join(" · ") || "Astro active";
    }
  })();

  return (
    <button onClick={onTap} className="w-full cosmic-card rounded-xl p-3 text-left hover:border-primary/30 transition-colors space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <span className="text-xs font-semibold text-foreground truncate block">{overlay.player_name}</span>
          <span className="text-[10px] text-muted-foreground">
            {overlay.player_team}
            {overlay.home_abbr && overlay.away_abbr && ` · ${overlay.away_abbr} @ ${overlay.home_abbr}`}
          </span>
        </div>
        <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0 h-4 font-bold shrink-0", tier.className)}>
          {edgeScore.toFixed(0)} {tier.label}
        </Badge>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold text-muted-foreground uppercase">{propLabel}</span>
        <span className="text-sm font-bold tabular-nums">{overlay.line != null ? Number(overlay.line) : "—"}</span>
        <span className="text-[10px] text-muted-foreground">→ {overlay.mu?.toFixed(1)}</span>
      </div>
      <p className="text-[10px] text-muted-foreground">{signalDetail}</p>
      <div className="flex gap-2 pt-1">
        <span className="text-[9px] text-primary font-semibold">View Details →</span>
      </div>
    </button>
  );
}
