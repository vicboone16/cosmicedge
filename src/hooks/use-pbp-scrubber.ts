import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PbpScrubPoint {
  idx: number;
  period: number;
  description: string;
  team: string | null;
  player: string | null;
  home: number;
  away: number;
  margin: number;
  homeMomentum: number;
  awayMomentum: number;
  leadChange: boolean;
  leader: 1 | -1 | 0;
}

const MOMENTUM_WINDOW = 8;

interface RawPbp {
  period: number;
  home_score: number | null;
  away_score: number | null;
  description: string | null;
  team_abbr: string | null;
  player_name: string | null;
}

export function usePbpScrubber(gameKey: string | null) {
  return useQuery({
    queryKey: ["pbp-scrubber", gameKey],
    enabled: !!gameKey,
    staleTime: 30_000,
    queryFn: async () => {
      // Read from nba_pbp_events (written by BDL burst loop) — the raw source.
      // pbp_events (normalized via pbp-watch-sync) has the same shape but a
      // ~2min lag; fall through to it only if needed in future.
      const { data } = await supabase
        .from("nba_pbp_events" as any)
        .select("period, home_score, away_score, description, team_abbr, player_name, created_at")
        .eq("game_key", gameKey!)
        .order("period", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(4000);

      const rows = ((data ?? []) as unknown as RawPbp[]);

      let lastH = 0, lastA = 0;
      let lastLeader: 1 | -1 | 0 = 0;
      const out: PbpScrubPoint[] = [];
      const homeDeltas: number[] = [];
      const awayDeltas: number[] = [];

      rows.forEach((r, i) => {
        const rawH = Number(r.home_score ?? lastH);
        const rawA = Number(r.away_score ?? lastA);
        const h = Math.max(lastH, isFinite(rawH) ? rawH : lastH);
        const a = Math.max(lastA, isFinite(rawA) ? rawA : lastA);
        homeDeltas.push(h - lastH);
        awayDeltas.push(a - lastA);

        const margin = h - a;
        const leader: 1 | -1 | 0 = margin > 0 ? 1 : margin < 0 ? -1 : 0;
        const leadChange = (leader !== 0 && lastLeader !== 0 && leader !== lastLeader)
          || (leader !== 0 && lastLeader === 0 && i > 0);

        const start = Math.max(0, i - MOMENTUM_WINDOW + 1);
        let hm = 0, am = 0;
        for (let j = start; j <= i; j++) { hm += homeDeltas[j]; am += awayDeltas[j]; }

        out.push({
          idx: i, period: r.period,
          description: r.description ?? "",
          team: r.team_abbr, player: r.player_name,
          home: h, away: a, margin,
          homeMomentum: hm, awayMomentum: am,
          leadChange, leader,
        });

        lastH = h; lastA = a;
        if (leader !== 0) lastLeader = leader;
      });

      return out;
    },
  });
}
