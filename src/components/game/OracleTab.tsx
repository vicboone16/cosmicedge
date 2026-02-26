/**
 * OracleTab — Full pregame prediction breakdown + live WP + quarter ML
 */
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useOracle } from "@/hooks/use-oracle";
import { classifyEdge, wpToAmericanOdds } from "@/lib/oracle-engine";
import { TrendingUp, TrendingDown, Zap, Target, BarChart3, Clock, Activity } from "lucide-react";

function formatOdds(odds: number): string {
  if (!odds) return "—";
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function formatPct(val: number): string {
  return `${(val * 100).toFixed(1)}%`;
}

interface Props {
  gameId: string;
  homeAbbr: string;
  awayAbbr: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  bookMLHome?: number;
  bookMLAway?: number;
  bookSpread?: number;
  bookTotal?: number;
  // Live state
  homeScore?: number | null;
  awayScore?: number | null;
  isLive?: boolean;
}

export function OracleTab({
  gameId, homeAbbr, awayAbbr, homeTeam, awayTeam, league,
  bookMLHome, bookMLAway, bookSpread, bookTotal,
  homeScore, awayScore, isLive,
}: Props) {
  const scoreDiff = (homeScore ?? 0) - (awayScore ?? 0);

  const {
    pregame, quarters, liveWP, isLoading, homeRatings, awayRatings,
  } = useOracle(
    gameId, homeAbbr, awayAbbr, league,
    bookMLHome, bookMLAway, bookSpread, bookTotal,
    scoreDiff,
    isLive ? 1440 : undefined, // ~halfway through game as default
    0,
    undefined,
    isLive,
  );

  const homeEdgeInfo = useMemo(() => {
    if (!pregame || pregame.edgeHome == null) return null;
    return classifyEdge(Math.abs(pregame.edgeHome), pregame.blowoutRisk);
  }, [pregame]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="text-sm text-muted-foreground">Computing Oracle predictions...</span>
      </div>
    );
  }

  if (!pregame) {
    return (
      <div className="cosmic-card rounded-xl p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Insufficient team data for Oracle predictions. Need at least 1 game of team pace data.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Projected Score ── */}
      <section>
        <h3 className="text-xs font-semibold text-primary uppercase tracking-widest mb-3 flex items-center gap-1.5">
          <Target className="h-3.5 w-3.5" />
          Projected Final Score
        </h3>
        <div className="cosmic-card rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="text-center flex-1">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{awayAbbr}</p>
              <p className="text-3xl font-bold font-display tabular-nums text-foreground">{pregame.muAway}</p>
            </div>
            <div className="text-center px-4">
              <p className="text-[10px] text-muted-foreground uppercase">vs</p>
              <p className="text-xs font-semibold text-muted-foreground mt-1">O/U {pregame.muTotal}</p>
            </div>
            <div className="text-center flex-1">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{homeAbbr}</p>
              <p className="text-3xl font-bold font-display tabular-nums text-foreground">{pregame.muHome}</p>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-border/30 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Spread: {pregame.muSpreadHome > 0 ? `${homeAbbr} -${Math.abs(pregame.muSpreadHome)}` : `${awayAbbr} -${Math.abs(pregame.muSpreadHome)}`}</span>
            <span>{pregame.expectedPossessions} est. possessions</span>
          </div>
        </div>
      </section>

      {/* ── Win Probability ── */}
      <section>
        <h3 className="text-xs font-semibold text-primary uppercase tracking-widest mb-3 flex items-center gap-1.5">
          <BarChart3 className="h-3.5 w-3.5" />
          Win Probability
        </h3>
        <div className="cosmic-card rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-center">
              <p className="text-[10px] font-bold text-muted-foreground uppercase">{awayAbbr}</p>
              <p className={cn(
                "text-xl font-bold font-display tabular-nums",
                pregame.pAwayWin > pregame.pHomeWin ? "text-cosmic-green" : "text-muted-foreground"
              )}>
                {formatPct(pregame.pAwayWin)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-[10px] font-bold text-muted-foreground uppercase">{homeAbbr}</p>
              <p className={cn(
                "text-xl font-bold font-display tabular-nums",
                pregame.pHomeWin > pregame.pAwayWin ? "text-cosmic-green" : "text-muted-foreground"
              )}>
                {formatPct(pregame.pHomeWin)}
              </p>
            </div>
          </div>

          {/* WP Bar */}
          <div className="h-3 rounded-full overflow-hidden flex bg-secondary">
            <div
              className="bg-destructive/70 transition-all duration-500"
              style={{ width: `${pregame.pAwayWin * 100}%` }}
            />
            <div
              className="bg-primary transition-all duration-500"
              style={{ width: `${pregame.pHomeWin * 100}%` }}
            />
          </div>

          {/* Fair ML */}
          <div className="mt-3 flex items-center justify-between text-[10px]">
            <div>
              <span className="text-muted-foreground">Fair ML: </span>
              <span className="font-semibold text-foreground tabular-nums">{formatOdds(pregame.fairMLAway)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Fair ML: </span>
              <span className="font-semibold text-foreground tabular-nums">{formatOdds(pregame.fairMLHome)}</span>
            </div>
          </div>

          {/* CI */}
          <div className="mt-1 text-[9px] text-muted-foreground text-center">
            90% CI: {formatPct(pregame.pHomeWinCILow)} – {formatPct(pregame.pHomeWinCIHigh)} ({homeAbbr})
          </div>
        </div>
      </section>

      {/* ── Edge vs Book ── */}
      {(pregame.edgeHome != null || pregame.edgeAway != null) && (
        <section>
          <h3 className="text-xs font-semibold text-primary uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5" />
            Edge vs Book
          </h3>
          <div className="cosmic-card rounded-xl p-4 space-y-3">
            <div className="grid grid-cols-2 gap-4">
              {pregame.edgeAway != null && (
                <div className="text-center">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase">{awayAbbr}</p>
                  <p className={cn(
                    "text-lg font-bold font-display tabular-nums",
                    pregame.edgeAway > 0.02 ? "text-cosmic-green" : pregame.edgeAway < -0.02 ? "text-destructive" : "text-muted-foreground"
                  )}>
                    {pregame.edgeAway > 0 ? "+" : ""}{(pregame.edgeAway * 100).toFixed(1)}%
                  </p>
                  <p className="text-[9px] text-muted-foreground">
                    Model: {formatPct(pregame.pAwayWin)} vs Book: {pregame.bookImpliedHome != null ? formatPct(1 - pregame.bookImpliedHome) : "—"}
                  </p>
                </div>
              )}
              {pregame.edgeHome != null && (
                <div className="text-center">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase">{homeAbbr}</p>
                  <p className={cn(
                    "text-lg font-bold font-display tabular-nums",
                    pregame.edgeHome > 0.02 ? "text-cosmic-green" : pregame.edgeHome < -0.02 ? "text-destructive" : "text-muted-foreground"
                  )}>
                    {pregame.edgeHome > 0 ? "+" : ""}{(pregame.edgeHome * 100).toFixed(1)}%
                  </p>
                  <p className="text-[9px] text-muted-foreground">
                    Model: {formatPct(pregame.pHomeWin)} vs Book: {pregame.bookImpliedHome != null ? formatPct(pregame.bookImpliedHome) : "—"}
                  </p>
                </div>
              )}
            </div>

            {/* Edge Tier Badge */}
            {homeEdgeInfo && (
              <div className="flex justify-center">
                <span className={cn(
                  "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                  homeEdgeInfo.tier === "S" ? "bg-cosmic-gold/20 text-cosmic-gold" :
                  homeEdgeInfo.tier === "A" ? "bg-cosmic-green/20 text-cosmic-green" :
                  homeEdgeInfo.tier === "B" ? "bg-primary/20 text-primary" :
                  "bg-secondary text-muted-foreground"
                )}>
                  {homeEdgeInfo.tier === "NO_BET" ? "⚠ No Bet" : `✦ ${homeEdgeInfo.label}`}
                </span>
              </div>
            )}

            {pregame.blowoutRisk > 0.3 && (
              <p className="text-[9px] text-cosmic-red text-center">
                ⚠ Blowout risk: {(pregame.blowoutRisk * 100).toFixed(0)}% — reduced edge reliability
              </p>
            )}
          </div>
        </section>
      )}

      {/* ── Quarter Predictions ── */}
      {quarters.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-primary uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            {league === "NHL" ? "Period" : "Quarter"} Win Probability
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {quarters.map(q => {
              const label = league === "NHL" ? `P${q.quarter}` : league === "MLB" ? `Inn ${q.quarter}` : `Q${q.quarter}`;
              const favHome = q.wpHome >= 0.5;
              return (
                <div key={q.quarter} className="cosmic-card rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase">{label}</span>
                    <span className={cn(
                      "text-[10px] font-bold",
                      favHome ? "text-primary" : "text-destructive/80"
                    )}>
                      {favHome ? homeAbbr : awayAbbr} {formatPct(favHome ? q.wpHome : 1 - q.wpHome)}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden flex bg-secondary">
                    <div className="bg-destructive/60" style={{ width: `${(1 - q.wpHome) * 100}%` }} />
                    <div className="bg-primary" style={{ width: `${q.wpHome * 100}%` }} />
                  </div>
                  <div className="flex justify-between mt-1 text-[9px] text-muted-foreground">
                    <span>{formatOdds(q.fairMLAway)}</span>
                    <span>{formatOdds(q.fairMLHome)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Live Win Probability ── */}
      {liveWP && isLive && (
        <section>
          <h3 className="text-xs font-semibold text-cosmic-green uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5" />
            Live Win Probability
          </h3>
          <div className="cosmic-card rounded-xl p-4 border-l-2 border-l-cosmic-green">
            <div className="flex items-center justify-between mb-2">
              <div className="text-center">
                <p className="text-[10px] font-bold text-muted-foreground uppercase">{awayAbbr}</p>
                <p className="text-xl font-bold font-display tabular-nums text-foreground">
                  {formatPct(1 - liveWP.wpGame)}
                </p>
                <p className="text-[9px] text-muted-foreground tabular-nums">{formatOdds(wpToAmericanOdds(1 - liveWP.wpGame))}</p>
              </div>
              <div className="text-center">
                <p className="text-[9px] text-muted-foreground">{liveWP.possessionsRemaining} poss left</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] font-bold text-muted-foreground uppercase">{homeAbbr}</p>
                <p className="text-xl font-bold font-display tabular-nums text-foreground">
                  {formatPct(liveWP.wpGame)}
                </p>
                <p className="text-[9px] text-muted-foreground tabular-nums">{formatOdds(liveWP.fairMLGame)}</p>
              </div>
            </div>
            <div className="h-3 rounded-full overflow-hidden flex bg-secondary">
              <div className="bg-destructive/70 transition-all duration-700" style={{ width: `${(1 - liveWP.wpGame) * 100}%` }} />
              <div className="bg-cosmic-green transition-all duration-700" style={{ width: `${liveWP.wpGame * 100}%` }} />
            </div>
          </div>
        </section>
      )}

      {/* ── Model Inputs (Ratings) ── */}
      {(homeRatings || awayRatings) && (
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
            Model Inputs
          </h3>
          <div className="cosmic-card rounded-xl p-3">
            <div className="grid grid-cols-6 gap-1 text-center text-[9px]">
              <div />
              <div className="font-bold text-muted-foreground">ORtg</div>
              <div className="font-bold text-muted-foreground">DRtg</div>
              <div className="font-bold text-muted-foreground">Net</div>
              <div className="font-bold text-muted-foreground">Pace</div>
              <div className="font-bold text-muted-foreground">GP</div>

              <div className="font-bold text-foreground text-left">{awayAbbr}</div>
              <div className="tabular-nums">{awayRatings?.offRtg.toFixed(1) ?? "—"}</div>
              <div className="tabular-nums">{awayRatings?.defRtg.toFixed(1) ?? "—"}</div>
              <div className={cn("tabular-nums font-semibold", (awayRatings?.netRtg ?? 0) > 0 ? "text-cosmic-green" : "text-destructive")}>
                {awayRatings?.netRtg.toFixed(1) ?? "—"}
              </div>
              <div className="tabular-nums">{awayRatings?.pace.toFixed(1) ?? "—"}</div>
              <div className="tabular-nums">{awayRatings?.gamesPlayed ?? "—"}</div>

              <div className="font-bold text-foreground text-left">{homeAbbr}</div>
              <div className="tabular-nums">{homeRatings?.offRtg.toFixed(1) ?? "—"}</div>
              <div className="tabular-nums">{homeRatings?.defRtg.toFixed(1) ?? "—"}</div>
              <div className={cn("tabular-nums font-semibold", (homeRatings?.netRtg ?? 0) > 0 ? "text-cosmic-green" : "text-destructive")}>
                {homeRatings?.netRtg.toFixed(1) ?? "—"}
              </div>
              <div className="tabular-nums">{homeRatings?.pace.toFixed(1) ?? "—"}</div>
              <div className="tabular-nums">{homeRatings?.gamesPlayed ?? "—"}</div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
