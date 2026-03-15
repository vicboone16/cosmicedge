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
      // Sync imported picks to the bets ledger for bankroll tracking
      try {
        if (data.picks?.length && data.slip_id) {
          const { data: slipRow } = await supabase
            .from("bet_slips")
            .select("*")
            .eq("id", data.slip_id)
            .single();

          const { data: pickRows } = await supabase
            .from("bet_slip_picks")
            .select("*")
            .eq("slip_id", data.slip_id);

          if (pickRows?.length && slipRow) {
            // Auto-resolve game_ids for picks missing them
            const picksNeedingGame = pickRows.filter((p: any) => !p.game_id && p.player_id);
            if (picksNeedingGame.length > 0) {
              const playerIds = [...new Set(picksNeedingGame.map((p: any) => p.player_id))];
              const { data: players } = await supabase.from("players").select("id, team").in("id", playerIds);
              const teamsByPlayer: Record<string, string> = {};
              players?.forEach(p => { if (p.team) teamsByPlayer[p.id] = p.team; });

              const teams = [...new Set(Object.values(teamsByPlayer))];
              if (teams.length > 0) {
                const { data: todayGames } = await supabase
                  .from("games")
                  .select("id, home_abbr, away_abbr")
                  .in("status", ["scheduled", "in_progress", "live", "halftime"])
                  .or(teams.map(t => `home_abbr.eq.${t},away_abbr.eq.${t}`).join(","));

                for (const pick of picksNeedingGame) {
                  const team = teamsByPlayer[pick.player_id];
                  const game = todayGames?.find(g => g.home_abbr === team || g.away_abbr === team);
                  if (game) {
                    pick.game_id = game.id;
                    await supabase.from("bet_slip_picks").update({ game_id: game.id }).eq("id", pick.id);
                  }
                }
              }
            }

            // Only insert bets for picks that have a valid game_id (FK constraint)
            const validPicks = pickRows.filter((p: any) => p.game_id);
            const betInserts = validPicks.map((pick: any) => {
              const settledResult = data.settled_results?.find(
                (sr: any) => sr.player === pick.player_name_raw
              );
              const isSettled = !!settledResult;
              const betResult = settledResult?.result || null;

              return {
                user_id: slipRow.user_id,
                game_id: pick.game_id,
                market_type: pick.stat_type || "player_prop",
                selection: `${pick.player_name_raw} ${pick.direction} ${pick.line}`,
                side: pick.direction,
                odds: -110,
                line: pick.line,
                stake_amount: slipRow.stake ? (slipRow.stake / pickRows.length) : null,
                status: isSettled ? "settled" : (slipRow.intent_state === "already_placed" ? "open" : "tracked"),
                result: betResult,
                settled_at: isSettled ? new Date().toISOString() : null,
                payout: betResult === "win" && slipRow.payout ? (slipRow.payout / pickRows.length) : (betResult === "push" && slipRow.stake ? (slipRow.stake / pickRows.length) : null),
                player_id: pick.player_id || null,
                sport: "NBA",
                book: slipRow.book,
                notes: `Imported from slip ${data.slip_id}`,
              };
            });

            if (betInserts.length > 0) {
              await supabase.from("bets").insert(betInserts);
            }

            // Also sync to tracked_props for Trax
            const trackedInserts = pickRows
              .filter((pick: any) => pick.game_id)
              .map((pick: any) => ({
                user_id: slipRow.user_id,
                game_id: pick.game_id,
                player_id: pick.player_id || null,
                player_name: pick.player_name_raw,
                market_type: pick.stat_type || "player_prop",
                line: pick.line,
                direction: pick.direction || "over",
                odds: -110,
                book: slipRow.book,
                notes: `From ${slipRow.book} slip`,
                status: "pregame",
              }));
            if (trackedInserts.length > 0) {
              await supabase.from("tracked_props").insert(trackedInserts);
            }
          }
        }
      } catch (e) {
        console.warn("[BetSlip] Ledger sync failed (non-blocking):", e);
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
      const picks = picksMap?.[slipId] || [];
      const slip = slips?.find(s => s.id === slipId);
      if (!picks.length || !slip) throw new Error("No picks to sync");

      let trackedCount = 0;
      let ledgerCount = 0;

      // ── Sync to tracked_props ──
      for (const pick of picks) {
        if (!pick.game_id) continue; // tracked_props requires game_id
        // Check for duplicates
        const { data: existing } = await supabase
          .from("tracked_props")
          .select("id")
          .eq("user_id", user.id)
          .eq("game_id", pick.game_id)
          .eq("player_name", pick.player_name_raw)
          .eq("market_type", pick.stat_type)
          .eq("line", pick.line)
          .maybeSingle();
        if (existing) continue;

        const { error } = await supabase.from("tracked_props").insert({
          user_id: user.id,
          game_id: pick.game_id,
          player_id: pick.player_id || null,
          player_name: pick.player_name_raw,
          market_type: pick.stat_type || "player_prop",
          line: pick.line,
          direction: pick.direction || "over",
          odds: -110,
          book: slip.book,
          notes: `From ${slip.book} slip`,
          status: "pregame",
        });
        if (!error) trackedCount++;
      }

      // ── Sync to bets (Ledger) ──
      for (const pick of picks) {
        const gameId = pick.game_id || slip.id; // fallback to slip id
        // Check for duplicates
        const { data: existing } = await supabase
          .from("bets")
          .select("id")
          .eq("user_id", user.id)
          .eq("game_id", gameId)
          .eq("selection", `${pick.player_name_raw} ${pick.direction} ${pick.line}`)
          .maybeSingle();
        if (existing) continue;

        const { error } = await supabase.from("bets").insert({
          user_id: user.id,
          game_id: gameId,
          market_type: pick.stat_type || "player_prop",
          selection: `${pick.player_name_raw} ${pick.direction} ${pick.line}`,
          side: pick.direction,
          odds: -110,
          line: pick.line,
          stake_amount: slip.stake ? (slip.stake / picks.length) : null,
          status: slip.intent_state === "already_placed" ? "open" : "tracked",
          player_id: pick.player_id || null,
          sport: "NBA",
          book: slip.book,
          notes: `From ${slip.book} slip · ${slip.entry_type}`,
        });
        if (!error) ledgerCount++;
      }

      return { trackedCount, ledgerCount };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["tracked-props"] });
      queryClient.invalidateQueries({ queryKey: ["bets"] });
      queryClient.invalidateQueries({ queryKey: ["bankroll-bets"] });
      const parts: string[] = [];
      if (data.trackedCount > 0) parts.push(`${data.trackedCount} prop(s) → Trax`);
      if (data.ledgerCount > 0) parts.push(`${data.ledgerCount} pick(s) → Ledger`);
      if (parts.length === 0) parts.push("Already synced — no new entries");
      toast({ title: "Synced!", description: parts.join(" · ") });
    },
    onError: (e: any) => {
      toast({ title: "Sync failed", description: e.message, variant: "destructive" });
    },
  });

  return { slips, picksMap, isLoading, importSlip, deleteSlip, syncToTraxLedger };
}
