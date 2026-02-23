import { useState } from "react";
import { BarChart3, Target, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { BarChart, Bar, ReferenceLine, XAxis, YAxis, ResponsiveContainer, Cell } from "recharts";
import { TrackPropButton } from "@/components/tracking/TrackedProps";

export interface TrendInsight {
  id: string;
  playerName: string;
  teamAbbr: string;
  matchup: string;
  startTime: string;
  insightText: string;
  direction: "over" | "under";
  propLabel: string;
  line: number;
  odds: number | null;
  hitRate: number;
  sampleSize: number;
  hitGames: number[];
  statValues?: number[];
  gameId?: string;
  marketKey?: string;
}

function formatOdds(odds: number | null): string {
  if (odds == null) return "—";
  return odds > 0 ? `+${odds}` : `${odds}`;
}

export function TrendCard({ insight }: { insight: TrendInsight }) {
  const navigate = useNavigate();
  const dirLabel = insight.direction === "over" ? "Over" : "Under";
  const hitPct = insight.hitRate;

  const handleAddToSkySpread = () => {
    navigate(`/skyspread?prefill=true&player=${encodeURIComponent(insight.playerName)}&market=${encodeURIComponent(insight.marketKey || "")}&line=${insight.line ?? ""}&odds=${insight.odds ?? ""}&game_id=${insight.gameId || ""}&side=${insight.direction}`);
  };

  const chartData = (insight.statValues || []).map((val, i) => ({
    game: `G${i + 1}`,
    value: val,
  }));

  return (
    <div className="cosmic-card rounded-xl p-4 space-y-3">
      {/* Player header */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-lg font-bold text-muted-foreground">
          {insight.playerName.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">{insight.playerName} <span className="text-muted-foreground font-normal">({insight.teamAbbr})</span></p>
          <p className="text-[11px] text-muted-foreground">{insight.matchup} · {insight.startTime}</p>
        </div>
      </div>

      {/* Insight sentence */}
      <p className="text-sm font-semibold text-foreground leading-snug">
        {insight.insightText}
      </p>

      {/* Bar chart showing last N games vs line */}
      {chartData.length > 0 && (
        <div className="h-24 -mx-1">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barCategoryGap="20%">
              <XAxis dataKey="game" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <YAxis hide domain={[0, (dataMax: number) => Math.max(dataMax * 1.15, (insight.line || 0) * 1.15)]} />
              <ReferenceLine
                y={insight.line}
                stroke="hsl(var(--primary))"
                strokeDasharray="4 3"
                strokeWidth={1.5}
                label={{ value: `${insight.line}`, position: "right", fontSize: 10, fill: "hsl(var(--primary))" }}
              />
              <Bar dataKey="value" radius={[3, 3, 0, 0]} maxBarSize={24}>
                {chartData.map((entry, i) => {
                  const hit = insight.direction === "over"
                    ? entry.value > insight.line
                    : entry.value < insight.line;
                  return (
                    <Cell
                      key={i}
                      fill={hit ? "hsl(var(--cosmic-green, 142 71% 45%))" : "hsl(var(--cosmic-red, 0 84% 60%) / 0.4)"}
                    />
                  );
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Prop selection row + Track button */}
      <div className="flex items-center justify-between cosmic-card rounded-lg p-2.5">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">{dirLabel} {insight.line} {insight.propLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          {insight.odds != null && (
            <span className="text-sm font-bold tabular-nums text-foreground">{formatOdds(insight.odds)}</span>
          )}
          {insight.gameId && (
            <>
              <TrackPropButton
                gameId={insight.gameId}
                playerName={insight.playerName}
                marketType={insight.marketKey || insight.propLabel}
                line={insight.line}
                overPrice={insight.direction === "over" ? insight.odds : null}
                underPrice={insight.direction === "under" ? insight.odds : null}
              />
              <button
                onClick={handleAddToSkySpread}
                className="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                title="Add to SkySpread"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Hit rate bar */}
      <div>
        <div className="flex gap-0.5 mb-1">
          {insight.hitGames.map((hit, i) => (
            <div
              key={i}
              className={cn(
                "flex-1 h-1.5 rounded-full",
                hit ? "bg-cosmic-green" : "bg-cosmic-red/40"
              )}
            />
          ))}
        </div>
        <p className="text-xs">
          <span className="text-cosmic-green font-semibold">{hitPct.toFixed(1)}%</span>
          <span className="text-muted-foreground"> in the last {insight.sampleSize} games</span>
        </p>
      </div>
    </div>
  );
}
