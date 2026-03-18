import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { resolveOverlayPlayerNames } from "@/lib/resolve-player-names";
import { cn } from "@/lib/utils";
import { FlaskConical, TrendingUp, Flame, Activity, Shield, Sparkles, Search, Zap } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getPropLabel, getEdgeTier, type TopProp } from "@/hooks/use-top-props";
import { usePropDrawer } from "@/hooks/use-prop-drawer";
import { GuidanceCard } from "@/components/ui/GuidanceCard";
import { DataSourceBadge } from "@/components/ui/DataSourceBadge";

import { LiveSignalFeed } from "@/components/live/LiveSignalFeed";

const SIGNAL_TABS = [
  { key: "live_signals", label: "Live Signals", icon: Zap, color: "text-cosmic-red" },
  { key: "streaks", label: "Over Streaks", icon: Flame, color: "text-cosmic-green" },
  { key: "momentum", label: "Momentum", icon: TrendingUp, color: "text-primary" },
  { key: "usage", label: "Usage Shift", icon: Activity, color: "text-cosmic-gold" },
  { key: "defense", label: "Defense", icon: Shield, color: "text-cosmic-cyan" },
  { key: "astro", label: "Astro Signals", icon: Sparkles, color: "text-cosmic-lavender" },
  { key: "live", label: "Live Edges", icon: Zap, color: "text-cosmic-red" },
] as const;

type SignalTab = typeof SIGNAL_TABS[number]["key"];

export default function SignalLabPage({ embedded = false }: { embedded?: boolean }) {
  const { openProp } = usePropDrawer();
  const [activeTab, setActiveTab] = useState<SignalTab>("streaks");
  const [search, setSearch] = useState("");

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
      const rows = (data || []) as any[];
      return resolveOverlayPlayerNames(rows);
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

  // Derive signal-specific lists with real DB fields
  const streakCards = useMemo(() =>
    filtered
      .filter(o => o.streak != null && o.streak >= 3)
      .sort((a, b) => (b.streak ?? 0) - (a.streak ?? 0))
      .slice(0, 30),
    [filtered]
  );

  const momentumCards = useMemo(() =>
    filtered
      .filter(o => o.hit_l10 != null && o.hit_l10 >= 0.6)
      .sort((a, b) => (b.hit_l10 ?? 0) - (a.hit_l10 ?? 0))
      .slice(0, 30),
    [filtered]
  );

  const usageCards = useMemo(() =>
    filtered
      .filter(o => {
        const diff = o.mu && o.line ? o.mu - o.line : 0;
        return diff > 0.5;
      })
      .sort((a, b) => (b.mu - (b.line ?? b.mu)) - (a.mu - (a.line ?? a.mu)))
      .slice(0, 30),
    [filtered]
  );

  const defenseCards = useMemo(() =>
    filtered
      .filter(o => o.sigma != null && o.sigma < 3)
      .sort((a, b) => (b.edge_score_v11 ?? b.edge_score) - (a.edge_score_v11 ?? a.edge_score))
      .slice(0, 30),
    [filtered]
  );

  const astroCards = useMemo(() => {
    // Show props that have explicit astro data, OR fall back to all props sorted by edge
    // since every player has astrological context (natal chart, transits)
    const withAstro = filtered.filter(o => o.astro && typeof o.astro === "object" && Object.keys(o.astro).length > 0);
    if (withAstro.length >= 5) return withAstro.slice(0, 30);
    // Fallback: show all props — every player has cosmic context
    return filtered
      .sort((a, b) => (b.edge_score_v11 ?? b.edge_score ?? 0) - (a.edge_score_v11 ?? a.edge_score ?? 0))
      .slice(0, 30);
  }, [filtered]);

  const liveCards = useMemo(() =>
    filtered
      .filter(o => {
        const es = o.edge_score_v11 ?? o.edge_score ?? 0;
        return es >= 65;
      })
      .sort((a, b) => (b.edge_score_v11 ?? b.edge_score) - (a.edge_score_v11 ?? a.edge_score))
      .slice(0, 30),
    [filtered]
  );

  function getActiveCards(): any[] {
    switch (activeTab) {
      case "live_signals": return [];
      case "streaks": return streakCards;
      case "momentum": return momentumCards;
      case "usage": return usageCards;
      case "defense": return defenseCards;
      case "astro": return astroCards;
      case "live": return liveCards;
    }
  }

  const cards = getActiveCards();
  const activeConfig = SIGNAL_TABS.find(t => t.key === activeTab)!;

  return (
    <div className={embedded ? "" : "min-h-screen pb-24"}>
      {!embedded && (
        <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/50 px-4 pt-12 pb-3">
          <div className="flex items-center gap-2 mb-1">
            <FlaskConical className="h-5 w-5 text-primary" />
            <div>
              <h1 className="text-xl font-bold font-display tracking-tight">Signal Lab</h1>
              <p className="text-[10px] text-muted-foreground">
                {filtered.length} props analyzed · {cards.length} {activeConfig.label.toLowerCase()} detected
              </p>
            </div>
          </div>
        </header>
      )}

      {embedded && (
        <div className="flex items-center gap-2 mb-2">
          <FlaskConical className="h-4 w-4 text-primary" />
          <p className="text-[10px] text-muted-foreground">
            {filtered.length} props analyzed · {cards.length} {activeConfig.label.toLowerCase()} detected
          </p>
        </div>
      )}

      <div className="relative mb-3">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search players or teams..." className="pl-8 h-8 text-xs" />
      </div>

      <div className="flex gap-1 overflow-x-auto no-scrollbar mb-3">
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

      <div className="space-y-3">
        <GuidanceCard title="Signal Lab Guide" dismissKey="signal_lab_intro" variant="tip">
          <p>Signal Lab surfaces <DataSourceBadge source="model" compact /> edges from the prop overlay pipeline. Each tab filters by a different signal type — streaks, momentum, defensive matchups, and astro modifiers.</p>
          <p className="mt-1">Tap any card for full prop detail. Signals refresh every 60 seconds near game time.</p>
        </GuidanceCard>
        <SignalDescription tab={activeTab} />

        {activeTab === "live_signals" ? (
          <LiveSignalFeed maxSignals={25} />
        ) : isLoading ? (
          <div className="text-center py-12">
            <FlaskConical className="h-6 w-6 text-primary mx-auto mb-2 animate-pulse" />
            <p className="text-sm text-muted-foreground">Analyzing signals...</p>
          </div>
        ) : cards.length === 0 ? (
          <div className="text-center py-12">
            <FlaskConical className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm font-medium text-foreground">No signals detected</p>
            <p className="text-xs text-muted-foreground mt-1">This category requires active prop data from today's games. Check back closer to game time or try another tab.</p>
            <p className="text-[10px] text-muted-foreground/70 mt-2 italic">Signals depend on the model overlay pipeline running — if no games are scheduled, no signals will appear.</p>
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

// Re-export for embedded use

/* ─── Signal category description banner ─── */
function SignalDescription({ tab }: { tab: SignalTab }) {
  const descriptions: Record<SignalTab, { title: string; body: string; icon: typeof Flame }> = {
    live_signals: { title: "Live Signals", body: "Real-time hot hand, cold streak, momentum shift, and game flow alerts from live games.", icon: Zap },
    streaks: { title: "Over Streaks", body: "Players clearing their line in 3+ consecutive games. Consistency signals sustained performance.", icon: Flame },
    momentum: { title: "Momentum", body: "L10 hit rate ≥ 60%. Recent form suggests a player trending above their line.", icon: TrendingUp },
    usage: { title: "Usage Shift", body: "Projection exceeds line by 0.5+. Role or opportunity changes creating value gaps.", icon: Activity },
    defense: { title: "Defense Difficulty", body: "Low-volatility props (σ < 3) with strong edge scores. Stable matchup environments.", icon: Shield },
    astro: { title: "Astro Signals", body: "Props with active celestial alignments. Jupiter lifts, Mercury chaos, and transit modifiers.", icon: Sparkles },
    live: { title: "Live Edges", body: "Edge score ≥ 65. Elite-tier props with the strongest model conviction right now.", icon: Zap },
  };
  const d = descriptions[tab];
  const Icon = d.icon;

  return (
    <div className="cosmic-card rounded-xl p-3 flex items-start gap-2.5">
      <Icon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
      <div>
        <p className="text-xs font-semibold text-foreground">{d.title}</p>
        <p className="text-[10px] text-muted-foreground leading-relaxed">{d.body}</p>
      </div>
    </div>
  );
}

/* ─── Signal card ─── */
function SignalCard({ overlay, tab, onTap }: { overlay: any; tab: SignalTab; onTap: () => void }) {
  const edgeScore = overlay.edge_score_v11 ?? overlay.edge_score ?? 0;
  const tier = getEdgeTier(edgeScore);
  const propLabel = getPropLabel(overlay.prop_type || "");

  const signalBadge = (() => {
    switch (tab) {
      case "streaks":
        return { text: `🔥 ${overlay.streak ?? 0} straight`, className: "bg-cosmic-green/10 text-cosmic-green border-cosmic-green/20" };
      case "momentum":
        return { text: `${((overlay.hit_l10 ?? 0) * 100).toFixed(0)}% L10`, className: "bg-primary/10 text-primary border-primary/20" };
      case "usage":
        const diff = overlay.mu && overlay.line ? (overlay.mu - overlay.line).toFixed(1) : "0";
        return { text: `+${diff} over line`, className: "bg-cosmic-gold/10 text-cosmic-gold border-cosmic-gold/20" };
      case "defense":
        return { text: `σ ${overlay.sigma?.toFixed(1) ?? "—"}`, className: "bg-cosmic-cyan/10 text-cosmic-cyan border-cosmic-cyan/20" };
      case "astro": {
        const hasAstro = overlay.astro && typeof overlay.astro === "object" && Object.keys(overlay.astro).length > 0;
        return { text: hasAstro ? "✦ Astro Active" : "✦ Cosmic Context", className: "bg-cosmic-lavender/10 text-cosmic-lavender border-cosmic-lavender/20" };
      }
      case "live":
        return { text: `⚡ ${edgeScore.toFixed(0)} Edge`, className: "bg-cosmic-red/10 text-cosmic-red border-cosmic-red/20" };
    }
  })();

  const signalDetail = (() => {
    switch (tab) {
      case "streaks":
        return `Hit L10: ${((overlay.hit_l10 ?? 0) * 100).toFixed(0)}% · Proj: ${overlay.mu?.toFixed(1) ?? "—"} vs ${overlay.line ?? "—"}`;
      case "momentum":
        return `Proj: ${overlay.mu?.toFixed(1) ?? "—"} vs Line: ${overlay.line ?? "—"} · Streak: ${overlay.streak ?? 0}`;
      case "usage":
        return `Proj: ${overlay.mu?.toFixed(1) ?? "—"} · σ: ${overlay.sigma?.toFixed(1) ?? "—"} · Edge: ${edgeScore.toFixed(0)}`;
      case "defense":
        return `Proj: ${overlay.mu?.toFixed(1) ?? "—"} vs Line: ${overlay.line ?? "—"} · Edge: ${edgeScore.toFixed(0)}`;
      case "astro": {
        const astro = overlay.astro;
        if (!astro || typeof astro !== "object") return "Celestial context available";
        const keys = Object.keys(astro).slice(0, 3);
        return keys.map(k => `${k}: ${JSON.stringify(astro[k])}`).join(" · ") || "Active alignments";
      }
      case "live":
        return `Proj: ${overlay.mu?.toFixed(1) ?? "—"} vs Line: ${overlay.line ?? "—"} · Hit L10: ${((overlay.hit_l10 ?? 0) * 100).toFixed(0)}%`;
    }
  })();

  return (
    <button onClick={onTap} className="w-full cosmic-card rounded-xl p-3 text-left hover:border-primary/30 transition-colors space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <span className="text-xs font-semibold text-foreground truncate block">{overlay.player_name}</span>
          <span className="text-[10px] text-muted-foreground">
            {overlay.player_team}
            {overlay.home_abbr && overlay.away_abbr && ` · ${overlay.away_abbr} @ ${overlay.home_abbr}`}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full font-semibold border", signalBadge.className)}>
            {signalBadge.text}
          </span>
          <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0 h-4 font-bold", tier.className)}>
            {tier.label}
          </Badge>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold text-muted-foreground uppercase">{propLabel}</span>
        <span className="text-sm font-bold tabular-nums text-foreground">{overlay.line != null ? Number(overlay.line) : "—"}</span>
        <span className="text-[10px] text-muted-foreground">→</span>
        <span className={cn("text-sm font-bold tabular-nums", overlay.mu > (overlay.line ?? 0) ? "text-cosmic-green" : "text-cosmic-red")}>
          {overlay.mu?.toFixed(1)}
        </span>
      </div>
      <p className="text-[10px] text-muted-foreground">{signalDetail}</p>
    </button>
  );
}
