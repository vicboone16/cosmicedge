import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useIsAdmin } from "@/hooks/use-admin";
import { PbpWatchView } from "./PbpWatchView";

interface PlayByPlayTabProps {
  gameId: string;
  homeAbbr: string;
  awayAbbr: string;
  league: string;
  gameStatus?: string;
}

/* ─── Win‑probability helper (client‑side logistic, mirrors server model) ─── */
function computeWP(
  homeScore: number,
  awayScore: number,
  quarter: number,
  clockSecRemaining: number,
  sport: string = "NBA"
): number {
  const sd = homeScore - awayScore;
  let T: number, sigma: number, periodCount: number;
  switch (sport) {
    case "NFL": T = 3600; sigma = 14; periodCount = 4; break;
    case "NHL": T = 3600; sigma = 2.5; periodCount = 3; break;
    case "MLB": T = 54; sigma = 4; periodCount = 9; break;
    default: T = 2880; sigma = 12.5; periodCount = 4;
  }
  const elapsed = Math.min(
    T,
    (quarter - 1) * (T / periodCount) + ((T / periodCount) - clockSecRemaining)
  );
  const remaining = Math.max(T - elapsed, 1);
  const beta1 = 1.6, beta4 = 0.15;
  const timeRatio = elapsed / Math.max(T, 1);
  const z = beta1 * (sd / sigma) * Math.log((T + 1) / (remaining + 1))
          + beta4 * Math.sqrt(timeRatio);
  const wp = 1 / (1 + Math.exp(-z));
  return Math.max(0.001, Math.min(0.999, wp));
}

/* ─── Parse clock strings like "5:32", "Q2 5:32", "12:00.0", "0.1" → seconds ─── */
function parseClockToSeconds(raw: string | null | undefined): number | null {
  if (!raw) return null;
  let cleaned = raw.replace(/^Q\d+\s+/i, "").trim();
  if (/final|half/i.test(cleaned)) return 0;

  // If value is a pure decimal number (e.g. "0.1", "22.6", "125.4") treat as raw seconds
  if (/^\d+(\.\d+)?$/.test(cleaned)) {
    const val = parseFloat(cleaned);
    if (Number.isFinite(val)) return Math.max(0, val);
    return null;
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

/* ─── Format clock display — sport-aware ─── */
function formatClock(seconds: number | null, eventType?: string | null, periodNum?: number, league?: string): string {
  if (seconds == null) return "";

  // Detect period-ending events
  const isPeriodEnd = eventType != null &&
    /end.?(period|quarter|half|inning)|period.?end|end_of/i.test(eventType);

  if (isPeriodEnd) {
    if (league === "NHL") {
      if (periodNum != null && periodNum <= 3) return `End of P${periodNum}`;
      return "End of OT";
    }
    if (league === "MLB") return `End of Inning ${periodNum ?? ""}`;
    if (periodNum === 2) return "Halftime";
    const label = periodNum != null && periodNum <= 4 ? `Q${periodNum}` : periodNum != null ? `OT${periodNum - 4}` : "Quarter";
    return `End of ${label}`;
  }

  // MLB uses outs not clock time — display differently
  if (league === "MLB") {
    if (seconds === 0) return "";
    return `${seconds} out${seconds !== 1 ? "s" : ""}`;
  }

  // Sub-second or effectively zero → display 0:00
  if (seconds < 1) return "0:00";

  const whole = Math.floor(seconds);
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/* ─── Resolve "Player XXXX" strings via BDL cache ─── */
async function resolvePlayerNames(events: any[]): Promise<Map<string, string>> {
  const idPattern = /^Player (\d+)$/;
  const playerFields = ["player", "player_name"];
  const idsToResolve = new Set<string>();

  for (const ev of events) {
    for (const field of playerFields) {
      const val = ev[field];
      if (typeof val === "string") {
        const match = val.match(idPattern);
        if (match) idsToResolve.add(match[1]);
      }
    }
    // Also check description for "Player XXXX" patterns
    if (typeof ev.description === "string") {
      const matches = ev.description.matchAll(/Player (\d+)/g);
      for (const m of matches) idsToResolve.add(m[1]);
    }
  }

  if (idsToResolve.size === 0) return new Map();

  const { data: cached } = await supabase
    .from("bdl_player_cache" as any)
    .select("bdl_id,first_name,last_name")
    .in("bdl_id", [...idsToResolve]);

  const nameMap = new Map<string, string>();
  for (const c of (cached || []) as any[]) {
    const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
    if (name) nameMap.set(c.bdl_id, name);
  }
  return nameMap;
}

function applyNameResolution(text: string | null, nameMap: Map<string, string>): string | null {
  if (!text) return text;
  return text.replace(/Player (\d+)/g, (match, id) => {
    return nameMap.get(id) || match;
  });
}

/* ─── Normalized event structure ─── */
interface NormalizedEvent {
  key: string;
  period: number;
  clockSeconds: number | null;
  clockDisplay: string;
  team: string | null;
  player: string | null;
  description: string | null;
  homeScore: number | null;
  awayScore: number | null;
  wp: number | null; // home win probability 0-1
}

export function PlayByPlayTab({ gameId, homeAbbr, awayAbbr, league, gameStatus }: PlayByPlayTabProps) {
  const [periodFilter, setPeriodFilter] = useState<number | null>(null);
  const [mode, setMode] = useState<"read" | "watch">("read");
  const { isAdmin } = useIsAdmin();
  const isNBA = league === "NBA";
  const isMLB = league === "MLB";
  const isNHL = league === "NHL";

  // Feature flag + gating: show Watch toggle for games with PBP data
  const ENABLE_PBP_WATCH_MODE = true;
  const isLiveGame = gameStatus === "live" || gameStatus === "in_progress";
  const isFinalGame = gameStatus === "final";
  // Watch mode currently only for NBA; read mode for all leagues
  const showWatchToggle = isNBA && ENABLE_PBP_WATCH_MODE && (isAdmin || isLiveGame || isFinalGame);

  // ── Live score from game_state_snapshots (authoritative) ──
  const { data: liveSnapshot } = useQuery({
    queryKey: ["pbp-live-score", gameId],
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
    refetchInterval: 10_000,
  });

  // ── Game key lookup for pbp_events ──
  const gameKeyQuery = useQuery({
    queryKey: ["game-key-lookup", gameId],
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
    enabled: isNBA,
  });

  // ── Live pbp_events (cosmic pipeline) ──
  const { data: livePbpEvents, isLoading: livePbpLoading } = useQuery({
    queryKey: ["live-pbp-events", gameKeyQuery.data],
    queryFn: async () => {
      const { data } = await supabase
        .from("pbp_events")
        .select("*")
        .eq("game_key", gameKeyQuery.data!)
        .order("period", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(1000);
      return data || [];
    },
    enabled: isNBA && !!gameKeyQuery.data,
    refetchInterval: isLiveGame ? 5000 : 30000,
  });

  // ── BDL provider pbp events ──
  const { data: bdlPbpEvents, isLoading: bdlPbpLoading } = useQuery({
    queryKey: ["bdl-pbp-events", gameId],
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
    enabled: isNBA,
    refetchInterval: isLiveGame ? 5000 : 30000,
  });

  // ── Historical nba_play_by_play_events ──
  const { data: nbaEvents, isLoading: nbaLoading } = useQuery({
    queryKey: ["nba-pbp", gameId],
    queryFn: async () => {
      const { data } = await supabase
        .from("nba_play_by_play_events")
        .select("*")
        .eq("game_id", gameId)
        .order("play_id", { ascending: true })
        .limit(1000);
      if (data && data.length > 0) return data;

      const { data: gameData } = await supabase
        .from("games")
        .select("external_id, home_abbr, away_abbr, start_time")
        .eq("id", gameId)
        .maybeSingle();
      if (!gameData) return [];

      if (gameData.external_id) {
        const extId = gameData.external_id;
        const extIds = [...new Set([extId, "00" + extId, "002" + extId])];
        for (const eid of extIds) {
          const { data: eventsById } = await supabase
            .from("nba_play_by_play_events")
            .select("*")
            .eq("game_id", eid)
            .order("play_id", { ascending: true })
            .limit(1000);
          if (eventsById && eventsById.length > 0) return eventsById;
        }
      }

      if (gameData.start_time && gameData.home_abbr && gameData.away_abbr) {
        const gameDate = gameData.start_time.split(/[T ]/)[0];
        const d = new Date(gameData.start_time);
        const prevDay = new Date(d.getTime() - 86400000).toISOString().split("T")[0];
        const nextDay = new Date(d.getTime() + 86400000).toISOString().split("T")[0];
        for (const dateCandidate of [gameDate, prevDay, nextDay]) {
          const { data: eventsByTeam } = await supabase
            .from("nba_play_by_play_events")
            .select("*")
            .eq("home_team", gameData.home_abbr)
            .eq("away_team", gameData.away_abbr)
            .eq("date", dateCandidate)
            .order("play_id", { ascending: true })
            .limit(1000);
          if (eventsByTeam && eventsByTeam.length > 0) return eventsByTeam;
        }
      }
      return [];
    },
    enabled: isNBA,
  });

  // ── Generic PBP (non-NBA) ──
  const { data: genericEvents, isLoading: genericLoading } = useQuery({
    queryKey: ["generic-pbp", gameId],
    queryFn: async () => {
      const { data } = await supabase
        .from("play_by_play")
        .select("*")
        .eq("game_id", gameId)
        .order("sequence", { ascending: true })
        .limit(1000);
      return data || [];
    },
    enabled: !isNBA,
  });

  const isLoading = isNBA ? (nbaLoading && livePbpLoading && bdlPbpLoading) : genericLoading;

  // ── Choose best source ──
  const rawSource = isNBA
    ? (bdlPbpEvents && bdlPbpEvents.length > 0
        ? "bdl"
        : livePbpEvents && (livePbpEvents as any[]).length > 0
        ? "live"
        : "historical")
    : "generic";

  const rawEvents: any[] = isNBA
    ? rawSource === "bdl" ? bdlPbpEvents || []
      : rawSource === "live" ? (livePbpEvents as any[]) || []
      : (nbaEvents as any[]) || []
    : (genericEvents as any[]) || [];

  // ── Resolve player names (BDL IDs) ──
  const { data: nameMap } = useQuery({
    queryKey: ["pbp-name-resolve", rawSource, rawEvents.length],
    queryFn: async () => resolvePlayerNames(rawEvents),
    enabled: rawEvents.length > 0,
    staleTime: 120_000,
  });

  // ── Normalize & sort events ──
  const normalizedEvents: NormalizedEvent[] = useMemo(() => {
    const names = nameMap || new Map<string, string>();

    return rawEvents.map((ev: any, i: number) => {
      let period: number;
      let clockRaw: string | null;
      let team: string | null;
      let player: string | null;
      let desc: string | null;
      let homeScore: number | null;
      let awayScore: number | null;
      let key: string;

      if (rawSource === "bdl") {
        period = ev.period ?? 1;
        clockRaw = ev.event_ts_game;
        team = ev.team_abbr;
        player = ev.player_name;
        desc = ev.description || ev.raw?.text || ev.event_type || null;
        homeScore = ev.home_score ?? ev.raw?.home_score ?? null;
        awayScore = ev.away_score ?? ev.raw?.away_score ?? null;
        key = `bdl-${ev.id ?? ev.provider_event_id ?? i}`;
      } else if (rawSource === "live") {
        period = ev.period ?? 1;
        clockRaw = ev.clock;
        team = ev.team_abbr;
        player = ev.player_name;
        desc = ev.description;
        homeScore = ev.home_score;
        awayScore = ev.away_score;
        key = `live-${ev.provider_event_id ?? ev.id ?? i}`;
      } else if (rawSource === "historical") {
        period = ev.period ?? 1;
        clockRaw = ev.remaining_time;
        team = ev.team;
        player = ev.player;
        desc = ev.description;
        homeScore = ev.home_score;
        awayScore = ev.away_score;
        key = `hist-${ev.play_id ?? i}`;
      } else {
        // generic
        period = ev.quarter ?? ev.period ?? 1;
        clockRaw = ev.clock;
        team = ev.team_abbr;
        player = ev.player_name || ev.player_id;
        desc = ev.description;
        homeScore = ev.home_score;
        awayScore = ev.away_score;
        key = `gen-${ev.id ?? i}`;
      }

      // Resolve player names
      player = applyNameResolution(player, names);
      desc = applyNameResolution(desc, names);

      // Fallback: if player is still a numeric-only string, show "Unknown Player"
      if (player && /^\d+$/.test(player.trim())) {
        player = "Unknown Player";
      }

      const clockSeconds = parseClockToSeconds(clockRaw);
      const eventType = ev.event_type || ev.action_type || ev.EventType || null;
      const clockDisplay = clockSeconds != null ? formatClock(clockSeconds, eventType, period) : (clockRaw || "");

      // Compute WP if we have scores
      let wp: number | null = null;
      if (homeScore != null && awayScore != null && (homeScore > 0 || awayScore > 0)) {
        wp = computeWP(homeScore, awayScore, period, clockSeconds ?? 720, league);
        // Validate: no NaN
        if (isNaN(wp)) wp = null;
      }

      return { key, period, clockSeconds, clockDisplay, team, player, description: desc, homeScore, awayScore, wp };
    }).sort((a, b) => {
      // Sort by period ASC, then by clockSeconds DESC (more time remaining = earlier in period)
      if (a.period !== b.period) return a.period - b.period;
      const ca = a.clockSeconds ?? -1;
      const cb = b.clockSeconds ?? -1;
      // Higher clock = earlier in the period
      return cb - ca;
    });
  }, [rawEvents, rawSource, nameMap, league]);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground text-center py-8">Loading play-by-play…</p>;
  }

  if (normalizedEvents.length === 0) {
    // Determine the exact reason PBP is empty for admin diagnostics
    const emptyReason = (() => {
      if (!isNBA) return "Non-NBA league — PBP only supported for NBA currently";
      if (gameStatus === "scheduled") return "Game has not started yet — no PBP expected";
      const bdlCount = bdlPbpEvents?.length ?? 0;
      const cosmicCount = livePbpEvents ? (livePbpEvents as any[]).length : 0;
      const histCount = (nbaEvents as any[])?.length ?? 0;
      if (bdlCount === 0 && cosmicCount === 0 && histCount === 0) {
        if (isLiveGame) return "Game is live but NO events in any source — BDL ingest may not have started or game_key mapping is missing";
        return "No events found in any PBP source table (BDL, cosmic, historical)";
      }
      return "Events exist but normalized to 0 — possible parsing/filtering issue";
    })();

    // User-facing copy depends on game state
    const userMessage = (() => {
      if (gameStatus === "scheduled") return "Play-by-play begins once the game starts.";
      if (!isNBA) return "Play-by-play is not yet available for this league.";
      if (isLiveGame) return "Live event feed is warming up — data should appear shortly.";
      if (isFinalGame) return "No play-by-play data was recorded for this game.";
      return "No play-by-play data available for this game.";
    })();

    return (
      <div className="text-center py-8 space-y-3">
        <p className="text-sm text-muted-foreground">{userMessage}</p>
        {isAdmin && (
          <div className="mx-auto max-w-md cosmic-card rounded-lg p-3 text-left space-y-2">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">🔍 Admin PBP Diagnostics</p>
            <div className="text-[9px] text-muted-foreground space-y-0.5 font-mono">
              <p><span className="text-foreground/70">Game ID:</span> {gameId}</p>
              <p><span className="text-foreground/70">League:</span> {league} | <span className="text-foreground/70">Status:</span> {gameStatus ?? "unknown"}</p>
              <p><span className="text-foreground/70">BDL events (nba_pbp_events):</span> {bdlPbpEvents?.length ?? "loading…"} {bdlPbpLoading ? "⏳" : "✓"} <span className="text-muted-foreground/40">game_key={gameId}</span></p>
              <p><span className="text-foreground/70">Cosmic key:</span> {gameKeyQuery.data ?? (gameKeyQuery.isLoading ? "resolving…" : "❌ not found")}</p>
              <p><span className="text-foreground/70">Cosmic events (pbp_events):</span> {livePbpEvents ? (livePbpEvents as any[]).length : "N/A"} {livePbpLoading ? "⏳" : "✓"}</p>
              <p><span className="text-foreground/70">Historical (nba_play_by_play_events):</span> {(nbaEvents as any[])?.length ?? "N/A"} {nbaLoading ? "⏳" : "✓"}</p>
              <p><span className="text-foreground/70">Source selected:</span> {rawSource}</p>
              <p><span className="text-foreground/70">Normalized count:</span> {rawEvents.length}</p>
            </div>
            <div className="border-t border-border/20 pt-1.5">
              <p className="text-[9px] font-semibold text-destructive/80">⚡ Reason: {emptyReason}</p>
            </div>
            {isLiveGame && (
              <div className="text-[9px] text-cosmic-gold space-y-0.5">
                <p>⚠ Game is live — check:</p>
                <p className="pl-2">• nba-bdl-burst-loop running?</p>
                <p className="pl-2">• BDL game_id → internal UUID mapping exists?</p>
                <p className="pl-2">• pbp-watch-sync triggered?</p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  const periods = [...new Set(normalizedEvents.map(e => e.period))].sort((a, b) => a - b);

  const filtered = periodFilter != null
    ? normalizedEvents.filter(e => e.period === periodFilter)
    : normalizedEvents;

  const periodLabel = (p: number) => {
    if (league === "NHL") return p <= 3 ? `Period ${p}` : "OT";
    if (league === "NFL") return `Q${p}`;
    if (league === "MLB") return `Inn ${p}`;
    return p <= 4 ? `Q${p}` : `OT${p - 4}`;
  };

  const periodLongLabel = (p: number) => {
    if (league === "NHL") return p <= 3 ? `${p === 1 ? "1st" : p === 2 ? "2nd" : "3rd"} Period` : "Overtime";
    if (league === "MLB") return `Inning ${p}`;
    if (p <= 4) return `${p === 1 ? "1st" : p === 2 ? "2nd" : p === 3 ? "3rd" : "4th"} Quarter`;
    return `Overtime ${p - 4}`;
  };

  // Group events by period
  const groupedByPeriod: { period: number; events: NormalizedEvent[] }[] = [];
  let currentPeriod: number | null = null;
  for (const ev of filtered) {
    if (ev.period !== currentPeriod) {
      currentPeriod = ev.period;
      groupedByPeriod.push({ period: ev.period, events: [] });
    }
    groupedByPeriod[groupedByPeriod.length - 1].events.push(ev);
  }

  return (
    <div className="space-y-3">
      {/* Mode toggle: Read / Watch — admin only, live games only */}
      {showWatchToggle && (
        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-muted/50 border border-border/30 w-fit">
          <button
            onClick={() => setMode("read")}
            className={cn(
              "text-[10px] font-bold uppercase tracking-wider px-4 py-1.5 rounded-md transition-all",
              mode === "read"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Read
          </button>
          <button
            onClick={() => setMode("watch")}
            className={cn(
              "text-[10px] font-bold uppercase tracking-wider px-4 py-1.5 rounded-md transition-all",
              mode === "watch"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Watch
          </button>
        </div>
      )}

      {/* Watch mode: full visual experience */}
      {mode === "watch" && showWatchToggle ? (
        <PbpWatchView gameId={gameId} homeAbbr={homeAbbr} awayAbbr={awayAbbr} league={league} />

      ) : (
        <>
          {/* Live score banner from game_state_snapshots */}
          {liveSnapshot && (liveSnapshot.home_score != null || liveSnapshot.away_score != null) && (
            <div className="flex items-center justify-center gap-4 py-2 px-3 rounded-lg bg-primary/10 border border-primary/20">
              <span className="text-xs font-bold text-muted-foreground">{awayAbbr}</span>
              <span className="text-base font-bold tabular-nums text-foreground">{liveSnapshot.away_score ?? "—"}</span>
              <span className="text-xs text-muted-foreground">—</span>
              <span className="text-base font-bold tabular-nums text-foreground">{liveSnapshot.home_score ?? "—"}</span>
              <span className="text-xs font-bold text-muted-foreground">{homeAbbr}</span>
              {liveSnapshot.quarter && (
                <span className="text-[10px] text-primary ml-2">{liveSnapshot.quarter} {liveSnapshot.clock || ""}</span>
              )}
            </div>
          )}

      {/* Period filter pills */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setPeriodFilter(null)}
          className={cn(
            "text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors whitespace-nowrap",
            periodFilter === null
              ? "bg-primary text-primary-foreground border-primary"
              : "border-border text-muted-foreground hover:text-foreground"
          )}
        >
          All
        </button>
        {periods.map(p => (
          <button
            key={p}
            onClick={() => setPeriodFilter(p)}
            className={cn(
              "text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors whitespace-nowrap",
              periodFilter === p
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {periodLabel(p)}
          </button>
        ))}
      </div>

      {/* Events grouped by period */}
      <div className="max-h-[65vh] overflow-y-auto space-y-0">
        {groupedByPeriod.map(({ period, events: periodEvents }) => (
          <div key={period}>
            <div className="sticky top-0 z-10 flex items-center justify-between px-3 py-2 bg-primary/10 border-y border-border/50">
              <span className="text-[10px] font-bold text-primary uppercase tracking-wider">
                {periodLongLabel(period)}
              </span>
              <div className="flex items-center gap-3 text-[10px] font-bold text-muted-foreground">
                <span>{awayAbbr}</span>
                <span>{homeAbbr}</span>
                <span className="w-10 text-center">WP</span>
              </div>
            </div>

            {periodEvents.map((ev) => {
              const isHome = ev.team === homeAbbr;
              const isAway = ev.team === awayAbbr;

              // Format WP display
              const wpDisplay = ev.wp != null
                ? `${(ev.wp * 100).toFixed(0)}%`
                : null;

              // WP color: >55% = green (home favored), <45% = red (away favored)
              const wpColor = ev.wp != null
                ? ev.wp >= 0.55 ? "text-cosmic-green"
                  : ev.wp <= 0.45 ? "text-cosmic-red"
                  : "text-muted-foreground"
                : "text-muted-foreground";

              return (
                <div
                  key={ev.key}
                  className="flex items-start gap-2 px-3 py-2.5 border-b border-border/20 transition-colors"
                >
                  {/* Team indicator */}
                  <div className="w-8 shrink-0 flex items-center justify-center pt-0.5">
                    {(isHome || isAway) && (
                      <span className={cn(
                        "text-[9px] font-bold px-1.5 py-0.5 rounded",
                        isHome ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                      )}>
                        {ev.team}
                      </span>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      <span className="tabular-nums text-muted-foreground mr-1.5">{ev.clockDisplay}</span>
                      {ev.description || ev.player || "—"}
                    </p>
                    {ev.player && ev.description && !ev.description.includes(ev.player) && (
                      <span className="text-[9px] text-primary/70">{ev.player}</span>
                    )}
                  </div>

                  {/* Per-event running score */}
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-[10px] tabular-nums font-medium text-muted-foreground w-5 text-right">
                      {ev.awayScore != null ? ev.awayScore : ""}
                    </span>
                    <span className="text-[10px] tabular-nums font-medium text-muted-foreground w-5 text-right">
                      {ev.homeScore != null ? ev.homeScore : ""}
                    </span>
                    {/* Win Probability */}
                    <span className={cn("text-[9px] tabular-nums font-semibold w-10 text-center", wpColor)}>
                      {wpDisplay || ""}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
        </>
      )}
    </div>
  );
}
