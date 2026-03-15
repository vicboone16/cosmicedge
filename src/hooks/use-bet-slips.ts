import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_link: "That link doesn't look right. Please check and try again.",
  unsupported_book: "This book isn't supported yet. Try manual entry instead.",
  redirect_failed: "We couldn't reach that share link. It may have expired.",
  parse_failed: "We couldn't read the picks from that input.",
  no_entry_found: "No picks were found. Try a clearer image or manual entry.",
  matching_failed: "Some players couldn't be matched to our database.",
  insert_failed: "Something went wrong saving your slip. Please try again.",
  unauthorized: "Your session expired. Please sign in again.",
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
    refetchInterval: 30_000,
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
            const betInserts = pickRows.map((pick: any) => ({
              user_id: slipRow.user_id,
              game_id: pick.game_id || slipRow.id, // fallback to slip id as pseudo game_id
              market_type: pick.stat_type || "player_prop",
              selection: `${pick.player_name_raw} ${pick.direction} ${pick.line}`,
              side: pick.direction,
              odds: -110, // default; will be overridden if odds data exists
              line: pick.line,
              stake_amount: slipRow.stake ? (slipRow.stake / pickRows.length) : null,
              status: slipRow.intent_state === "already_placed" ? "open" : "tracked",
              player_id: pick.player_id || null,
              sport: "NBA",
              book: slipRow.book,
              notes: `Imported from slip ${data.slip_id}`,
            }));

            // Only insert bets for picks that have a valid game_id
            const validBets = betInserts.filter((b: any) => b.game_id);
            if (validBets.length > 0) {
              await supabase.from("bets").insert(validBets);
            }
          }
        }
      } catch (e) {
        console.warn("[BetSlip] Ledger sync failed (non-blocking):", e);
      }

      queryClient.invalidateQueries({ queryKey: ["bet-slips"] });
      queryClient.invalidateQueries({ queryKey: ["bet-slip-picks"] });
      queryClient.invalidateQueries({ queryKey: ["bets"] });
      toast({
        title: "Slip imported!",
        description: `${data.picks_count} pick(s) extracted`,
      });
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

  return { slips, picksMap, isLoading, importSlip, deleteSlip };
}
