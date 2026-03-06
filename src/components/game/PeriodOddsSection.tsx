import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Clock, TrendingUp, TrendingDown } from "lucide-react";

interface PeriodOddsProps {
  gameId: string;
  league: string;
}

interface PropRow {
  id: string;
  market_key: string;
  market_label: string | null;
  bookmaker: string;
  line: number | null;
  over_price: number | null;
  under_price: number | null;
  player_name: string;
}

const PERIOD_KEYS = new Set([
  "h2h_q1", "h2h_q2", "h2h_q3", "h2h_q4", "h2h_h1", "h2h_h2",
  "h2h_p1", "h2h_p2", "h2h_p3",
  "h2h_1st_1_innings", "h2h_1st_3_innings", "h2h_1st_5_innings",
  "spreads_h1", "spreads_h2", "spreads_p1", "spreads_p2", "spreads_p3",
  "spreads_1st_1_innings", "spreads_1st_5_innings",
  "totals_q1", "totals_q2", "totals_q3", "totals_q4", "totals_h1", "totals_h2",
  "totals_p1", "totals_p2", "totals_p3",
  "totals_1st_1_innings", "totals_1st_5_innings",
  "team_totals_q1", "team_totals_h1", "team_totals_p1", "team_totals_p2", "team_totals_p3",
]);

const MARKET_LABELS: Record<string, string> = {
  h2h_q1: "ML Q1", h2h_q2: "ML Q2", h2h_q3: "ML Q3", h2h_q4: "ML Q4",
  h2h_h1: "ML 1H", h2h_h2: "ML 2H",
  h2h_p1: "ML P1", h2h_p2: "ML P2", h2h_p3: "ML P3",
  h2h_1st_1_innings: "ML 1st Inn", h2h_1st_5_innings: "ML 1st 5 Inn",
  spreads_h1: "Spread 1H", spreads_h2: "Spread 2H",
  spreads_p1: "Spread P1", spreads_p2: "Spread P2", spreads_p3: "Spread P3",
  spreads_1st_1_innings: "Spread 1st Inn", spreads_1st_5_innings: "Spread 1st 5 Inn",
  totals_q1: "O/U Q1", totals_q2: "O/U Q2", totals_q3: "O/U Q3", totals_q4: "O/U Q4",
  totals_h1: "O/U 1H", totals_h2: "O/U 2H",
  totals_p1: "O/U P1", totals_p2: "O/U P2", totals_p3: "O/U P3",
  totals_1st_1_innings: "O/U 1st Inn", totals_1st_5_innings: "O/U 1st 5 Inn",
  team_totals_q1: "TT Q1", team_totals_h1: "TT 1H",
  team_totals_p1: "TT P1", team_totals_p2: "TT P2", team_totals_p3: "TT P3",
};

function formatPrice(price: number | null): string {
  if (price == null) return "—";
  return price > 0 ? `+${price}` : `${price}`;
}

function groupKey(key: string): string {
  if (key.startsWith("h2h_")) return "Moneyline";
  if (key.startsWith("spreads_")) return "Spreads";
  if (key.startsWith("team_totals_")) return "Team Totals";
  if (key.startsWith("totals_")) return "Totals";
  return "Other";
}

export function PeriodOddsSection({ gameId }: PeriodOddsProps) {
  const { data: props, isLoading } = useQuery({
    queryKey: ["period-odds", gameId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("player_props")
        .select("*")
        .eq("game_id", gameId)
        .not("over_price", "is", null)
        .not("under_price", "is", null)
        .order("market_key", { ascending: true });
      if (error) throw error;
      return (data || []) as PropRow[];
    },
  });

  const periodProps = (props || []).filter((p) => PERIOD_KEYS.has(p.market_key));

  if (isLoading || periodProps.length === 0) return null;

  // Group by market type
  const groups = new Map<string, PropRow[]>();
  for (const p of periodProps) {
    const g = groupKey(p.market_key);
    if (!groups.has(g)) groups.set(g, []);
    // Deduplicate by market_key (keep first)
    const arr = groups.get(g)!;
    if (!arr.find((x) => x.market_key === p.market_key)) {
      arr.push(p);
    }
  }

  return (
    <section>
      <h3 className="text-xs font-semibold text-primary uppercase tracking-widest mb-3 flex items-center gap-1.5">
        <Clock className="h-3.5 w-3.5" />
        Period Markets
      </h3>
      <div className="space-y-3">
        {Array.from(groups.entries()).map(([group, rows]) => (
          <div key={group} className="cosmic-card rounded-xl p-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              {group}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {rows.map((row) => (
                <div
                  key={row.id}
                  className="bg-secondary/50 rounded-lg px-2.5 py-2 text-center"
                >
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">
                    {MARKET_LABELS[row.market_key] || row.market_key}
                  </p>
                  {row.line != null && (
                    <p className="text-sm font-bold tabular-nums text-foreground">
                      {row.line}
                    </p>
                  )}
                  <div className="flex items-center justify-center gap-2 mt-0.5">
                    {row.over_price != null && (
                      <span className="text-[9px] tabular-nums text-cosmic-green flex items-center gap-0.5">
                        <TrendingUp className="h-2 w-2" />
                        {formatPrice(row.over_price)}
                      </span>
                    )}
                    {row.under_price != null && (
                      <span className="text-[9px] tabular-nums text-cosmic-red flex items-center gap-0.5">
                        <TrendingDown className="h-2 w-2" />
                        {formatPrice(row.under_price)}
                      </span>
                    )}
                    {row.over_price == null && row.under_price == null && row.line == null && (
                      <span className="text-[9px] tabular-nums text-foreground">
                        {row.player_name}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
