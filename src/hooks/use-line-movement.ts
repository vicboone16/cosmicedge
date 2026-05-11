import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface OddsSnapshot {
  bookmaker: string;
  market_type: string;
  home_price: number | null;
  away_price: number | null;
  line: number | null;
  captured_at: string;
}

export interface MarketMovement {
  market_type: string;
  bookmaker: string;
  open: OddsSnapshot;
  current: OddsSnapshot;
  lineDelta: number | null;
  homeDelta: number | null;
  awayDelta: number | null;
  snapshots: number;
}

export interface LineMovementResult {
  markets: MarketMovement[];
  biggestMover: MarketMovement | null;
  loading: boolean;
  totalSnapshots: number;
}

const BOOK_PRIORITY = ["bovada", "draftkings", "fanduel", "betmgm", "caesars", "pointsbet"];

function pickBookmaker(rows: OddsSnapshot[]): string {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.bookmaker, (counts.get(r.bookmaker) ?? 0) + 1);
  const present = Array.from(counts.keys());
  for (const b of BOOK_PRIORITY) {
    const hit = present.find((p) => p.toLowerCase() === b);
    if (hit) return hit;
  }
  return present.sort((a, b) => (counts.get(b)! - counts.get(a)!))[0] ?? "";
}

export function useLineMovement(gameId: string | null): LineMovementResult {
  const q = useQuery({
    queryKey: ["line-movement", gameId],
    enabled: !!gameId,
    staleTime: 60_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("odds_snapshots" as any)
        .select("bookmaker, market_type, home_price, away_price, line, captured_at")
        .eq("game_id", gameId!)
        .order("captured_at", { ascending: true })
        .limit(2000);

      const rows = ((data ?? []) as unknown as OddsSnapshot[]);
      if (rows.length === 0) return [];

      const book = pickBookmaker(rows);
      const filtered = rows.filter((r) => r.bookmaker === book);

      const byMarket = new Map<string, OddsSnapshot[]>();
      for (const r of filtered) {
        const arr = byMarket.get(r.market_type) ?? [];
        arr.push(r);
        byMarket.set(r.market_type, arr);
      }

      const out: MarketMovement[] = [];
      for (const [mkt, snaps] of byMarket.entries()) {
        if (snaps.length === 0) continue;
        const open = snaps[0];
        const current = snaps[snaps.length - 1];
        const lineDelta = open.line != null && current.line != null
          ? +(current.line - open.line).toFixed(2) : null;
        const homeDelta = open.home_price != null && current.home_price != null
          ? current.home_price - open.home_price : null;
        const awayDelta = open.away_price != null && current.away_price != null
          ? current.away_price - open.away_price : null;
        out.push({ market_type: mkt, bookmaker: book, open, current, lineDelta, homeDelta, awayDelta, snapshots: snaps.length });
      }

      const order = ["moneyline", "spread", "total"];
      out.sort((a, b) => {
        const ai = order.indexOf(a.market_type);
        const bi = order.indexOf(b.market_type);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });
      return out;
    },
  });

  const markets = q.data ?? [];
  const biggestMover = markets.reduce<MarketMovement | null>((best, m) => {
    const score = (m.lineDelta != null ? Math.abs(m.lineDelta) * 2 : 0)
      + (m.homeDelta != null ? Math.abs(m.homeDelta) / 50 : 0);
    if (score === 0) return best;
    if (!best) return m;
    const bs = (best.lineDelta != null ? Math.abs(best.lineDelta) * 2 : 0)
      + (best.homeDelta != null ? Math.abs(best.homeDelta) / 50 : 0);
    return score > bs ? m : best;
  }, null);

  return { markets, biggestMover, loading: q.isLoading, totalSnapshots: markets.reduce((s, m) => s + m.snapshots, 0) };
}
