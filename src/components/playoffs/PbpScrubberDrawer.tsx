import { useState, useMemo } from "react";
import { X, ChevronLeft, ChevronRight, Activity } from "lucide-react";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { usePbpScrubber, type PbpScrubPoint } from "@/hooks/use-pbp-scrubber";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  gameKey: string | null;
  homeAbbr?: string | null;
  awayAbbr?: string | null;
}

export function PbpScrubberDrawer({ open, onOpenChange, gameKey, homeAbbr, awayAbbr }: Props) {
  const { data: points = [], isLoading } = usePbpScrubber(open ? gameKey : null);
  const [idx, setIdx] = useState(0);

  const max = Math.max(0, points.length - 1);
  const safeIdx = Math.min(idx, max);
  const cur: PbpScrubPoint | undefined = points[safeIdx];

  const sparkPath = useMemo(() => {
    if (points.length < 2) return "";
    const W = 320, H = 60;
    const margins = points.map((p) => p.margin);
    const lo = Math.min(...margins, -1);
    const hi = Math.max(...margins, 1);
    const span = Math.max(1, hi - lo);
    return points.map((p, i) => {
      const x = (i / (points.length - 1)) * W;
      const y = H - ((p.margin - lo) / span) * H;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
  }, [points]);

  const leadChanges = useMemo(() => points.filter((p) => p.leadChange).length, [points]);
  const cursorX = points.length > 1 ? (safeIdx / (points.length - 1)) * 320 : 0;
  const totalMom = (cur?.homeMomentum ?? 0) + (cur?.awayMomentum ?? 0);
  const homePct = totalMom > 0 ? (cur!.homeMomentum / totalMom) * 100 : 50;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[88vh] bg-background border-t border-border">
        <ScrollArea className="h-[calc(88vh-2rem)] px-4 pb-6">
          <div className="pt-3 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">PBP Scrubber</span>
              </div>
              <button onClick={() => onOpenChange(false)} className="p-1 rounded-lg hover:bg-muted transition-colors">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>

            {isLoading ? (
              <Skeleton className="h-40 rounded-xl" />
            ) : points.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">No PBP data for this game yet.</p>
            ) : (
              <>
                {/* Score header */}
                <div className="cosmic-card rounded-xl p-4 grid grid-cols-3 text-center">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{awayAbbr ?? "AWAY"}</p>
                    <p className="text-3xl font-bold font-display tabular-nums">{cur?.away ?? 0}</p>
                  </div>
                  <div className="flex flex-col items-center justify-center gap-0.5">
                    <p className="text-[10px] text-muted-foreground">Q{cur?.period ?? 1}</p>
                    <p className={cn("text-sm font-bold tabular-nums",
                      (cur?.margin ?? 0) > 0 ? "text-emerald-500" :
                      (cur?.margin ?? 0) < 0 ? "text-rose-500" : "text-muted-foreground"
                    )}>
                      {cur && cur.margin !== 0 ? `${cur.margin > 0 ? "+" : ""}${cur.margin}` : "TIE"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{homeAbbr ?? "HOME"}</p>
                    <p className="text-3xl font-bold font-display tabular-nums">{cur?.home ?? 0}</p>
                  </div>
                </div>

                {/* Sparkline */}
                <div className="cosmic-card rounded-xl p-3">
                  <svg viewBox="0 0 320 60" className="w-full h-14" preserveAspectRatio="none">
                    <line x1="0" y1="30" x2="320" y2="30" stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" />
                    <path d={sparkPath} fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" />
                    {points.map((p, i) => p.leadChange && (
                      <line key={i} x1={(i / (points.length - 1)) * 320} y1="0" x2={(i / (points.length - 1)) * 320} y2="60"
                        stroke="hsl(var(--destructive))" strokeWidth="0.8" strokeOpacity="0.5" />
                    ))}
                    <line x1={cursorX} y1="0" x2={cursorX} y2="60" stroke="white" strokeWidth="1" strokeOpacity="0.6" />
                  </svg>
                  <div className="flex justify-between text-[9px] text-muted-foreground mt-1">
                    <span>Tip-off</span>
                    <span>{leadChanges} lead change{leadChanges === 1 ? "" : "s"}</span>
                    <span>Final</span>
                  </div>
                </div>

                {/* Momentum bar */}
                <div className="cosmic-card rounded-xl p-3 space-y-2">
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>{awayAbbr ?? "AWAY"} momentum: {cur?.awayMomentum ?? 0}</span>
                    <span>{homeAbbr ?? "HOME"} momentum: {cur?.homeMomentum ?? 0}</span>
                  </div>
                  <div className="h-2 rounded-full bg-rose-500/30 overflow-hidden flex">
                    <div className="h-full bg-rose-500 transition-all" style={{ width: `${100 - homePct}%` }} />
                    <div className="h-full bg-emerald-500 transition-all" style={{ width: `${homePct}%` }} />
                  </div>
                  <p className="text-[9px] text-muted-foreground text-center">Last 8 events scoring share</p>
                </div>

                {/* Scrubber + play description */}
                <div className="space-y-2">
                  <input
                    type="range" min={0} max={max} value={safeIdx}
                    onChange={(e) => setIdx(Number(e.target.value))}
                    className="w-full accent-primary"
                    aria-label="Scrub through play-by-play"
                  />
                  <div className="flex items-center gap-2">
                    <button onClick={() => setIdx(Math.max(0, safeIdx - 1))}
                      className="p-1.5 rounded-lg border border-border hover:bg-muted transition-colors">
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <p className="flex-1 text-xs text-foreground text-center leading-relaxed">
                      {cur?.team && <span className="font-semibold text-primary">{cur.team} </span>}
                      {cur?.description || "—"}
                    </p>
                    <button onClick={() => setIdx(Math.min(max, safeIdx + 1))}
                      className="p-1.5 rounded-lg border border-border hover:bg-muted transition-colors">
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <p className="text-[9px] text-muted-foreground text-center">Event {safeIdx + 1} of {points.length}</p>
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      </DrawerContent>
    </Drawer>
  );
}
