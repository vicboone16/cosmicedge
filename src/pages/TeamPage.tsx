import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Users, TrendingUp } from "lucide-react";
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
const TeamPage = () => {
  const { abbr } = useParams();
  const navigate = useNavigate();

  const { data: standings } = useQuery({
    queryKey: ["team-standings", abbr],
    queryFn: async () => {
      const { data } = await supabase
        .from("standings")
        .select("*")
        .eq("team_abbr", abbr!)
        .order("season", { ascending: false })
        .limit(1)
        .maybeSingle();
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
