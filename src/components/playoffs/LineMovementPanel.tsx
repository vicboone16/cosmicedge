import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useLineMovement, type MarketMovement } from "@/hooks/use-line-movement";

function fmtOdds(n: number | null): string {
  if (n == null) return "—";
  return n > 0 ? `+${n}` : `${n}`;
}

function fmtLine(n: number | null, market: string): string {
  if (n == null) return "—";
  if (market === "spread") return n > 0 ? `+${n}` : `${n}`;
  return `${n}`;
}

function fmtDelta(n: number | null): string {
  if (n == null || n === 0) return "—";
  return `${n > 0 ? "+" : ""}${n}`;
}

function deltaClass(n: number | null): string {
  if (n == null || n === 0) return "text-muted-foreground";
  return n > 0 ? "text-emerald-500" : "text-rose-500";
}

function DeltaIcon({ n }: { n: number | null }) {
  if (n == null || n === 0) return <Minus className="h-3 w-3 text-muted-foreground" />;
  return n > 0
    ? <TrendingUp className="h-3 w-3 text-emerald-500" />
    : <TrendingDown className="h-3 w-3 text-rose-500" />;
}

function MarketRow({ m, biggest }: { m: MarketMovement; biggest: boolean }) {
  return (
    <div className="cosmic-card rounded-xl p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{m.market_type}</span>
        {biggest && (
          <span className="text-[9px] font-semibold bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">Biggest mover</span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-[9px] text-muted-foreground uppercase mb-1">Open</p>
          <p className="text-xs font-semibold tabular-nums">{fmtLine(m.open?.line ?? null, m.market_type)}</p>
          <p className="text-[10px] text-muted-foreground tabular-nums">{fmtOdds(m.open?.home_price ?? null)}</p>
        </div>
        <div>
          <p className="text-[9px] text-muted-foreground uppercase mb-1">Current</p>
          <p className="text-xs font-semibold tabular-nums">{fmtLine(m.current?.line ?? null, m.market_type)}</p>
          <p className="text-[10px] text-muted-foreground tabular-nums">{fmtOdds(m.current?.home_price ?? null)}</p>
        </div>
        <div>
          <p className="text-[9px] text-muted-foreground uppercase mb-1">Move</p>
          <div className={cn("flex items-center justify-center gap-0.5 text-xs font-semibold tabular-nums", deltaClass(m.lineDelta ?? m.homeDelta))}>
            <DeltaIcon n={m.lineDelta ?? m.homeDelta} />
            {m.lineDelta != null ? fmtDelta(m.lineDelta) : fmtDelta(m.homeDelta)}
          </div>
        </div>
      </div>
      <p className="text-[9px] text-muted-foreground">{m.snapshots} snapshot{m.snapshots === 1 ? "" : "s"}{m.bookmaker ? ` · ${m.bookmaker}` : ""}</p>
    </div>
  );
}

export function LineMovementPanel({ gameId }: { gameId: string | null }) {
  const { markets, biggestMover, loading, totalSnapshots } = useLineMovement(gameId);

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
      </div>
    );
  }

  if (markets.length === 0 || totalSnapshots < 2) {
    return <p className="text-xs text-muted-foreground py-4 text-center">No odds movement recorded yet.</p>;
  }

  return (
    <div className="space-y-2">
      {markets.map((m) => (
        <MarketRow key={m.market_type} m={m} biggest={biggestMover?.market_type === m.market_type} />
      ))}
    </div>
  );
}
