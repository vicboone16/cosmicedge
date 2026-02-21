import { useEffect, useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Hook for realtime PBP events via Supabase Realtime.
 * Subscribes to INSERT events on pbp_events filtered by game_key.
 */
export function usePbpRealtime(gameKey: string | null) {
  const [events, setEvents] = useState<any[]>([]);
  const channelRef = useRef<any>(null);

  // Initial load from DB
  const { data: initialEvents } = useQuery({
    queryKey: ["pbp-events", gameKey],
    queryFn: async () => {
      if (!gameKey) return [];
      const { data } = await supabase
        .from("pbp_events" as any)
        .select("*")
        .eq("game_key", gameKey)
        .order("period", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(1000);
      return (data as any[]) || [];
    },
    enabled: !!gameKey,
    staleTime: 10_000,
  });

  useEffect(() => {
    if (initialEvents) setEvents(initialEvents);
  }, [initialEvents]);

  // Realtime subscription
  useEffect(() => {
    if (!gameKey) return;

    const channel = supabase
      .channel(`pbp-events-${gameKey}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "pbp_events",
          filter: `game_key=eq.${gameKey}`,
        },
        (payload: any) => {
          setEvents((prev) => [...prev, payload.new]);
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [gameKey]);

  return events;
}

/**
 * Hook for realtime quarter team stats.
 */
export function usePbpQuarterTeamStats(gameKey: string | null) {
  const [stats, setStats] = useState<any[]>([]);

  const { data } = useQuery({
    queryKey: ["pbp-quarter-team-stats", gameKey],
    queryFn: async () => {
      if (!gameKey) return [];
      const { data } = await supabase
        .from("pbp_quarter_team_stats" as any)
        .select("*")
        .eq("game_key", gameKey)
        .order("period", { ascending: true });
      return (data as any[]) || [];
    },
    enabled: !!gameKey,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });

  useEffect(() => {
    if (data) setStats(data);
  }, [data]);

  // Realtime updates
  useEffect(() => {
    if (!gameKey) return;
    const channel = supabase
      .channel(`pbp-qtr-team-${gameKey}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pbp_quarter_team_stats",
          filter: `game_key=eq.${gameKey}`,
        },
        (payload: any) => {
          setStats((prev) => {
            const idx = prev.findIndex(
              (s) =>
                s.period === payload.new.period &&
                s.team_abbr === payload.new.team_abbr
            );
            if (idx >= 0) {
              const copy = [...prev];
              copy[idx] = payload.new;
              return copy;
            }
            return [...prev, payload.new];
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [gameKey]);

  return stats;
}

/**
 * Hook for realtime quarter player stats.
 */
export function usePbpQuarterPlayerStats(gameKey: string | null) {
  const [stats, setStats] = useState<any[]>([]);

  const { data } = useQuery({
    queryKey: ["pbp-quarter-player-stats", gameKey],
    queryFn: async () => {
      if (!gameKey) return [];
      const { data } = await supabase
        .from("pbp_quarter_player_stats" as any)
        .select("*")
        .eq("game_key", gameKey)
        .order("period", { ascending: true });
      return (data as any[]) || [];
    },
    enabled: !!gameKey,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });

  useEffect(() => {
    if (data) setStats(data);
  }, [data]);

  useEffect(() => {
    if (!gameKey) return;
    const channel = supabase
      .channel(`pbp-qtr-player-${gameKey}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pbp_quarter_player_stats",
          filter: `game_key=eq.${gameKey}`,
        },
        (payload: any) => {
          setStats((prev) => {
            const idx = prev.findIndex(
              (s) =>
                s.period === payload.new.period &&
                s.player_id === payload.new.player_id
            );
            if (idx >= 0) {
              const copy = [...prev];
              copy[idx] = payload.new;
              return copy;
            }
            return [...prev, payload.new];
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [gameKey]);

  return stats;
}
