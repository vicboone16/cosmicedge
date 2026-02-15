import { useState } from "react";
import { ChevronLeft, ChevronRight, Star, Orbit } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, addDays, startOfWeek, isSameDay } from "date-fns";
import { cn } from "@/lib/utils";

function getMoonPhaseForDate(date: Date): { emoji: string; name: string } {
  const lp = 2551443;
  const newMoon = new Date(1970, 0, 7, 20, 35, 0).getTime() / 1000;
  const phase = ((date.getTime() / 1000 - newMoon) % lp) / lp;
  const day = phase * 29.53;
  if (day < 1.85) return { emoji: "🌑", name: "New" };
  if (day < 5.53) return { emoji: "🌒", name: "Wax Crescent" };
  if (day < 9.22) return { emoji: "🌓", name: "1st Quarter" };
  if (day < 12.91) return { emoji: "🌔", name: "Wax Gibbous" };
  if (day < 16.61) return { emoji: "🌕", name: "Full" };
  if (day < 20.30) return { emoji: "🌖", name: "Wan Gibbous" };
  if (day < 23.99) return { emoji: "🌗", name: "3rd Quarter" };
  if (day < 27.68) return { emoji: "🌘", name: "Wan Crescent" };
  return { emoji: "🌑", name: "New" };
}

function getRetroForDate(date: Date): string[] {
  const retros = [
    { planet: "☿ Mercury", start: new Date("2026-01-25"), end: new Date("2026-02-15") },
    { planet: "☿ Mercury", start: new Date("2026-05-20"), end: new Date("2026-06-12") },
    { planet: "♀ Venus", start: new Date("2026-03-02"), end: new Date("2026-04-13") },
    { planet: "♂ Mars", start: new Date("2025-12-06"), end: new Date("2026-02-24") },
    { planet: "♃ Jupiter", start: new Date("2026-07-14"), end: new Date("2026-11-10") },
    { planet: "♄ Saturn", start: new Date("2026-06-08"), end: new Date("2026-10-24") },
  ];
  return retros.filter(r => date >= r.start && date <= r.end).map(r => r.planet);
}

function getAspectsForDate(date: Date): { aspect: string; impact: "positive" | "negative" | "neutral" }[] {
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const hash = day * 31 + month * 7;
  const aspects: { aspect: string; impact: "positive" | "negative" | "neutral" }[] = [];
  if (hash % 5 === 0) aspects.push({ aspect: "☉ △ ♃ — Expansion", impact: "positive" });
  if (hash % 7 === 0) aspects.push({ aspect: "♂ □ ♆ — Confusion", impact: "negative" });
  if (hash % 3 === 0) aspects.push({ aspect: "♀ ☌ ♃ — Grace", impact: "positive" });
  if (hash % 11 === 0) aspects.push({ aspect: "☽ ☍ ♄ — Restriction", impact: "negative" });
  if (hash % 9 === 0) aspects.push({ aspect: "☿ ⚹ ♇ — Insight", impact: "neutral" });
  return aspects;
}

const CosmicCalendarContent = () => {
  const navigate = useNavigate();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const { data: weekGames } = useQuery({
    queryKey: ["week-games", weekStart.toISOString()],
    queryFn: async () => {
      const start = days[0];
      const end = addDays(days[6], 1);
      const { data } = await supabase
        .from("games")
        .select("id, home_abbr, away_abbr, start_time, status, league")
        .gte("start_time", start.toISOString())
        .lt("start_time", end.toISOString())
        .order("start_time");
      return data || [];
    },
  });

  return (
    <div className="px-4 py-4">
      {/* Week navigation */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setWeekStart(addDays(weekStart, -7))} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-center">
          <p className="text-xs text-muted-foreground">Week of</p>
          <button onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))} className="text-sm text-primary font-medium hover:underline">
            {format(weekStart, "MMMM d, yyyy")}
          </button>
        </div>
        <button onClick={() => setWeekStart(addDays(weekStart, 7))} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="pb-24 space-y-3">
        {days.map((day) => {
          const moonPhase = getMoonPhaseForDate(day);
          const retros = getRetroForDate(day);
          const aspects = getAspectsForDate(day);
          const dayGames = weekGames?.filter(g => isSameDay(new Date(g.start_time), day)) || [];
          const isToday = isSameDay(day, new Date());

          return (
            <div key={day.toISOString()} className={cn(
              "cosmic-card rounded-xl overflow-hidden",
              isToday && "border-primary/40 cosmic-glow"
            )}>
              <div className={cn(
                "px-4 py-2.5 flex items-center justify-between",
                isToday ? "celestial-gradient" : "bg-secondary/30"
              )}>
                <div className="flex items-center gap-2">
                  <span className="text-lg">{moonPhase.emoji}</span>
                  <div>
                    <p className={cn("text-xs font-semibold", isToday ? "text-primary" : "text-foreground")}>
                      {format(day, "EEEE, MMM d")}
                      {isToday && <span className="ml-1 text-[10px] text-primary font-bold">TODAY</span>}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{moonPhase.name} Moon</p>
                  </div>
                </div>
                <div className="text-right">
                  {dayGames.length > 0 && (
                    <span className="text-[10px] text-cosmic-indigo font-semibold">{dayGames.length} game{dayGames.length > 1 ? "s" : ""}</span>
                  )}
                </div>
              </div>

              <div className="px-4 py-3 space-y-2">
                {retros.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Orbit className="h-3 w-3 text-destructive" />
                    {retros.map((r, i) => (
                      <span key={i} className="text-[10px] font-medium text-destructive bg-destructive/10 rounded-full px-2 py-0.5">
                        {r} ℞
                      </span>
                    ))}
                  </div>
                )}

                {aspects.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Star className="h-3 w-3 text-cosmic-gold" />
                    {aspects.map((a, i) => (
                      <span key={i} className={cn(
                        "text-[10px] font-medium rounded-full px-2 py-0.5",
                        a.impact === "positive" ? "text-cosmic-green bg-cosmic-green/10"
                          : a.impact === "negative" ? "text-cosmic-red bg-cosmic-red/10"
                          : "text-cosmic-gold bg-cosmic-gold/10"
                      )}>
                        {a.aspect}
                      </span>
                    ))}
                  </div>
                )}

                {dayGames.length > 0 ? (
                  <div className="space-y-1.5">
                    {dayGames.map((g) => (
                      <button
                        key={g.id}
                        onClick={() => navigate(`/game/${g.id}`)}
                        className="w-full flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2 hover:bg-secondary/60 transition-colors"
                      >
                        <span className="text-xs font-semibold text-foreground">{g.away_abbr} @ {g.home_abbr}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground">{format(new Date(g.start_time), "h:mm a")}</span>
                          <span className="text-[10px] text-cosmic-indigo font-medium">{g.league}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-muted-foreground italic">No games scheduled</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CosmicCalendarContent;
