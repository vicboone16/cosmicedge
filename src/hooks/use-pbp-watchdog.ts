import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PbpFreshness = "fresh" | "stale" | "frozen" | "no_data";

export interface WatchdogRow {
  game_key: string;
  status: PbpFreshness;
  lastEventAt: string | null;
  lastWpAt: string | null;
  ageSec: number | null;
  wpAgeSec: number | null;
}

function classify(ageSec: number | null): PbpFreshness {
  if (ageSec == null) return "no_data";
  if (ageSec < 60) return "fresh";
  if (ageSec < 300) return "stale";
  return "frozen";
}

export function usePbpWatchdog(gameKeys: string[]) {
  return useQuery({
    queryKey: ["pbp-watchdog", gameKeys.slice().sort().join(",")],
    enabled: gameKeys.length > 0,
    refetchInterval: 15_000,
    staleTime: 10_000,
    queryFn: async () => {
      const out: Record<string, WatchdogRow> = {};
      if (gameKeys.length === 0) return out;

      const { data: pbpRows } = await supabase
        .from("pbp_events" as any)
        .select("game_key, created_at")
        .in("game_key", gameKeys)
        .order("created_at", { ascending: false })
        .limit(2000);

      const lastByGame = new Map<string, string>();
      for (const r of ((pbpRows ?? []) as Array<{ game_key: string; created_at: string }>)) {
        if (!lastByGame.has(r.game_key)) lastByGame.set(r.game_key, r.created_at);
      }

      const { data: wpRows } = await supabase
        .from("game_live_wp" as any)
        .select("game_key, computed_at")
        .in("game_key", gameKeys)
        .order("computed_at", { ascending: false })
        .limit(1000);

      const lastWpByGame = new Map<string, string>();
      for (const r of ((wpRows ?? []) as Array<{ game_key: string; computed_at: string }>)) {
        if (!lastWpByGame.has(r.game_key)) lastWpByGame.set(r.game_key, r.computed_at);
      }

      const now = Date.now();
      for (const k of gameKeys) {
        const lastEventAt = lastByGame.get(k) ?? null;
        const lastWpAt = lastWpByGame.get(k) ?? null;
        const ageSec = lastEventAt ? Math.floor((now - new Date(lastEventAt).getTime()) / 1000) : null;
        const wpAgeSec = lastWpAt ? Math.floor((now - new Date(lastWpAt).getTime()) / 1000) : null;
        out[k] = { game_key: k, status: classify(ageSec), lastEventAt, lastWpAt, ageSec, wpAgeSec };
      }
      return out;
    },
  });
}

export function freshnessLabel(s: PbpFreshness): string {
  switch (s) {
    case "fresh": return "Live";
    case "stale": return "Slow";
    case "frozen": return "Frozen";
    case "no_data": return "No PBP";
  }
}

export function freshnessColor(s: PbpFreshness): string {
  switch (s) {
    case "fresh": return "bg-emerald-500";
    case "stale": return "bg-amber-500";
    case "frozen": return "bg-rose-500";
    case "no_data": return "bg-muted-foreground/40";
  }
}
