/**
 * OracleTab — Full pregame prediction breakdown + live WP + quarter ML
 * Instant: live-adjusted win probability (uses current score + estimated clock)
 * StellarLine: server-computed pregame predictions (oracle_ml model)
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useOracle, type StoredPrediction } from "@/hooks/use-oracle";
import { classifyEdge, wpToAmericanOdds } from "@/lib/oracle-engine";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, TrendingDown, Zap, Target, BarChart3, Clock, Activity, Database, Cpu } from "lucide-react";

function formatOdds(odds: number): string {
  if (!odds) return "—";
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function formatPct(val: number): string {
  return `${(val * 100).toFixed(1)}%`;
}

type PredSource = "live" | "stored";

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
  homeScore?: number | null;
  awayScore?: number | null;
  isLive?: boolean;
}

export function OracleTab({
  gameId, homeAbbr, awayAbbr, homeTeam, awayTeam, league,
  bookMLHome, bookMLAway, bookSpread, bookTotal,
  homeScore, awayScore, isLive,
}: Props) {
  const [source, setSource] = useState<PredSource>("live");
  const [selectedVersion, setSelectedVersion] = useState("v1");
  const scoreDiff = (homeScore ?? 0) - (awayScore ?? 0);

  // Fetch actual game clock from latest snapshot for live games
  const { data: latestSnapshot } = useQuery({
    queryKey: ["game-snapshot-clock", gameId],
    queryFn: async () => {
      const { data } = await supabase
        .from("game_state_snapshots")
        .select("quarter, clock, home_score, away_score")
        .eq("game_id", gameId)
        .order("captured_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!isLive && !!gameId,
    staleTime: 15_000,
    refetchInterval: 15_000,
  });

  // Compute time remaining from snapshot data
  const sportGameSec = league === "NFL" ? 3600 : league === "NHL" ? 3600 : league === "MLB" ? 10800 : 2880;
  const sportPeriods = league === "NHL" ? 3 : league === "MLB" ? 9 : 4;
  const periodLengthSec = sportGameSec / sportPeriods;

  const estimatedTimeRemaining = useMemo(() => {
    if (!isLive) return undefined;
    if (!latestSnapshot) return Math.round(sportGameSec / 2); // fallback

    // Parse quarter number
    const qRaw = (latestSnapshot.quarter ?? "").trim();
    let qNum = 0;
    const otMatch = qRaw.toLowerCase().match(/^ot(\d*)$/);
    if (otMatch) {
      qNum = 4 + (otMatch[1] ? parseInt(otMatch[1]) : 1);
    } else {
      const qMatch = qRaw.match(/^Q?(\d+)$/i);
      if (qMatch) qNum = parseInt(qMatch[1]);
    }
    if (qNum < 1) return Math.round(sportGameSec / 2);

    // Parse clock "MM:SS", "M:SS", or bare minutes "2"
    let clockSec = periodLengthSec / 2; // default to mid-period
    if (latestSnapshot.clock) {
      const raw = latestSnapshot.clock.trim();
      const parts = raw.split(":");
      if (parts.length === 2) {
        clockSec = parseInt(parts[0]) * 60 + parseInt(parts[1]);
      } else if (parts.length === 1 && /^\d+$/.test(raw)) {
        // Bare number — treat as minutes remaining in the period
        clockSec = parseInt(raw) * 60;
      }
    }

    // Time remaining = remaining periods * period length + clock in current period
    const remainingPeriods = Math.max(0, sportPeriods - qNum);
    return remainingPeriods * periodLengthSec + clockSec;
  }, [isLive, latestSnapshot, sportGameSec, sportPeriods, periodLengthSec]);

  const liveQuarter = useMemo(() => {
    if (!latestSnapshot?.quarter) return undefined;
    const qRaw = (latestSnapshot.quarter ?? "").trim();
    const otMatch = qRaw.toLowerCase().match(/^ot(\d*)$/);
    if (otMatch) return 4 + (otMatch[1] ? parseInt(otMatch[1]) : 1);
    const qMatch = qRaw.match(/^Q?(\d+)$/i);
    return qMatch ? parseInt(qMatch[1]) : undefined;
  }, [latestSnapshot]);

  const {
    pregame, quarters, liveWP, isLoading, homeRatings, awayRatings,
    storedPredictions, storedLoading,
  } = useOracle(
    gameId, homeAbbr, awayAbbr, league,
    bookMLHome, bookMLAway, bookSpread, bookTotal,
    scoreDiff,
    estimatedTimeRemaining,
    0, liveQuarter, isLive,
  );

  // Get available versions from stored predictions
  const availableVersions = useMemo(() => {
    const versions = [...new Set(storedPredictions.map(p => p.model_version))];
    return versions.length > 0 ? versions : ["v1"];
  }, [storedPredictions]);

  // Get the latest stored prediction for selected version
  const selectedStored = useMemo(() => {
    return storedPredictions.find(p => p.model_version === selectedVersion) || null;
  }, [storedPredictions, selectedVersion]);

  // Build a unified display object from either source
  // When live + source="live": show live WP prominently (game/half/quarter scopes)
  // When source="stored": show server-computed StellarLine pregame projection
  // When not live + source="live": show on-device pregame
  const display = useMemo(() => {
    if (source === "stored" && selectedStored) {
      return {
        muHome: selectedStored.mu_home ?? 0,
        muAway: selectedStored.mu_away ?? 0,
        muTotal: selectedStored.mu_total ?? 0,
        muSpreadHome: selectedStored.mu_spread_home ?? 0,
        pHomeWin: selectedStored.p_home_win ?? 0.5,
        pAwayWin: selectedStored.p_away_win ?? 0.5,
        fairMLHome: selectedStored.fair_ml_home ?? 0,
        fairMLAway: selectedStored.fair_ml_away ?? 0,
        expectedPossessions: selectedStored.expected_possessions ?? 0,
        blowoutRisk: selectedStored.blowout_risk ?? 0,
        bookImpliedHome: selectedStored.book_implied_home,
        edgeHome: selectedStored.edge_home,
        edgeAway: selectedStored.edge_away,
        pHomeWinCILow: selectedStored.p_home_win_ci_low ?? 0,
        pHomeWinCIHigh: selectedStored.p_home_win_ci_high ?? 1,
        runTs: selectedStored.run_ts,
        features: selectedStored.features_json,
        isLiveAdjusted: false,
        isServerModel: true,
      };
    }
    if (pregame) {
      // For "live" source during active game, we'll show live WP scopes separately
      // The pregame data still provides projected scores/edge for context
      return {
        ...pregame,
        runTs: null,
        features: null,
        isLiveAdjusted: isLive && !!liveWP,
        isServerModel: false,
      };
    }
    return null;
  }, [source, selectedStored, pregame, isLive, liveWP]);

  const homeEdgeInfo = useMemo(() => {
    if (!display || display.edgeHome == null) return null;
    return classifyEdge(Math.abs(display.edgeHome), display.blowoutRisk);
  }, [display]);

  // Quarter data from stored or live
  const displayQuarters = useMemo(() => {
    if (source === "stored" && selectedStored?.qtr_wp_home && selectedStored?.qtr_fair_ml) {
      return selectedStored.qtr_wp_home.map((wp, i) => ({
        quarter: i + 1,
        label: league === "NHL" ? `P${i + 1}` : `Q${i + 1}`,
        muHome: 0, muAway: 0, muTotal: 0, muSpread: 0,
        wpHome: wp,
        fairMLHome: selectedStored.qtr_fair_ml![i]?.home ?? 0,
        fairMLAway: selectedStored.qtr_fair_ml![i]?.away ?? 0,
      }));
    }
    return quarters;
  }, [source, selectedStored, quarters, league]);

  if (isLoading && storedLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="text-sm text-muted-foreground">Computing Oracle predictions...</span>
      </div>
    );
  }

  if (!display) {
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
      {/* ── Source + Version Selector ── */}
      <div className="flex items-center gap-2">
        {storedPredictions.length > 0 ? (
          <>
            <div className="flex items-center gap-1 bg-secondary rounded-lg p-0.5 flex-1">
              <button
                onClick={() => setSource("live")}
                className={cn(
                  "flex-1 py-1.5 rounded-md text-[11px] font-semibold transition-colors text-center flex items-center justify-center gap-1",
                  source === "live" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Cpu className="h-3 w-3" /> {isLive ? "Live" : "Instant"}
              </button>
              <button
                onClick={() => setSource("stored")}
                className={cn(
                  "flex-1 py-1.5 rounded-md text-[11px] font-semibold transition-colors text-center flex items-center justify-center gap-1",
                  source === "stored" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Database className="h-3 w-3" /> StellarLine
              </button>
            </div>
            {source === "stored" && availableVersions.length > 1 && (
              <div className="flex items-center gap-1 bg-secondary rounded-lg p-0.5">
                {availableVersions.map(v => (
                  <button
                    key={v}
                    onClick={() => setSelectedVersion(v)}
                    className={cn(
                      "px-2 py-1.5 rounded-md text-[11px] font-semibold transition-colors",
                      selectedVersion === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {v}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="text-[9px] text-muted-foreground flex items-center gap-1">
            <Cpu className="h-3 w-3" /> {isLive ? "Live Projection" : "Instant Projection"}
          </p>
        )}
      </div>

      {/* Source context info */}
      {source === "stored" && display.runTs && (
        <p className="text-[9px] text-muted-foreground text-center">
          Run: {new Date(display.runTs).toLocaleString()} · Model: oracle_ml {selectedVersion}
        </p>
      )}
      {source === "live" && isLive && estimatedTimeRemaining != null && (
        <p className="text-[9px] text-cosmic-green text-center flex items-center justify-center gap-1">
          <Activity className="h-3 w-3" />
          Live · Score: {homeScore ?? 0}–{awayScore ?? 0} · ~{Math.floor(estimatedTimeRemaining / 60)}:{String(estimatedTimeRemaining % 60).padStart(2, "0")} remaining
          {liveQuarter ? ` · ${league === "NHL" ? "P" : "Q"}${liveQuarter}` : ""}
        </p>
      )}

      {/* ── Live Win Probability Scopes (PRIMARY for live games) ── */}
      {liveWP && isLive && source === "live" && (
        <section>
          <h3 className="text-xs font-semibold text-cosmic-green uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5" />
            Live Win Probability
          </h3>
          <div className="space-y-2">
            {/* Game WP */}
            <div className="cosmic-card rounded-xl p-4 border-l-2 border-l-cosmic-green">
              <p className="text-[9px] font-bold text-cosmic-green uppercase tracking-wider mb-2">Full Game</p>
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

            {/* Half + Quarter WP side-by-side */}
            <div className="grid grid-cols-2 gap-2">
              {/* Half WP */}
              <div className="cosmic-card rounded-lg p-3 border-l-2 border-l-primary/50">
                <p className="text-[9px] font-bold text-primary uppercase tracking-wider mb-1.5">
                  {league === "NHL" ? "Period" : "Half"}
                </p>
                <div className="flex items-center justify-between mb-1">
                  <div className="text-center">
                    <p className="text-[9px] text-muted-foreground">{awayAbbr}</p>
                    <p className="text-sm font-bold tabular-nums">{formatPct(1 - liveWP.wpHalf)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[9px] text-muted-foreground">{homeAbbr}</p>
                    <p className="text-sm font-bold tabular-nums">{formatPct(liveWP.wpHalf)}</p>
                  </div>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden flex bg-secondary">
                  <div className="bg-destructive/60" style={{ width: `${(1 - liveWP.wpHalf) * 100}%` }} />
                  <div className="bg-primary" style={{ width: `${liveWP.wpHalf * 100}%` }} />
                </div>
                <div className="flex justify-between mt-1 text-[8px] text-muted-foreground tabular-nums">
                  <span>{formatOdds(wpToAmericanOdds(1 - liveWP.wpHalf))}</span>
                  <span>{formatOdds(liveWP.fairMLHalf)}</span>
                </div>
              </div>

              {/* Quarter WP */}
              <div className="cosmic-card rounded-lg p-3 border-l-2 border-l-accent/50">
                <p className="text-[9px] font-bold text-accent uppercase tracking-wider mb-1.5">
                  {league === "NHL" ? `P${liveQuarter ?? ""}` : league === "MLB" ? `Inn ${liveQuarter ?? ""}` : `Q${liveQuarter ?? ""}`}
                </p>
                <div className="flex items-center justify-between mb-1">
                  <div className="text-center">
                    <p className="text-[9px] text-muted-foreground">{awayAbbr}</p>
                    <p className="text-sm font-bold tabular-nums">{formatPct(1 - liveWP.wpQuarter)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[9px] text-muted-foreground">{homeAbbr}</p>
                    <p className="text-sm font-bold tabular-nums">{formatPct(liveWP.wpQuarter)}</p>
                  </div>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden flex bg-secondary">
                  <div className="bg-destructive/60" style={{ width: `${(1 - liveWP.wpQuarter) * 100}%` }} />
                  <div className="bg-accent" style={{ width: `${liveWP.wpQuarter * 100}%` }} />
                </div>
                <div className="flex justify-between mt-1 text-[8px] text-muted-foreground tabular-nums">
                  <span>{formatOdds(wpToAmericanOdds(1 - liveWP.wpQuarter))}</span>
                  <span>{formatOdds(liveWP.fairMLQuarter)}</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

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
              <p className="text-3xl font-bold font-display tabular-nums text-foreground">{display.muAway}</p>
            </div>
            <div className="text-center px-4">
              <p className="text-[10px] text-muted-foreground uppercase">vs</p>
              <p className="text-xs font-semibold text-muted-foreground mt-1">O/U {display.muTotal}</p>
            </div>
            <div className="text-center flex-1">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{homeAbbr}</p>
              <p className="text-3xl font-bold font-display tabular-nums text-foreground">{display.muHome}</p>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-border/30 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Spread: {display.muSpreadHome > 0 ? `${homeAbbr} -${Math.abs(display.muSpreadHome)}` : `${awayAbbr} -${Math.abs(display.muSpreadHome)}`}</span>
            {display.expectedPossessions ? <span>{display.expectedPossessions} est. possessions</span> : null}
          </div>
        </div>
      </section>

      {/* ── Win Probability (Pregame Model) ── */}
      <section>
        <h3 className="text-xs font-semibold text-primary uppercase tracking-widest mb-3 flex items-center gap-1.5">
          <BarChart3 className="h-3.5 w-3.5" />
          {display.isLiveAdjusted ? "Pregame Model" : "Win Probability"}
        </h3>
        <div className="cosmic-card rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-center">
              <p className="text-[10px] font-bold text-muted-foreground uppercase">{awayAbbr}</p>
              <p className={cn(
                "text-xl font-bold font-display tabular-nums",
                display.pAwayWin > display.pHomeWin ? "text-cosmic-green" : "text-muted-foreground"
              )}>
                {formatPct(display.pAwayWin)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-[10px] font-bold text-muted-foreground uppercase">{homeAbbr}</p>
              <p className={cn(
                "text-xl font-bold font-display tabular-nums",
                display.pHomeWin > display.pAwayWin ? "text-cosmic-green" : "text-muted-foreground"
              )}>
                {formatPct(display.pHomeWin)}
              </p>
            </div>
          </div>
          <div className="h-3 rounded-full overflow-hidden flex bg-secondary">
            <div className="bg-destructive/70 transition-all duration-500" style={{ width: `${display.pAwayWin * 100}%` }} />
            <div className="bg-primary transition-all duration-500" style={{ width: `${display.pHomeWin * 100}%` }} />
          </div>
          <div className="mt-3 flex items-center justify-between text-[10px]">
            <div>
              <span className="text-muted-foreground">Fair ML: </span>
              <span className="font-semibold text-foreground tabular-nums">{formatOdds(display.fairMLAway)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Fair ML: </span>
              <span className="font-semibold text-foreground tabular-nums">{formatOdds(display.fairMLHome)}</span>
            </div>
          </div>
          <div className="mt-1 text-[9px] text-muted-foreground text-center">
            90% CI: {formatPct(display.pHomeWinCILow)} – {formatPct(display.pHomeWinCIHigh)} ({homeAbbr})
          </div>
        </div>
      </section>

      {/* ── Edge vs Book ── */}
      {(display.edgeHome != null || display.edgeAway != null) && (
        <section>
          <h3 className="text-xs font-semibold text-primary uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5" />
            Edge vs Book
          </h3>
          <div className="cosmic-card rounded-xl p-4 space-y-3">
            <div className="grid grid-cols-2 gap-4">
              {display.edgeAway != null && (
                <div className="text-center">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase">{awayAbbr}</p>
                  <p className={cn(
                    "text-lg font-bold font-display tabular-nums",
                    display.edgeAway > 0.02 ? "text-cosmic-green" : display.edgeAway < -0.02 ? "text-destructive" : "text-muted-foreground"
                  )}>
                    {display.edgeAway > 0 ? "+" : ""}{(display.edgeAway * 100).toFixed(1)}%
                  </p>
                  <p className="text-[9px] text-muted-foreground">
                    Model: {formatPct(display.pAwayWin)} vs Book: {display.bookImpliedHome != null ? formatPct(1 - display.bookImpliedHome) : "—"}
                  </p>
                </div>
              )}
              {display.edgeHome != null && (
                <div className="text-center">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase">{homeAbbr}</p>
                  <p className={cn(
                    "text-lg font-bold font-display tabular-nums",
                    display.edgeHome > 0.02 ? "text-cosmic-green" : display.edgeHome < -0.02 ? "text-destructive" : "text-muted-foreground"
                  )}>
                    {display.edgeHome > 0 ? "+" : ""}{(display.edgeHome * 100).toFixed(1)}%
                  </p>
                  <p className="text-[9px] text-muted-foreground">
                    Model: {formatPct(display.pHomeWin)} vs Book: {display.bookImpliedHome != null ? formatPct(display.bookImpliedHome) : "—"}
                  </p>
                </div>
              )}
            </div>
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
            {display.blowoutRisk > 0.3 && (
              <p className="text-[9px] text-destructive text-center">
                ⚠ Blowout risk: {(display.blowoutRisk * 100).toFixed(0)}% — reduced edge reliability
              </p>
            )}
          </div>
        </section>
      )}

      {/* ── Quarter/Period & Half Predictions ── */}
      {displayQuarters.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-primary uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            {league === "NHL" ? "Period" : "Quarter & Half"} Projections
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {displayQuarters.map(q => {
              const label = q.label || (league === "NHL" ? `P${q.quarter}` : league === "MLB" ? `Inn ${q.quarter}` : `Q${q.quarter}`);
              const favHome = q.wpHome >= 0.5;
              const hasScores = q.muHome > 0 || q.muAway > 0;
              return (
                <div key={`${q.quarter}-${q.label}`} className="cosmic-card rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase">{label}</span>
                    <span className={cn(
                      "text-[10px] font-bold",
                      favHome ? "text-primary" : "text-destructive/80"
                    )}>
                      {favHome ? homeAbbr : awayAbbr} {formatPct(favHome ? q.wpHome : 1 - q.wpHome)}
                    </span>
                  </div>
                  {hasScores && (
                    <div className="flex justify-between text-[10px] mb-1.5 tabular-nums">
                      <span className="text-muted-foreground">{awayAbbr} <span className="text-foreground font-semibold">{q.muAway}</span></span>
                      <span className="text-muted-foreground text-[9px]">O/U {q.muTotal}</span>
                      <span className="text-muted-foreground">{homeAbbr} <span className="text-foreground font-semibold">{q.muHome}</span></span>
                    </div>
                  )}
                  <div className="h-1.5 rounded-full overflow-hidden flex bg-secondary">
                    <div className="bg-destructive/60" style={{ width: `${(1 - q.wpHome) * 100}%` }} />
                    <div className="bg-primary" style={{ width: `${q.wpHome * 100}%` }} />
                  </div>
                  <div className="flex justify-between mt-1 text-[9px] text-muted-foreground">
                    <span>{formatOdds(q.fairMLAway)}</span>
                    {hasScores && <span className="text-foreground">Sprd {q.muSpread > 0 ? "+" : ""}{q.muSpread}</span>}
                    <span>{formatOdds(q.fairMLHome)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* (Live WP scopes moved above, shown inline after source selector) */}

      {/* ── Model Inputs (Ratings) ── */}
      {source === "live" && (homeRatings || awayRatings) && (
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

      {/* ── Server Features (when stored is selected) ── */}
      {source === "stored" && display.features && (
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
            Features (Server)
          </h3>
          <div className="cosmic-card rounded-xl p-3">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[9px]">
              {Object.entries(display.features).map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span className="text-muted-foreground">{k.replace(/_/g, " ")}</span>
                  <span className="font-semibold tabular-nums text-foreground">{typeof v === "number" ? v.toFixed(2) : String(v)}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
