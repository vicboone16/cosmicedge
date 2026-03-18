import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { parsePbpEvent, deriveVisualState, type NormalizedPbpEvent } from "@/lib/pbp-event-parser";
import { useIsAdmin } from "@/hooks/use-admin";
import { WatchHeaderScorebar } from "./watch/WatchHeaderScorebar";
import { LiveCourtCanvas } from "./watch/LiveCourtCanvas";
import { LatestPlayCard } from "./watch/LatestPlayCard";
import { RecentEventsList } from "./watch/RecentEventsList";
import { WatchDebugPanel } from "./watch/WatchDebugPanel";
import { MomentumChip } from "./GameMomentumBanner";
import { useGameMomentum } from "@/hooks/use-game-momentum";

interface PbpWatchViewProps {
  gameId: string;
  homeAbbr: string;
  awayAbbr: string;
  league: string;
}

/* ─── Parse clock strings → seconds ─── */
function parseClockSec(raw: string | null | undefined): number | null {
  if (!raw) return null;
  let cleaned = raw.replace(/^Q\d+\s+/i, "").trim();
  if (/final|half/i.test(cleaned)) return 0;
  if (/^\d+(\.\d+)?$/.test(cleaned)) {
    const val = parseFloat(cleaned);
    return Number.isFinite(val) ? Math.max(0, val) : null;
  }
  cleaned = cleaned.replace(/\.\d+$/, "");
  if (cleaned.startsWith(":")) cleaned = "0" + cleaned;
  const parts = cleaned.split(":");
  if (parts.length !== 2) return null;
  const m = parseInt(parts[0], 10);
  const s = parseInt(parts[1], 10);
  if (isNaN(m) || isNaN(s)) return null;
  return m * 60 + s;
}

export function PbpWatchView({ gameId, homeAbbr, awayAbbr, league }: PbpWatchViewProps) {
  const { isAdmin } = useIsAdmin();
  const momentum = useGameMomentum(gameId, true);
  // ── Live score snapshot ──
  const { data: liveSnapshot } = useQuery({
    queryKey: ["watch-live-score", gameId],
    queryFn: async () => {
      const { data } = await supabase
        .from("game_state_snapshots")
        .select("home_score, away_score, quarter, clock")
        .eq("game_id", gameId)
        .order("captured_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    refetchInterval: 4_000,
  });

  // ── Game key for cosmic pipeline ──
  const { data: gameKey } = useQuery({
    queryKey: ["watch-game-key", gameId],
    queryFn: async () => {
      const { data: game } = await supabase
        .from("games")
        .select("start_time, home_abbr, away_abbr")
        .eq("id", gameId)
        .maybeSingle();
      if (!game) return null;
      const dateStr = game.start_time?.split(/[T ]/)[0];
      const { data: cosmic } = await supabase
        .from("cosmic_games")
        .select("game_key")
        .eq("game_date", dateStr)
        .eq("home_team_abbr", game.home_abbr)
        .eq("away_team_abbr", game.away_abbr)
        .maybeSingle();
      return cosmic?.game_key || null;
    },
  });

  // ── BDL PBP events ──
  const { data: bdlEvents } = useQuery({
    queryKey: ["watch-bdl-pbp", gameId],
    queryFn: async () => {
      const { data } = await supabase
        .from("nba_pbp_events")
        .select("*")
        .eq("game_key", gameId)
        .eq("provider", "balldontlie")
        .order("period", { ascending: true })
        .order("event_ts_game", { ascending: true })
        .limit(1000);
      return (data || []) as any[];
    },
    refetchInterval: 5_000,
  });

  // ── Cosmic pipeline PBP events ──
  const { data: livePbpEvents } = useQuery({
    queryKey: ["watch-live-pbp", gameKey],
    queryFn: async () => {
      const { data } = await supabase
        .from("pbp_events")
        .select("*")
        .eq("game_key", gameKey!)
        .order("period", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(1000);
      return data || [];
    },
    enabled: !!gameKey,
    refetchInterval: 5_000,
  });

  // ── Historical NBA PBP ──
  const { data: historicalEvents } = useQuery({
    queryKey: ["watch-hist-pbp", gameId],
    queryFn: async () => {
      const { data } = await supabase
        .from("nba_play_by_play_events")
        .select("*")
        .eq("game_id", gameId)
        .order("play_id", { ascending: true })
        .limit(1000);
      return (data || []) as any[];
    },
  });

  // ── Admin: visual_event_queue + live_game_visual_state diagnostics ──
  const { data: visualQueueCount } = useQuery({
    queryKey: ["watch-visual-queue", gameId],
    queryFn: async () => {
      const { count } = await supabase
        .from("visual_event_queue")
        .select("id", { count: "exact", head: true })
        .eq("game_id", gameId);
      return count ?? 0;
    },
    enabled: isAdmin,
    refetchInterval: 10_000,
  });

  const { data: visualState_db } = useQuery({
    queryKey: ["watch-live-visual-db", gameId],
    queryFn: async () => {
      const { data } = await supabase
        .from("live_game_visual_state")
        .select("status, source_provider, parser_version, sync_latency_ms, updated_at")
        .eq("game_id", gameId)
        .maybeSingle();
      return data;
    },
    enabled: isAdmin,
    refetchInterval: 10_000,
  });

  // ── Choose best source & normalize ──
  const { normalizedEvents, feedSource } = useMemo(() => {
    let rawEvents: any[] = [];
    let source = "none";

    if (bdlEvents && bdlEvents.length > 0) {
      rawEvents = bdlEvents;
      source = "balldontlie";
    } else if (livePbpEvents && (livePbpEvents as any[]).length > 0) {
      rawEvents = livePbpEvents as any[];
      source = "cosmic";
    } else if (historicalEvents && historicalEvents.length > 0) {
      rawEvents = historicalEvents;
      source = "historical";
    }

    const normalized: NormalizedPbpEvent[] = rawEvents.map((ev: any, i: number) => {
      const parsed = parsePbpEvent({
        id: ev.id || ev.play_id || ev.provider_event_id || String(i),
        game_id: gameId,
        description: ev.description || ev.raw?.text || ev.event_type || "",
        period: ev.period || 1,
        clock: ev.event_ts_game || ev.clock || ev.remaining_time || "",
        team_abbr: ev.team_abbr || ev.team || null,
        player_name: ev.player_name || ev.player || null,
        home_score: ev.home_score ?? ev.raw?.home_score ?? null,
        away_score: ev.away_score ?? ev.raw?.away_score ?? null,
        event_type: ev.event_type || ev.action_type || null,
      });

      // Set clock seconds
      parsed.clockSeconds = parseClockSec(parsed.clockDisplay);
      return parsed;
    });

    return { normalizedEvents: normalized, feedSource: source };
  }, [bdlEvents, livePbpEvents, historicalEvents, gameId]);

  // ── Derive visual state ──
  const currentHomeScore = liveSnapshot?.home_score ?? 0;
  const currentAwayScore = liveSnapshot?.away_score ?? 0;
  const currentPeriod = liveSnapshot?.quarter ? parseInt(String(liveSnapshot.quarter), 10) || 1 : 1;
  const currentClock = liveSnapshot?.clock || "";
  const currentClockSeconds = parseClockSec(currentClock);

  const visualState = useMemo(
    () => deriveVisualState(
      gameId, homeAbbr, awayAbbr,
      normalizedEvents,
      currentHomeScore, currentAwayScore,
      currentPeriod, currentClock, currentClockSeconds,
    ),
    [normalizedEvents, gameId, homeAbbr, awayAbbr, currentHomeScore, currentAwayScore, currentPeriod, currentClock, currentClockSeconds]
  );

  const lastEvent = normalizedEvents.length > 0 ? normalizedEvents[normalizedEvents.length - 1] : null;

  // Determine animation availability reason
  const animationUnavailableReason = (() => {
    if (feedSource === "none") return "No PBP feed source available (BDL/cosmic/historical all empty)";
    if (normalizedEvents.length === 0) return "Feed source selected but 0 normalized events";
    return null;
  })();

  if (feedSource === "none" || normalizedEvents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-3">
        <div className="w-8 h-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
        <p className="text-xs text-muted-foreground">Waiting for live play-by-play feed…</p>
        <div className="text-[9px] text-muted-foreground/60 font-mono space-y-0.5 text-center">
          <p>BDL: {bdlEvents?.length ?? 0} events | Cosmic: {(livePbpEvents as any[])?.length ?? 0} | Historical: {historicalEvents?.length ?? 0}</p>
          <p>Game key: {gameKey ?? "unresolved"} | Source: {feedSource}</p>
        </div>
        {isAdmin && (
          <div className="mx-auto max-w-md cosmic-card rounded-lg p-3 text-left space-y-2 mt-2">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">🎬 Admin Watch Mode Diagnostics</p>
            <div className="text-[9px] text-muted-foreground space-y-0.5 font-mono">
              <p><span className="text-foreground/70">Game ID:</span> {gameId}</p>
              <p><span className="text-foreground/70">Animation:</span> <span className="text-destructive">Unavailable</span></p>
              <p><span className="text-foreground/70">Reason:</span> {animationUnavailableReason}</p>
              <p><span className="text-foreground/70">Visual queue items:</span> {visualQueueCount ?? "N/A"}</p>
              <p><span className="text-foreground/70">Visual state row:</span> {visualState_db ? "✓ exists" : "❌ missing"}</p>
              {visualState_db && (
                <>
                  <p><span className="text-foreground/70">VS status:</span> {visualState_db.status ?? "—"}</p>
                  <p><span className="text-foreground/70">VS provider:</span> {visualState_db.source_provider ?? "—"}</p>
                  <p><span className="text-foreground/70">VS updated:</span> {visualState_db.updated_at ?? "—"}</p>
                </>
              )}
            </div>
            <div className="border-t border-border/20 pt-1.5 text-[9px] text-cosmic-gold space-y-0.5">
              <p>⚠ Check:</p>
              <p className="pl-2">• Is pbp-watch-sync edge function running?</p>
              <p className="pl-2">• Does nba_pbp_events have rows with game_key={gameId}?</p>
              <p className="pl-2">• Is visual_event_queue being populated?</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header scorebar */}
      <WatchHeaderScorebar state={visualState} />

      {/* Court visualizer */}
      <LiveCourtCanvas
        lastEvent={lastEvent}
        recentEvents={normalizedEvents}
        possessionTeamId={visualState.possessionTeamId}
        homeTeamId={homeAbbr}
        awayTeamId={awayAbbr}
      />

      {/* Momentum + Insight chips */}
      <div className="flex flex-wrap gap-1.5 items-center">
        <MomentumChip gameId={gameId} isLive />
        {momentum?.paceEstimate != null && (
          <span className="text-[9px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
            Pace {momentum.paceEstimate.toFixed(0)}
          </span>
        )}
        {momentum?.inBonusHome && (
          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-cosmic-gold/10 text-cosmic-gold border border-cosmic-gold/20">
            {homeAbbr} Bonus
          </span>
        )}
        {momentum?.inBonusAway && (
          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-cosmic-gold/10 text-cosmic-gold border border-cosmic-gold/20">
            {awayAbbr} Bonus
          </span>
        )}
        {visualState.recentRunHome > 0 && (
          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
            {homeAbbr} {visualState.recentRunHome}–{visualState.recentRunAway} run
          </span>
        )}
        {visualState.recentRunAway > 0 && visualState.recentRunAway > visualState.recentRunHome && (
          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-cosmic-cyan/10 text-cosmic-cyan border border-cosmic-cyan/20">
            {awayAbbr} {visualState.recentRunAway}–{visualState.recentRunHome} run
          </span>
        )}
        {momentum?.droughtHomeSec != null && momentum.droughtHomeSec >= 120 && (
          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/20">
            {homeAbbr} drought {Math.floor(momentum.droughtHomeSec / 60)}:{(momentum.droughtHomeSec % 60).toString().padStart(2, "0")}
          </span>
        )}
        {momentum?.droughtAwaySec != null && momentum.droughtAwaySec >= 120 && (
          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/20">
            {awayAbbr} drought {Math.floor(momentum.droughtAwaySec / 60)}:{(momentum.droughtAwaySec % 60).toString().padStart(2, "0")}
          </span>
        )}
      </div>

      {/* Latest play card */}
      <LatestPlayCard event={lastEvent} homeAbbr={homeAbbr} awayAbbr={awayAbbr} />

      {/* Recent events list */}
      <RecentEventsList events={normalizedEvents} homeAbbr={homeAbbr} awayAbbr={awayAbbr} />

      {/* Debug panel (admin only, always shown in Watch mode) */}
      <WatchDebugPanel
        lastEvent={lastEvent}
        recentEvents={normalizedEvents}
        eventCount={normalizedEvents.length}
        feedSource={feedSource}
        gameId={gameId}
      />

      {/* Admin animation diagnostics */}
      {isAdmin && (
        <div className="cosmic-card rounded-lg p-3 text-left space-y-1.5">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">🎬 Animation Runtime</p>
          <div className="text-[9px] text-muted-foreground space-y-0.5 font-mono">
            <p><span className="text-foreground/70">Animation:</span> <span className="text-cosmic-green">Active</span> ({normalizedEvents.length} events)</p>
            <p><span className="text-foreground/70">Feed:</span> {feedSource}</p>
            <p><span className="text-foreground/70">Visual queue:</span> {visualQueueCount ?? "N/A"} items</p>
            <p><span className="text-foreground/70">Visual state row:</span> {visualState_db ? `✓ (${visualState_db.status ?? "—"}, provider: ${visualState_db.source_provider ?? "—"})` : "❌ missing"}</p>
            {visualState_db?.updated_at && (
              <p><span className="text-foreground/70">VS last updated:</span> {new Date(visualState_db.updated_at).toLocaleTimeString()}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
