import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Star, TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

function getZodiacFromDate(dateStr: string): { sign: string; symbol: string } {
  const d = new Date(dateStr + "T12:00:00");
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const signs = [
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
  for (const s of signs) {
    if ((month === s.m1 && day >= s.d1) || (month === s.m2 && day <= s.d2))
      return { sign: s.sign, symbol: s.symbol };
  }
  return { sign: "Capricorn", symbol: "♑" };
}

const PlayerPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data: player, isLoading } = useQuery({
    queryKey: ["player", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("players")
        .select("*")
        .eq("id", id!)
        .maybeSingle();
      return data;
    },
    enabled: !!id,
  });

  const { data: seasonStats } = useQuery({
    queryKey: ["player-season-stats", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("player_season_stats")
        .select("*")
        .eq("player_id", id!)
        .order("season", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading player...</p>
      </div>
    );
  }

  if (!player) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Player not found</p>
      </div>
    );
  }

  const zodiac = player.birth_date ? getZodiacFromDate(player.birth_date) : null;

  return (
    <div className="min-h-screen">
      <header className="px-4 pt-12 pb-4 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          <span className="text-sm">Back</span>
        </button>
        <h1 className="text-xl font-bold font-display">{player.name}</h1>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-muted-foreground">{player.position || "—"}</span>
          <span className="text-xs text-muted-foreground">·</span>
          <button
            onClick={() => navigate(`/team/${player.team}`)}
            className="text-xs text-primary hover:underline"
          >
            {player.team}
          </button>
        </div>
      </header>

      <div className="px-4 py-4 space-y-4">
        {/* Astro Profile */}
        {zodiac && (
          <section>
            <h3 className="text-xs font-semibold text-primary uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <Star className="h-3.5 w-3.5" />
              Natal Profile
            </h3>
            <div className="celestial-gradient rounded-xl p-4">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-3xl">{zodiac.symbol}</span>
                <div>
                  <p className="text-sm font-semibold text-foreground">Sun in {zodiac.sign}</p>
                  <p className="text-[10px] text-muted-foreground">
                    Born {player.birth_date} {player.birth_place ? `· ${player.birth_place}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="astro-badge rounded-full px-2 py-0.5 text-[10px] font-medium text-cosmic-indigo">
                  {player.natal_data_quality === "exact" ? "Exact Birth Time" : "Noon Projection"}
                </span>
              </div>
            </div>
          </section>
        )}

        {/* Season Stats */}
        {seasonStats && (
          <section>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" />
              Season Averages
            </h3>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "PTS", val: seasonStats.points_per_game },
                { label: "REB", val: seasonStats.rebounds_per_game },
                { label: "AST", val: seasonStats.assists_per_game },
                { label: "FG%", val: seasonStats.fg_pct ? (seasonStats.fg_pct * 100).toFixed(1) : null },
                { label: "3P%", val: seasonStats.three_pct ? (seasonStats.three_pct * 100).toFixed(1) : null },
                { label: "STL", val: seasonStats.steals_per_game },
                { label: "BLK", val: seasonStats.blocks_per_game },
                { label: "MIN", val: seasonStats.minutes_per_game },
              ].map(({ label, val }) => (
                <div key={label} className="cosmic-card rounded-xl p-2.5 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase">{label}</p>
                  <p className="text-sm font-semibold mt-0.5 tabular-nums">{val ?? "—"}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

export default PlayerPage;
