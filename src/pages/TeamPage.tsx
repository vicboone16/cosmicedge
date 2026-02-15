import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Users, TrendingUp, ChevronDown, ChevronUp, BarChart3 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

const ZODIAC_RANGES = [
  { sign: "Capricorn", symbol: "♑", m1: 1, d1: 1, m2: 1, d2: 19 },
  { sign: "Aquarius", symbol: "♒", m1: 1, d1: 20, m2: 2, d2: 18 },
  { sign: "Pisces", symbol: "♓", m1: 2, d1: 19, m2: 3, d2: 20 },
  { sign: "Aries", symbol: "♈", m1: 3, d1: 21, m2: 4, d2: 19 },
  { sign: "Taurus", symbol: "♉", m1: 4, d1: 20, m2: 5, d2: 20 },
  { sign: "Gemini", symbol: "♊", m1: 5, d1: 21, m2: 6, d2: 20 },
  { sign: "Cancer", symbol: "♋", m1: 6, d1: 21, m2: 7, d2: 22 },
  { sign: "Leo", symbol: "♌", m1: 7, d1: 23, m2: 8, d2: 22 },
  { sign: "Virgo", symbol: "♍", m1: 8, d1: 23, m2: 9, d2: 22 },
  { sign: "Libra", symbol: "♎", m1: 9, d1: 23, m2: 10, d2: 22 },
  { sign: "Scorpio", symbol: "♏", m1: 10, d1: 23, m2: 11, d2: 21 },
  { sign: "Sagittarius", symbol: "♐", m1: 11, d1: 22, m2: 12, d2: 21 },
  { sign: "Capricorn", symbol: "♑", m1: 12, d1: 22, m2: 12, d2: 31 },
];

function getSignFromDate(dateStr: string): { sign: string; symbol: string } {
  const d = new Date(dateStr + "T12:00:00");
  const month = d.getMonth() + 1;
  const day = d.getDate();
  for (const s of ZODIAC_RANGES) {
    if ((month === s.m1 && day >= s.d1) || (month === s.m2 && day <= s.d2))
      return { sign: s.sign, symbol: s.symbol };
  }
  return { sign: "Capricorn", symbol: "♑" };
}
function StatCell({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="cosmic-card rounded-xl p-2 text-center">
      <p className="text-[9px] text-muted-foreground uppercase">{label}</p>
      <p className="text-xs font-semibold mt-0.5">{value ?? "—"}</p>
    </div>
  );
}

const TeamPage = () => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { abbr, league: leagueParam } = useParams();
  const navigate = useNavigate();

  const { data: standings } = useQuery({
    queryKey: ["team-standings", abbr],
    queryFn: async () => {
      let query = supabase
        .from("standings")
        .select("*")
        .eq("team_abbr", abbr!)
        .order("season", { ascending: false })
        .limit(1);
      if (leagueParam) query = query.eq("league", leagueParam.toUpperCase());
      const { data } = await query.maybeSingle();
      return data;
    },
    enabled: !!abbr,
  });

  const { data: players, isLoading: loadingPlayers } = useQuery({
    queryKey: ["team-roster", abbr, standings?.league],
    queryFn: async () => {
      let query = supabase
        .from("players")
        .select("*")
        .eq("team", abbr!)
        .order("name");
      // Filter by league if we know it from standings
      if (standings?.league) {
        query = query.eq("league", standings.league);
      }
      const { data } = await query;
      return data || [];
    },
    enabled: !!abbr,
  });

  // Fetch advanced game stats (Four Factors, ORtg/DRtg, etc.)
  const { data: advancedStats } = useQuery({
    queryKey: ["team-advanced-stats", abbr],
    queryFn: async () => {
      const { data } = await supabase
        .from("team_game_stats")
        .select("*")
        .eq("team_abbr", abbr!)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!abbr,
  });

  // Compute season averages from game logs
  const seasonAvg = advancedStats && advancedStats.length > 0
    ? (() => {
        const n = advancedStats.length;
        const avg = (key: string) => {
          const vals = advancedStats
            .map((r: any) => r[key])
            .filter((v: any) => v !== null && v !== undefined);
          return vals.length ? (vals.reduce((a: number, b: number) => a + b, 0) / vals.length) : null;
        };
        return {
          games: n,
          ppg: avg("points"),
          off_rating: avg("off_rating"),
          def_rating: avg("def_rating"),
          pace: avg("pace"),
          ts_pct: avg("ts_pct"),
          efg_pct: avg("efg_pct"),
          tov_pct: avg("tov_pct"),
          orb_pct: avg("orb_pct"),
          ft_per_fga: avg("ft_per_fga"),
          opp_efg_pct: avg("opp_efg_pct"),
          opp_tov_pct: avg("opp_tov_pct"),
          opp_orb_pct: avg("opp_orb_pct"),
          opp_ft_per_fga: avg("opp_ft_per_fga"),
          ftr: avg("ftr"),
          three_par: avg("three_par"),
          trb_pct: avg("trb_pct"),
          ast_pct: avg("ast_pct"),
          stl_pct: avg("stl_pct"),
          blk_pct: avg("blk_pct"),
        };
      })()
    : null;

  const teamName = standings?.team_name || players?.[0]?.team || abbr;

  return (
    <div className="min-h-screen">
      <header className="px-4 pt-12 pb-4 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          <span className="text-sm">Back</span>
        </button>
        <h1 className="text-xl font-bold font-display">{teamName}</h1>
        {standings && (
          <p className="text-xs text-muted-foreground mt-1">
            {standings.wins}W – {standings.losses}L · {standings.conference} · Seed #{standings.playoff_seed || "—"}
          </p>
        )}
      </header>

      <div className="px-4 py-4 space-y-4">
        {/* Stats */}
        {standings && (
          <section>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" />
              Season Record
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="cosmic-card rounded-xl p-3 text-center">
                <p className="text-[10px] text-muted-foreground uppercase">Home</p>
                <p className="text-sm font-semibold mt-1">{standings.home_record || "—"}</p>
              </div>
              <div className="cosmic-card rounded-xl p-3 text-center">
                <p className="text-[10px] text-muted-foreground uppercase">Away</p>
                <p className="text-sm font-semibold mt-1">{standings.away_record || "—"}</p>
              </div>
              <div className="cosmic-card rounded-xl p-3 text-center">
                <p className="text-[10px] text-muted-foreground uppercase">Streak</p>
                <p className="text-sm font-semibold mt-1">{standings.streak || "—"}</p>
              </div>
            </div>
          </section>
        )}

        {/* Advanced Stats - Hidden by default */}
        {seasonAvg && (
          <section>
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full flex items-center justify-between py-2 group"
            >
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                <BarChart3 className="h-3.5 w-3.5" />
                Advanced Stats ({seasonAvg.games} games)
              </h3>
              {showAdvanced ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
              )}
            </button>

            {showAdvanced && (
              <div className="space-y-3 mt-2 animate-in fade-in slide-in-from-top-2 duration-200">
                {/* Core Metrics */}
                <div className="grid grid-cols-4 gap-2">
                  <StatCell label="PPG" value={seasonAvg.ppg?.toFixed(1)} />
                  <StatCell label="ORtg" value={seasonAvg.off_rating?.toFixed(1)} />
                  <StatCell label="DRtg" value={seasonAvg.def_rating?.toFixed(1)} />
                  <StatCell label="Pace" value={seasonAvg.pace?.toFixed(1)} />
                </div>

                {/* Shooting */}
                <div className="grid grid-cols-4 gap-2">
                  <StatCell label="TS%" value={seasonAvg.ts_pct != null ? (seasonAvg.ts_pct * 100).toFixed(1) + "%" : null} />
                  <StatCell label="eFG%" value={seasonAvg.efg_pct != null ? (seasonAvg.efg_pct * 100).toFixed(1) + "%" : null} />
                  <StatCell label="FTr" value={seasonAvg.ftr?.toFixed(3)} />
                  <StatCell label="3PAr" value={seasonAvg.three_par?.toFixed(3)} />
                </div>

                {/* Offensive Four Factors */}
                <p className="text-[9px] font-semibold text-primary/70 uppercase tracking-wider mt-1">Offensive Four Factors</p>
                <div className="grid grid-cols-4 gap-2">
                  <StatCell label="eFG%" value={seasonAvg.efg_pct != null ? (seasonAvg.efg_pct * 100).toFixed(1) + "%" : null} />
                  <StatCell label="TOV%" value={seasonAvg.tov_pct?.toFixed(1)} />
                  <StatCell label="ORB%" value={seasonAvg.orb_pct?.toFixed(1)} />
                  <StatCell label="FT/FGA" value={seasonAvg.ft_per_fga?.toFixed(3)} />
                </div>

                {/* Defensive Four Factors */}
                <p className="text-[9px] font-semibold text-primary/70 uppercase tracking-wider mt-1">Defensive Four Factors</p>
                <div className="grid grid-cols-4 gap-2">
                  <StatCell label="Opp eFG%" value={seasonAvg.opp_efg_pct != null ? (seasonAvg.opp_efg_pct * 100).toFixed(1) + "%" : null} />
                  <StatCell label="Opp TOV%" value={seasonAvg.opp_tov_pct?.toFixed(1)} />
                  <StatCell label="Opp ORB%" value={seasonAvg.opp_orb_pct?.toFixed(1)} />
                  <StatCell label="Opp FT/FGA" value={seasonAvg.opp_ft_per_fga?.toFixed(3)} />
                </div>

                {/* Other Advanced */}
                <div className="grid grid-cols-4 gap-2">
                  <StatCell label="TRB%" value={seasonAvg.trb_pct?.toFixed(1)} />
                  <StatCell label="AST%" value={seasonAvg.ast_pct?.toFixed(1)} />
                  <StatCell label="STL%" value={seasonAvg.stl_pct?.toFixed(1)} />
                  <StatCell label="BLK%" value={seasonAvg.blk_pct?.toFixed(1)} />
                </div>
              </div>
            )}
          </section>
        )}

        {/* Roster */}
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            Roster ({players?.length || 0})
          </h3>
          {loadingPlayers ? (
            <p className="text-sm text-muted-foreground">Loading roster...</p>
          ) : (
            <div className="space-y-2">
              {players?.map((p) => (
                <button
                  key={p.id}
                  onClick={() => navigate(`/player/${p.id}`)}
                  className="w-full cosmic-card rounded-xl p-3 flex items-center gap-3 hover:border-primary/30 transition-colors text-left"
                >
                  <Avatar className="h-9 w-9 shrink-0">
                    {p.headshot_url && <AvatarImage src={p.headshot_url} alt={p.name} />}
                    <AvatarFallback className="text-[10px] bg-secondary">
                      {p.name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{p.name}</p>
                    <p className="text-[10px] text-muted-foreground">{p.position || "—"}</p>
                  </div>
                  {p.birth_date && (() => {
                    const z = getSignFromDate(p.birth_date);
                    return (
                      <span className="astro-badge rounded-full px-2 py-0.5 text-[10px] font-medium text-cosmic-indigo">
                        {z.symbol} {z.sign}
                      </span>
                    );
                  })()}
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default TeamPage;
