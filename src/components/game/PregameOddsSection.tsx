import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Lock } from "lucide-react";

interface PregameOddsSectionProps {
  gameId: string;
  homeAbbr: string;
  awayAbbr: string;
  status: string;
}

function formatOdds(odds: number | null): string {
  if (odds == null || odds === 0) return "—";
  return odds > 0 ? `+${odds}` : `${odds}`;
}

export function PregameOddsSection({ gameId, homeAbbr, awayAbbr, status }: PregameOddsSectionProps) {
  const { data: pregameOdds } = useQuery({
    queryKey: ["pregame-odds", gameId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pregame_odds")
        .select("market_type, home_price, away_price, line, bookmaker, frozen_at")
        .eq("game_id", gameId);
      if (error) throw error;
      return data || [];
    },
  });

  if (!pregameOdds?.length) return null;

  // Pick consensus or first bookmaker per market
  const mlRow = pregameOdds.find(o => o.market_type === "moneyline" && !o.bookmaker?.includes("polymarket"));
  const spRow = pregameOdds.find(o => o.market_type === "spread");
  const totRow = pregameOdds.find(o => o.market_type === "total");

  if (!mlRow && !spRow && !totRow) return null;

  return (
    <section>
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-1.5">
        <Lock className="h-3 w-3" />
        {status === "final" || status === "live" || status === "in_progress" ? "Pregame Lines (Frozen)" : "Opening Lines"}
      </h3>
      <div className="grid grid-cols-3 gap-3">
        <div className="cosmic-card rounded-xl p-3 text-center border border-border/30">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Moneyline</span>
          <div className="mt-2 space-y-1">
            <div className="flex items-center justify-center gap-1">
              <span className="text-[9px] text-muted-foreground">{awayAbbr}</span>
              <p className="text-sm font-semibold tabular-nums">{formatOdds(mlRow?.away_price ? Number(mlRow.away_price) : null)}</p>
            </div>
            <div className="flex items-center justify-center gap-1">
              <span className="text-[9px] text-muted-foreground">{homeAbbr}</span>
              <p className="text-sm font-semibold tabular-nums">{formatOdds(mlRow?.home_price ? Number(mlRow.home_price) : null)}</p>
            </div>
          </div>
        </div>
        <div className="cosmic-card rounded-xl p-3 text-center border border-border/30">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Spread</span>
          <div className="mt-2 space-y-1">
            <p className="text-sm font-semibold tabular-nums">
              {spRow?.line ? `${Number(spRow.line) > 0 ? "+" : ""}${-Number(spRow.line)}` : "—"}
            </p>
            <p className="text-sm font-semibold tabular-nums">
              {spRow?.line ? `${Number(spRow.line) > 0 ? "" : "+"}${Number(spRow.line)}` : "—"}
            </p>
          </div>
        </div>
        <div className="cosmic-card rounded-xl p-3 text-center border border-border/30">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Total</span>
          <div className="mt-2 space-y-1">
            <p className="text-sm font-semibold tabular-nums">{totRow?.line ? `O ${Number(totRow.line)}` : "—"}</p>
            <p className="text-sm font-semibold tabular-nums">{totRow?.line ? `U ${Number(totRow.line)}` : "—"}</p>
          </div>
        </div>
      </div>
      {mlRow?.frozen_at && (
        <p className="text-[8px] text-muted-foreground mt-1.5 text-center">
          Frozen {new Date(mlRow.frozen_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
          {mlRow.bookmaker && ` · ${mlRow.bookmaker.replace("bdl_", "")}`}
        </p>
      )}
    </section>
  );
}
