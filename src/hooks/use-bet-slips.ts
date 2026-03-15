import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_link: "That link doesn't look right. Please check and try again.",
  unsupported_book: "This book isn't supported yet. Try manual entry instead.",
  redirect_failed: "We couldn't reach that share link. It may have expired.",
  parse_failed: "We couldn't read the picks from that input. Try a clearer image or manual entry.",
  no_entry_found: "No picks were found. Try a clearer image or manual entry.",
  matching_failed: "Some players couldn't be matched to our database.",
  insert_failed: "Something went wrong saving your slip. Please try again.",
  unauthorized: "Your session expired. Please sign in again.",
  internal: "Something went wrong. Please try again.",
  FunctionsFetchError: "Connection issue — please check your network and try again.",
  FunctionsRelayError: "Server is busy. Please try again in a moment.",
  FunctionsHttpError: "Server error — please try again.",
};

const extractEdgeErrorMessage = async (error: any): Promise<{ message: string; code: string | null; debug: any }> => {
  let message = error?.message || "Import failed";
  let code: string | null = null;
  let debug: any = null;

  const context = error?.context;
  if (context && typeof context === "object" && typeof context.clone === "function") {
    try {
      const text = await context.clone().text();
      if (text) {
        try {
          const parsed = JSON.parse(text);
          code = parsed?.error_code || null;
          debug = parsed?.debug || null;
          message = parsed?.error || parsed?.message || text;
        } catch {
          message = text;
        }
      }
    } catch { /* ignore */ }
  }

  // Map error codes to friendly messages
  if (code && ERROR_MESSAGES[code]) {
    message = ERROR_MESSAGES[code];
  } else if (message.toLowerCase().includes("unauthorized")) {
    message = ERROR_MESSAGES.unauthorized;
    code = "unauthorized";
  }

  return { message, code, debug };
};

const GAME_LOOKUP_STATUSES = [
  "scheduled",
  "in_progress",
  "live",
  "halftime",
  "final",
  "ended",
  "completed",
] as const;

const statusPriority = (status?: string | null) => {
  switch ((status || "").toLowerCase()) {
    case "live":
    case "in_progress":
      return 0;
    case "halftime":
      return 1;
    case "final":
    case "ended":
    case "completed":
      return 2;
    case "scheduled":
      return 3;
    default:
      return 4;
  }
};

const trackedPropStatusFromGame = (status?: string | null): "pregame" | "live" | "final" => {
  const normalized = (status || "").toLowerCase();
  if (["live", "in_progress", "halftime"].includes(normalized)) return "live";
  if (["final", "ended", "completed"].includes(normalized)) return "final";
  return "pregame";
};

const resolveMissingPickGameIds = async ({
  slipCreatedAt,
  picks,
}: {
  slipCreatedAt?: string | null;
  picks: any[];
}) => {
  const picksNeedingGame = picks.filter((p: any) => !p.game_id && p.player_id);
  if (picksNeedingGame.length === 0) return 0;

  const playerIds = [...new Set(picksNeedingGame.map((p: any) => p.player_id))];
  const { data: players, error: playersError } = await supabase
    .from("players")
    .select("id, team, league")
    .in("id", playerIds);
  if (playersError) throw playersError;

  const teamByPlayer: Record<string, string> = {};
  const leagueByPlayer: Record<string, string> = {};
  players?.forEach((p: any) => {
    if (p.team) teamByPlayer[p.id] = p.team;
    if (p.league) leagueByPlayer[p.id] = p.league;
  });

  const teams = [...new Set(Object.values(teamByPlayer).filter(Boolean))];
  if (teams.length === 0) return 0;

  const leagues = [...new Set(Object.values(leagueByPlayer).filter(Boolean))];

  const slipTs = slipCreatedAt ? new Date(slipCreatedAt).getTime() : Date.now();
  const windowStartIso = new Date(slipTs - 72 * 60 * 60 * 1000).toISOString();
  const windowEndIso = new Date(slipTs + 72 * 60 * 60 * 1000).toISOString();

  let gameQuery = supabase
    .from("games")
    .select("id, home_abbr, away_abbr, status, start_time, league")
    .in("status", [...GAME_LOOKUP_STATUSES])
    .gte("start_time", windowStartIso)
    .lte("start_time", windowEndIso)
    .or(teams.map((t) => `home_abbr.eq.${t},away_abbr.eq.${t}`).join(","));

  if (leagues.length > 0) {
    gameQuery = gameQuery.in("league", leagues);
  }

  const { data: candidateGames, error: gameError } = await gameQuery;
  if (gameError) throw gameError;
  if (!candidateGames?.length) return 0;

  let resolvedCount = 0;

  for (const pick of picksNeedingGame) {
    const team = teamByPlayer[pick.player_id];
    if (!team) continue;

    const preferredLeague = leagueByPlayer[pick.player_id] || null;
    const matches = candidateGames.filter((g: any) => {
      const teamMatch = g.home_abbr === team || g.away_abbr === team;
      const leagueMatch = preferredLeague ? g.league === preferredLeague : true;
      return teamMatch && leagueMatch;
    });

    if (!matches.length) continue;

    const best = matches
      .map((g: any) => {
        const delta = Math.abs(new Date(g.start_time).getTime() - slipTs);
        return {
          game: g,
          score: statusPriority(g.status) * 1_000_000_000_000 + delta,
        };
      })
      .sort((a, b) => a.score - b.score)[0]?.game;

    if (!best) continue;

    const { error: updateError } = await supabase
      .from("bet_slip_picks")
      .update({ game_id: best.id })
      .eq("id", pick.id);

    if (!updateError) {
      pick.game_id = best.id;
      resolvedCount++;
    }
  }

  return resolvedCount;
};

const SLIP_NOTE_PREFIX = "[slip:";
const isFinalGameStatus = (status?: string | null) => ["final", "ended", "completed"].includes((status || "").toLowerCase());
const isLiveGameStatus = (status?: string | null) => ["live", "in_progress", "halftime"].includes((status || "").toLowerCase());

const syncSlipIntoTraxLedger = async ({
  userId,
  slip,
  picks,
}: {
  userId: string;
  slip: any;
  picks: any[];
}) => {
  const validPicks = picks.filter((p: any) => p.game_id);
  if (!validPicks.length) {
    return { trackedCount: 0, ledgerCount: 0, unresolvedCount: picks.length };
  }

  const gameIds = [...new Set(validPicks.map((p: any) => p.game_id))];
  const { data: games } = await supabase
    .from("games")
    .select("id, status, league, start_time")
    .in("id", gameIds);

  const gameById: Record<string, any> = {};
  const gameStatusById: Record<string, string> = {};
  games?.forEach((g: any) => {
    gameById[g.id] = g;
    gameStatusById[g.id] = g.status;
  });

  let trackedCount = 0;

  for (const pick of validPicks) {
    const marketType = pick.stat_type || "player_prop";

    const { data: trackedExisting } = await supabase
      .from("tracked_props")
      .select("id")
      .eq("user_id", userId)
      .eq("game_id", pick.game_id)
      .eq("player_name", pick.player_name_raw)
      .eq("market_type", marketType)
      .eq("line", pick.line)
      .maybeSingle();

    if (!trackedExisting) {
      const { error } = await supabase.from("tracked_props").insert({
        user_id: userId,
        game_id: pick.game_id,
        player_id: pick.player_id || null,
        player_name: pick.player_name_raw,
        market_type: marketType,
        line: pick.line,
        direction: pick.direction || "over",
        odds: -110,
        book: slip.book,
        notes: `${SLIP_NOTE_PREFIX}${slip.id}] From ${slip.book} slip`,
        status: trackedPropStatusFromGame(gameStatusById[pick.game_id]),
      });
      if (!error) trackedCount++;
    }
  }

  const primaryGame = validPicks
    .map((p: any) => gameById[p.game_id])
    .filter(Boolean)
    .map((g: any) => {
      const startDelta = Math.abs(new Date(g.start_time || slip.created_at || Date.now()).getTime() - new Date(slip.created_at || Date.now()).getTime());
      return { g, score: statusPriority(g.status) * 1_000_000_000_000 + startDelta };
    })
    .sort((a: any, b: any) => a.score - b.score)[0]?.g;

  let ledgerCount = 0;

  if (primaryGame?.id) {
    const pickedCount = picks.length;
    const settledLegs = picks.filter((p: any) => ["win", "loss", "push", "void"].includes((p.result || "").toLowerCase()));
    const losses = settledLegs.filter((p: any) => (p.result || "").toLowerCase() === "loss").length;
    const isPowerLike = ["power", "parlay", "straight"].includes((slip.entry_type || "").toLowerCase());
    const shouldForceLoss = isPowerLike && losses > 0;

    const hasAnyLive = validPicks.some((p: any) => isLiveGameStatus(gameStatusById[p.game_id]));
    const allFinal = validPicks.every((p: any) => isFinalGameStatus(gameStatusById[p.game_id]));

    const derivedStatus = shouldForceLoss || slip.status === "settled"
      ? "settled"
      : hasAnyLive
        ? "live"
        : allFinal
          ? "settled"
          : "open";

    const derivedResult = shouldForceLoss
      ? "loss"
      : (slip.result || null);

    const ledgerPayload = {
      user_id: userId,
      game_id: primaryGame.id,
      market_type: "slip_entry",
      selection: `${pickedCount}-Pick ${(slip.entry_type || "slip").replace(/_/g, " ")} (${slip.book})`,
      side: null,
      odds: -110,
      line: null,
      stake_amount: slip.stake ? Number(slip.stake) : null,
      status: derivedStatus,
      result: derivedResult,
      payout: slip.payout ? Number(slip.payout) : null,
      settled_at: derivedStatus === "settled" ? (slip.settled_at || new Date().toISOString()) : null,
      player_id: null,
      sport: primaryGame.league || "NBA",
      book: slip.book,
      notes: `${SLIP_NOTE_PREFIX}${slip.id}] ${slip.book} ${slip.entry_type || "slip"}`,
    };

    const { data: existingSlipLedger } = await supabase
      .from("bets")
      .select("id")
      .eq("user_id", userId)
      .ilike("notes", `${SLIP_NOTE_PREFIX}${slip.id}]%`)
      .maybeSingle();

    if (existingSlipLedger?.id) {
      const { error } = await supabase.from("bets").update(ledgerPayload).eq("id", existingSlipLedger.id);
      if (!error) ledgerCount++;
    } else {
      const { error } = await supabase.from("bets").insert(ledgerPayload);
      if (!error) ledgerCount++;
    }

    // Cleanup legacy per-leg ledger rows created by old sync behavior
    const legacySelections = [...new Set(validPicks.map((pick: any) => `${pick.player_name_raw} ${pick.direction} ${pick.line}`))];
    if (legacySelections.length > 0) {
      const { data: legacyRows } = await supabase
        .from("bets")
        .select("id")
        .eq("user_id", userId)
        .in("game_id", gameIds)
        .in("selection", legacySelections)
        .ilike("notes", `From ${slip.book} slip%`);

      if (legacyRows?.length) {
        await supabase.from("bets").delete().in("id", legacyRows.map((r: any) => r.id));
      }
    }
  }

  return {
    trackedCount,
    ledgerCount,
    unresolvedCount: picks.length - validPicks.length,
  };
};

export function useBetSlips() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: slips, isLoading } = useQuery({
    queryKey: ["bet-slips", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("bet_slips")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;

      // Phase 7: Auto-settle slips where all picks are resolved
      const activeSlips = (data || []).filter(s => s.status === "active");
      if (activeSlips.length > 0) {
        const slipIds = activeSlips.map(s => s.id);
        const { data: allPicks } = await supabase
          .from("bet_slip_picks")
          .select("slip_id, result")
          .in("slip_id", slipIds);

        if (allPicks?.length) {
          const picksBySlip: Record<string, any[]> = {};
          allPicks.forEach(p => {
            if (!picksBySlip[p.slip_id]) picksBySlip[p.slip_id] = [];
            picksBySlip[p.slip_id].push(p);
          });

          for (const slip of activeSlips) {
            const picks = picksBySlip[slip.id] || [];
            if (picks.length === 0) continue;
            const allResolved = picks.every(p => p.result && ["win", "loss", "push", "void"].includes(p.result));
            if (!allResolved) continue;

            const losses = picks.filter(p => p.result === "loss").length;
            const wins = picks.filter(p => p.result === "win").length;
            const isPower = ["power", "parlay", "straight"].includes((slip.entry_type || "").toLowerCase());

            let slipResult: string;
            if (isPower) {
              slipResult = losses > 0 ? "loss" : "win";
            } else {
              // Flex payout: use PrizePicks-style thresholds
              const flexPayouts: Record<number, Record<number, number>> = {
                2: { 2: 3 },
                3: { 3: 5, 2: 1.25 },
                4: { 4: 10, 3: 2, 2: 0.4 },
                5: { 5: 20, 4: 3, 3: 0.4 },
                6: { 6: 40, 5: 6, 4: 1.5, 3: 1.25 },
              };
              const payoutTable = flexPayouts[picks.length];
              const multiplier = payoutTable?.[wins] ?? 0;
              slipResult = multiplier > 1 ? "win" : multiplier > 0 ? "push" : "loss";

              // Update payout if we have a stake
              if (slip.stake && multiplier > 0) {
                await supabase.from("bet_slips").update({
                  payout: Number(slip.stake) * multiplier,
                } as any).eq("id", slip.id);
              }
            }

            await supabase.from("bet_slips").update({
              status: "settled",
              result: slipResult,
              settled_at: new Date().toISOString(),
            } as any).eq("id", slip.id);
          }
        }
      }

      return data || [];
    },
    enabled: !!user,
    refetchInterval: 30_000,
  });

  const { data: picksMap } = useQuery({
    queryKey: ["bet-slip-picks", slips?.map(s => s.id).join(",")],
    queryFn: async () => {
      if (!slips?.length) return {};
      const slipIds = slips.map(s => s.id);
      const { data, error } = await supabase
        .from("bet_slip_picks")
        .select("*")
        .in("slip_id", slipIds)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const map: Record<string, any[]> = {};
      data?.forEach(p => {
        if (!map[p.slip_id]) map[p.slip_id] = [];
        map[p.slip_id].push(p);
      });
      return map;
    },
    enabled: (slips?.length ?? 0) > 0,
    refetchInterval: 15_000,
  });

  const importSlip = useMutation({
    mutationFn: async (params: {
      mode: "link" | "screenshot" | "manual";
      url?: string;
      image_base64?: string;
      manual_picks?: any[];
      book?: string;
      entry_type?: string;
      stake?: number;
      payout?: number;
      intent_state?: string;
    }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not logged in");

      const res = await supabase.functions.invoke("parse-bet-slip", {
        body: params,
      });

      if (res.error) {
        const extracted = await extractEdgeErrorMessage(res.error);
        throw Object.assign(new Error(extracted.message), { code: extracted.code, debug: extracted.debug });
      }

      if (!res.data?.ok) {
        const code = res.data?.error_code || "parse_failed";
        const msg = ERROR_MESSAGES[code] || res.data?.error || "Import failed";
        throw Object.assign(new Error(msg), { code, debug: res.data?.debug });
      }

      return res.data;
    },
    onSuccess: async (data) => {
      // Sync imported picks to Trax + Ledger (non-blocking)
      try {
        if (data.picks?.length && data.slip_id) {
          const { data: slipRow, error: slipError } = await supabase
            .from("bet_slips")
            .select("*")
            .eq("id", data.slip_id)
            .single();
          if (slipError) throw slipError;

          const { data: pickRows, error: picksError } = await supabase
            .from("bet_slip_picks")
            .select("*")
            .eq("slip_id", data.slip_id);
          if (picksError) throw picksError;

          if (slipRow && pickRows?.length) {
            await resolveMissingPickGameIds({
              slipCreatedAt: slipRow.created_at,
              picks: pickRows,
            });

            await syncSlipIntoTraxLedger({
              userId: slipRow.user_id,
              slip: slipRow,
              picks: pickRows,
            });
          }
        }
      } catch (e) {
        console.warn("[BetSlip] Trax/Ledger sync failed (non-blocking):", e);
      }

      queryClient.invalidateQueries({ queryKey: ["bet-slips"] });
      queryClient.invalidateQueries({ queryKey: ["bet-slip-picks"] });
      queryClient.invalidateQueries({ queryKey: ["bets"] });
      queryClient.invalidateQueries({ queryKey: ["tracked-props"] });

      // Build success message
      const parts = [`${data.picks_count} pick(s) extracted`];
      if (data.settled_count > 0) {
        parts.push(`${data.settled_count} auto-settled`);
      }
      if (data.injury_warnings?.length > 0) {
        parts.push(`⚠️ Injuries: ${data.injury_warnings.join(", ")}`);
      }

      toast({
        title: data.settled_count > 0 ? "Slip imported & settled!" : "Slip imported!",
        description: parts.join(" · "),
      });

      // Show injury warning separately if present
      if (data.injury_warnings?.length > 0) {
        toast({
          title: "⚠️ Injury Alert",
          description: data.injury_warnings.join(", "),
          variant: "destructive",
        });
      }
    },
    onError: (e: any) => {
      toast({
        title: "Import failed",
        description: e.message,
        variant: "destructive",
      });
      // Log debug info for admin
      if (e.debug) console.warn("[BetSlip Import Debug]", e.debug);
    },
  });

  const deleteSlip = useMutation({
    mutationFn: async (slipId: string) => {
      const { error } = await supabase.from("bet_slips").delete().eq("id", slipId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bet-slips"] });
      queryClient.invalidateQueries({ queryKey: ["bet-slip-picks"] });
      toast({ title: "Slip deleted" });
    },
  });

  /** Sync an already-imported slip's picks into tracked_props + bets (Ledger) */
  const syncToTraxLedger = useMutation({
    mutationFn: async (slipId: string) => {
      if (!user) throw new Error("Not logged in");

      const { data: slip, error: slipError } = await supabase
        .from("bet_slips")
        .select("*")
        .eq("id", slipId)
        .single();
      if (slipError) throw slipError;

      const { data: picks, error: picksError } = await supabase
        .from("bet_slip_picks")
        .select("*")
        .eq("slip_id", slipId)
        .order("created_at", { ascending: true });
      if (picksError) throw picksError;
      if (!picks?.length) throw new Error("No picks to sync");

      const resolvedCount = await resolveMissingPickGameIds({
        slipCreatedAt: slip.created_at,
        picks,
      });

      const syncResult = await syncSlipIntoTraxLedger({
        userId: user.id,
        slip,
        picks,
      });

      return {
        resolvedCount,
        trackedCount: syncResult.trackedCount,
        ledgerCount: syncResult.ledgerCount,
        unresolvedCount: syncResult.unresolvedCount,
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["tracked-props"] });
      queryClient.invalidateQueries({ queryKey: ["bets"] });
      queryClient.invalidateQueries({ queryKey: ["bankroll-bets"] });
      queryClient.invalidateQueries({ queryKey: ["bet-slip-picks"] });

      const parts: string[] = [];
      if (data.resolvedCount > 0) parts.push(`${data.resolvedCount} game(s) resolved`);
      if (data.trackedCount > 0) parts.push(`${data.trackedCount} prop(s) → Trax`);
      if (data.ledgerCount > 0) parts.push(`${data.ledgerCount} pick(s) → Ledger`);
      if (data.unresolvedCount > 0) parts.push(`${data.unresolvedCount} still unmatched`);
      if (parts.length === 0) parts.push("Already synced — no new entries");

      toast({ title: "Synced!", description: parts.join(" · ") });
    },
    onError: (e: any) => {
      toast({ title: "Sync failed", description: e.message, variant: "destructive" });
    },
  });

  return { slips, picksMap, isLoading, importSlip, deleteSlip, syncToTraxLedger };
}
