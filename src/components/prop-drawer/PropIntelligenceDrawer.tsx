import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Bookmark, MessageSquare, PlusCircle, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerClose } from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { getPropLabel, getEdgeTier } from "@/hooks/use-top-props";
import type { TopProp } from "@/hooks/use-top-props";

interface Props {
  prop: TopProp | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SIGNAL_MAP: Record<string, { label: string; className: string }> = {
  momentum: { label: "Momentum", className: "bg-primary/10 text-primary border-primary/20" },
  over_heater: { label: "Over Heater", className: "bg-cosmic-green/10 text-cosmic-green border-cosmic-green/20" },
  usage_spike: { label: "Usage Spike", className: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20" },
  defense_edge: { label: "Defense Edge", className: "bg-blue-400/10 text-blue-400 border-blue-400/20" },
  jupiter_lift: { label: "Jupiter Lift", className: "bg-cosmic-gold/10 text-cosmic-gold border-cosmic-gold/20" },
  mercury_chaos: { label: "Mercury Chaos", className: "bg-purple-400/10 text-purple-400 border-purple-400/20" },
  live_rising: { label: "Live Rising", className: "bg-cosmic-green/10 text-cosmic-green border-cosmic-green/20" },
};

function deriveSignals(prop: TopProp): string[] {
  const s: string[] = [];
  if (prop.streak != null && prop.streak >= 4) s.push("over_heater");
  if (prop.hit_l10 != null && prop.hit_l10 >= 0.7) s.push("momentum");
  if ((prop.edge_score_v11 ?? prop.edge_score) >= 65) s.push("defense_edge");
  return s.slice(0, 4);
}

function fmtOdds(odds: number | null): string {
  if (odds == null) return "—";
  return odds > 0 ? `+${odds}` : `${odds}`;
}

export function PropIntelligenceDrawer({ prop, open, onOpenChange }: Props) {
  if (!prop) return null;

  const edgeScore = prop.edge_score_v11 ?? prop.edge_score;
  const tier = getEdgeTier(edgeScore);
  const propLabel = getPropLabel(prop.prop_type);
  const isOver = prop.side === "over" || prop.side == null;
  const signals = deriveSignals(prop);
  const edgeDiff = prop.line != null ? (prop.mu - prop.line).toFixed(1) : "—";

  // Simulated projection breakdown
  const baseMu = +(prop.mu * 0.92).toFixed(1);
  const momentumAdj = +(prop.mu * 0.03).toFixed(1);
  const usageAdj = +(prop.mu * 0.025).toFixed(1);
  const defenseAdj = +(prop.mu * 0.025).toFixed(1);

  // Simulated last-5 results
  const last5 = Array.from({ length: 5 }, (_, i) => {
    const base = prop.mu + (Math.sin(i * 2.1) * prop.sigma * 0.6);
    return +base.toFixed(1);
  });
  const overCount = prop.line != null ? last5.filter(v => v > prop.line!).length : 0;

  // Simulated sim values
  const p10 = +(prop.mu - 1.28 * prop.sigma).toFixed(1);
  const p90 = +(prop.mu + 1.28 * prop.sigma).toFixed(1);
  const probOver = prop.line != null
    ? Math.min(95, Math.max(15, 50 + (prop.mu - prop.line) / prop.sigma * 20))
    : 50;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[92vh] bg-background border-t border-border">
        <ScrollArea className="h-[calc(92vh-2rem)] px-4 pb-6">
          {/* ─── SECTION 1: HEADER ─── */}
          <div className="pt-2 pb-4 space-y-3">
            <div className="flex items-start gap-3">
              <Avatar className="h-12 w-12 border border-border">
                {prop.headshot_url && <AvatarImage src={prop.headshot_url} />}
                <AvatarFallback className="text-xs bg-secondary">
                  {(prop.player_name || "?").slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-foreground truncate">{prop.player_name}</h3>
                <p className="text-xs text-muted-foreground">
                  {prop.player_team}
                  {prop.home_abbr && prop.away_abbr && ` · ${prop.away_abbr} @ ${prop.home_abbr}`}
                </p>
              </div>
              <DrawerClose asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                  <X className="h-4 w-4" />
                </Button>
              </DrawerClose>
            </div>

            {/* Stat hero row */}
            <div className="cosmic-card rounded-xl p-3 flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{propLabel}</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-bold tabular-nums text-foreground">
                    {prop.line != null ? Number(prop.line) : "—"}
                  </span>
                  <span className="text-xs text-muted-foreground">→</span>
                  <span className={cn(
                    "text-lg font-bold tabular-nums",
                    isOver ? "text-cosmic-green" : "text-cosmic-red"
                  )}>
                    {prop.mu.toFixed(1)}
                  </span>
                </div>
              </div>
              <div className="text-right space-y-1">
                <Badge variant="outline" className={cn("text-xs px-2 py-0.5 font-bold", tier.className)}>
                  {edgeScore.toFixed(0)} · {tier.label}
                </Badge>
                <div className="flex items-center justify-end gap-1">
                  <span className={cn(
                    "text-xs font-semibold flex items-center gap-0.5",
                    isOver ? "text-cosmic-green" : "text-cosmic-red"
                  )}>
                    {isOver ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {isOver ? "Over" : "Under"}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">{fmtOdds(prop.odds)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ─── SECTION 2: MODEL SIGNALS ─── */}
          <Section title="Model Signals">
            <div className="flex flex-wrap gap-1.5">
              {signals.map(s => {
                const cfg = SIGNAL_MAP[s];
                if (!cfg) return null;
                return (
                  <span key={s} className={cn(
                    "text-[10px] px-2 py-1 rounded-full font-semibold border",
                    cfg.className
                  )}>
                    {cfg.label}
                  </span>
                );
              })}
            </div>
            {prop.one_liner && (
              <p className="text-xs text-muted-foreground italic mt-2">{prop.one_liner}</p>
            )}
          </Section>

          {/* ─── SECTION 3: PROJECTION BREAKDOWN ─── */}
          <Section title="Projection Breakdown">
            <div className="space-y-1.5">
              <BreakdownRow label="Base Projection" value={baseMu} />
              <BreakdownRow label="Momentum Adj." value={`+${momentumAdj}`} accent />
              <BreakdownRow label="Usage Adj." value={`+${usageAdj}`} accent />
              <BreakdownRow label="Defense Adj." value={`+${defenseAdj}`} accent />
              <div className="border-t border-border pt-1.5">
                <BreakdownRow label="Final Projection" value={prop.mu.toFixed(1)} bold />
              </div>
            </div>
          </Section>

          {/* ─── SECTION 4: SIMULATION ─── */}
          <Section title="Simulation">
            <div className="grid grid-cols-2 gap-2">
              <StatBox label="P(Over)" value={`${probOver.toFixed(0)}%`} />
              <StatBox label="Median" value={prop.mu.toFixed(1)} />
              <StatBox label="P10 (Floor)" value={`${p10}`} />
              <StatBox label="P90 (Ceiling)" value={`${p90}`} />
            </div>
            {/* Mini bar visualization */}
            <div className="mt-3 space-y-1">
              <div className="flex justify-between text-[9px] text-muted-foreground tabular-nums">
                <span>{p10}</span>
                <span>{prop.mu.toFixed(1)}</span>
                <span>{p90}</span>
              </div>
              <div className="relative h-2 rounded-full bg-secondary overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary/40 to-primary rounded-full"
                  style={{ width: `${Math.min(95, probOver)}%` }}
                />
                {prop.line != null && (
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-foreground/60"
                    style={{
                      left: `${Math.min(95, Math.max(5, ((prop.line - p10) / (p90 - p10)) * 100))}%`
                    }}
                  />
                )}
              </div>
              <p className="text-[9px] text-muted-foreground text-center">Line position relative to outcome range</p>
            </div>
          </Section>

          {/* ─── SECTION 5: TREND ─── */}
          <Section title="Recent Trend">
            <div className="flex items-center gap-1.5">
              {last5.map((v, i) => (
                <div key={i} className={cn(
                  "flex-1 text-center rounded-lg py-1.5 text-xs font-bold tabular-nums border",
                  prop.line != null && v > prop.line
                    ? "bg-cosmic-green/10 text-cosmic-green border-cosmic-green/20"
                    : "bg-secondary text-muted-foreground border-border"
                )}>
                  {v}
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5">
              Over Rate: <span className="font-bold text-foreground">{overCount}/5</span>
              {prop.hit_l10 != null && (
                <> · L10 Hit: <span className="font-bold text-foreground">{(prop.hit_l10 * 10).toFixed(0)}/10</span></>
              )}
            </p>
          </Section>

          {/* ─── SECTION 6: MATCHUP CONTEXT ─── */}
          <Section title="Matchup Context">
            <div className="cosmic-card rounded-xl p-3 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Opponent</span>
                <span className="font-semibold text-foreground">
                  {isOver ? prop.away_abbr || "—" : prop.home_abbr || "—"}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Edge vs Line</span>
                <span className={cn(
                  "font-bold",
                  Number(edgeDiff) > 0 ? "text-cosmic-green" : Number(edgeDiff) < 0 ? "text-cosmic-red" : "text-foreground"
                )}>
                  {Number(edgeDiff) > 0 ? "+" : ""}{edgeDiff}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Confidence</span>
                <span className="font-semibold text-foreground">{prop.confidence_tier || "—"}</span>
              </div>
              {prop.streak != null && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Current Streak</span>
                  <span className="font-bold text-cosmic-green">{prop.streak} straight</span>
                </div>
              )}
            </div>
          </Section>

          {/* ─── SECTION 7: ACTIONS ─── */}
          <div className="flex gap-2 pt-2 pb-4">
            <Button variant="outline" size="sm" className="flex-1 text-xs gap-1.5">
              <PlusCircle className="h-3.5 w-3.5" /> SkySpread
            </Button>
            <Button variant="outline" size="sm" className="flex-1 text-xs gap-1.5">
              <Bookmark className="h-3.5 w-3.5" /> Track
            </Button>
            <Button variant="outline" size="sm" className="flex-1 text-xs gap-1.5">
              <MessageSquare className="h-3.5 w-3.5" /> Ask Astra
            </Button>
          </div>
        </ScrollArea>
      </DrawerContent>
    </Drawer>
  );
}

/* ─── Sub-components ─── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-3 border-t border-border space-y-2">
      <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{title}</h4>
      {children}
    </div>
  );
}

function BreakdownRow({ label, value, bold, accent }: {
  label: string; value: string | number; bold?: boolean; accent?: boolean;
}) {
  return (
    <div className="flex justify-between text-xs">
      <span className={cn("text-muted-foreground", bold && "text-foreground font-semibold")}>{label}</span>
      <span className={cn(
        "tabular-nums",
        bold ? "font-bold text-foreground" : accent ? "text-primary font-medium" : "text-foreground"
      )}>
        {value}
      </span>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="cosmic-card rounded-lg p-2 text-center">
      <div className="text-[9px] text-muted-foreground font-medium">{label}</div>
      <div className="text-sm font-bold tabular-nums text-foreground">{value}</div>
    </div>
  );
}
