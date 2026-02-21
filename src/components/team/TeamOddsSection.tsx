import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { TrendingUp, ChevronDown, ChevronUp, DollarSign, Calendar, History as HistoryIcon } from "lucide-react";

// Map abbreviation → full team name for historical_odds matching
const ABBR_TO_FULL: Record<string, string> = {
  ATL: "Atlanta Hawks", BOS: "Boston Celtics", BKN: "Brooklyn Nets",
  CHA: "Charlotte Hornets", CHI: "Chicago Bulls", CLE: "Cleveland Cavaliers",
  DAL: "Dallas Mavericks", DEN: "Denver Nuggets", DET: "Detroit Pistons",
  GSW: "Golden State Warriors", HOU: "Houston Rockets", IND: "Indiana Pacers",
  LAC: "Los Angeles Clippers", LAL: "Los Angeles Lakers", MEM: "Memphis Grizzlies",
  MIA: "Miami Heat", MIL: "Milwaukee Bucks", MIN: "Minnesota Timberwolves",
  NOP: "New Orleans Pelicans", NYK: "New York Knicks", OKC: "Oklahoma City Thunder",
  ORL: "Orlando Magic", PHI: "Philadelphia 76ers", PHX: "Phoenix Suns",
  POR: "Portland Trail Blazers", SAC: "Sacramento Kings", SAS: "San Antonio Spurs",
  TOR: "Toronto Raptors", UTA: "Utah Jazz", WAS: "Washington Wizards",
};

interface TeamOddsSectionProps {
  abbr: string;
  league: string;
}

interface OddsRecord {
  home_team: string;
  away_team: string;
  market_type: string;
  line: number | null;
  home_price: number | null;
  away_price: number | null;
  snapshot_date: string;
  bookmaker: string;
}

interface GameWithResult {
  home_abbr: string;
  away_abbr: string;
  home_score: number | null;
  away_score: number | null;
  start_time: string;
  status: string;
  id: string;
}

/** Shift a date string by N days, returning YYYY-MM-DD */
function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

export function TeamOddsSection({ abbr, league }: TeamOddsSectionProps) {
  const [expanded, setExpanded] = useState(true);
  const teamFullName = ABBR_TO_FULL[abbr] || abbr;

  // Get team's final games with scores — increased limit
  const { data: finalGames } = useQuery({
    queryKey: ["team-final-games-odds", abbr, league],
    queryFn: async () => {
      const { data } = await supabase
        .from("games")
        .select("id, home_abbr, away_abbr, home_score, away_score, start_time, status")
        .eq("league", league)
        .or(`home_abbr.eq.${abbr},away_abbr.eq.${abbr}`)
        .eq("status", "final")
        .order("start_time", { ascending: false })
        .limit(200);
      return data || [];
    },
    enabled: !!abbr,
  });

  // Get historical odds for the team
  const { data: histOdds } = useQuery({
    queryKey: ["team-hist-odds", teamFullName],
    queryFn: async () => {
      const { data } = await supabase
        .from("historical_odds")
        .select("home_team, away_team, market_type, line, home_price, away_price, snapshot_date, bookmaker")
        .or(`home_team.eq.${teamFullName},away_team.eq.${teamFullName}`)
        .order("snapshot_date", { ascending: false })
        .limit(1000);
      return (data || []) as OddsRecord[];
    },
    enabled: !!teamFullName,
  });

  // Get odds_snapshots for upcoming games — only future
  const { data: upcomingOdds } = useQuery({
    queryKey: ["team-upcoming-odds", abbr, league],
    queryFn: async () => {
      const { data: upcoming } = await supabase
        .from("games")
        .select("id, home_abbr, away_abbr, start_time")
        .eq("league", league)
        .or(`home_abbr.eq.${abbr},away_abbr.eq.${abbr}`)
        .eq("status", "scheduled")
        .gte("start_time", new Date().toISOString())
        .order("start_time", { ascending: true })
        .limit(5);

      if (!upcoming?.length) return [];

      const gameIds = upcoming.map((g) => g.id);
      const { data: odds } = await supabase
        .from("odds_snapshots")
        .select("game_id, market_type, line, home_price, away_price, bookmaker, captured_at")
        .in("game_id", gameIds)
        .order("captured_at", { ascending: true });

      return upcoming.map((g) => ({
        ...g,
        odds: (odds || []).filter((o) => o.game_id === g.id),
      }));
    },
    enabled: !!abbr,
  });

  // Compute ATS and O/U records
  const records = computeRecords(finalGames || [], histOdds || [], abbr, teamFullName);

  // Get opening/closing lines for recent final games
  const recentLines = getRecentLines(finalGames?.slice(0, 10) || [], histOdds || [], abbr, teamFullName);

  if (!histOdds?.length && !upcomingOdds?.length) return null;

  return (
    <section>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between py-2 group"
      >
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
          <DollarSign className="h-3.5 w-3.5" />
          Odds & Records
        </h3>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="space-y-4 mt-2 animate-in fade-in slide-in-from-top-2 duration-200">
          {/* ATS & O/U Records */}
          {(records.ats.total > 0 || records.ou.total > 0) && (
            <div className="grid grid-cols-2 gap-3">
              {records.ats.total > 0 && (
                <div className="cosmic-card rounded-xl p-3 text-center">
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wide">ATS Record</p>
                  <p className="text-lg font-bold mt-1">
                    <span className="text-cosmic-green">{records.ats.wins}</span>
                    <span className="text-muted-foreground">-</span>
                    <span className="text-cosmic-red">{records.ats.losses}</span>
                    {records.ats.pushes > 0 && (
                      <span className="text-muted-foreground">-{records.ats.pushes}</span>
                    )}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {records.ats.total > 0 ? ((records.ats.wins / records.ats.total) * 100).toFixed(0) : 0}% cover rate
                  </p>
                </div>
              )}
              {records.ou.total > 0 && (
                <div className="cosmic-card rounded-xl p-3 text-center">
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Over/Under</p>
                  <p className="text-lg font-bold mt-1">
                    <span className="text-cosmic-green">{records.ou.overs}</span>
                    <span className="text-muted-foreground">-</span>
                    <span className="text-cosmic-red">{records.ou.unders}</span>
                    {records.ou.pushes > 0 && (
                      <span className="text-muted-foreground">-{records.ou.pushes}</span>
                    )}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {records.ou.total > 0 ? ((records.ou.overs / records.ou.total) * 100).toFixed(0) : 0}% over rate
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Recent Lines */}
          {recentLines.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <HistoryIcon className="h-3 w-3" />
                Recent Lines
              </h4>
              <div className="space-y-1">
                {recentLines.map((line, i) => (
                  <div key={i} className="cosmic-card rounded-lg p-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground w-12">
                        {new Date(line.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </span>
                      <span className="text-xs font-semibold">
                        {line.isHome ? "vs" : "@"} {line.opponent}
                      </span>
                      {line.result && (
                        <span className={cn(
                          "text-[9px] font-bold",
                          line.result === "W" ? "text-cosmic-green" : "text-cosmic-red"
                        )}>
                          {line.result} {line.score}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-right">
                      {line.spread !== null && (
                        <div>
                          <p className="text-[8px] text-muted-foreground uppercase">Spread</p>
                          <p className={cn("text-[11px] font-semibold tabular-nums",
                            line.coveredSpread === true ? "text-cosmic-green" :
                            line.coveredSpread === false ? "text-cosmic-red" : ""
                          )}>
                            {line.spread > 0 ? "+" : ""}{line.spread}
                          </p>
                        </div>
                      )}
                      {line.total !== null && (
                        <div>
                          <p className="text-[8px] text-muted-foreground uppercase">Total</p>
                          <p className={cn("text-[11px] font-semibold tabular-nums",
                            line.wentOver === true ? "text-cosmic-green" :
                            line.wentOver === false ? "text-cosmic-red" : ""
                          )}>
                            {line.total} {line.wentOver !== null ? (line.wentOver ? "O" : "U") : ""}
                          </p>
                        </div>
                      )}
                      {line.moneyline !== null && (
                        <div>
                          <p className="text-[8px] text-muted-foreground uppercase">ML</p>
                          <p className="text-[11px] font-semibold tabular-nums">
                            {line.moneyline > 0 ? "+" : ""}{line.moneyline}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upcoming Lines */}
          {upcomingOdds && upcomingOdds.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <Calendar className="h-3 w-3" />
                Upcoming Lines
              </h4>
              <div className="space-y-1">
                {upcomingOdds.map((g) => {
                  const isHome = g.home_abbr === abbr;
                  const opp = isHome ? g.away_abbr : g.home_abbr;

                  const latestML = g.odds.filter((o: any) => o.market_type === "moneyline").pop();
                  const latestSpread = g.odds.filter((o: any) => o.market_type === "spread").pop();
                  const latestTotal = g.odds.filter((o: any) => o.market_type === "total").pop();

                  const mlPrice = latestML ? (isHome ? latestML.home_price : latestML.away_price) : null;
                  const spreadLine = latestSpread ? (isHome ? latestSpread.line : (latestSpread.line ? -latestSpread.line : null)) : null;
                  const totalLine = latestTotal?.line ?? null;

                  return (
                    <div key={g.id} className="cosmic-card rounded-lg p-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground w-12">
                          {new Date(g.start_time).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </span>
                        <span className="text-xs font-semibold">
                          {isHome ? "vs" : "@"} {opp}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-right">
                        {spreadLine !== null && (
                          <div>
                            <p className="text-[8px] text-muted-foreground uppercase">Spread</p>
                            <p className="text-[11px] font-semibold tabular-nums">
                              {spreadLine > 0 ? "+" : ""}{spreadLine}
                            </p>
                          </div>
                        )}
                        {totalLine !== null && (
                          <div>
                            <p className="text-[8px] text-muted-foreground uppercase">Total</p>
                            <p className="text-[11px] font-semibold tabular-nums">{totalLine}</p>
                          </div>
                        )}
                        {mlPrice !== null && (
                          <div>
                            <p className="text-[8px] text-muted-foreground uppercase">ML</p>
                            <p className="text-[11px] font-semibold tabular-nums">
                              {mlPrice > 0 ? "+" : ""}{mlPrice}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** Match odds with ±1 day tolerance and team name/abbr matching */
function findMatchingOdds(
  odds: OddsRecord[],
  dateStr: string,
  isHome: boolean,
  fullName: string,
  abbr: string
): OddsRecord[] {
  const datesToCheck = [dateStr, shiftDate(dateStr, -1), shiftDate(dateStr, 1)];

  return odds.filter((o) => {
    const matchesDate = datesToCheck.includes(o.snapshot_date);
    if (!matchesDate) return false;

    // Try full name match first, then abbr-based match
    if (isHome) {
      return o.home_team === fullName ||
        o.home_team.toLowerCase().includes(abbr.toLowerCase());
    } else {
      return o.away_team === fullName ||
        o.away_team.toLowerCase().includes(abbr.toLowerCase());
    }
  });
}

function computeRecords(
  games: GameWithResult[],
  odds: OddsRecord[],
  abbr: string,
  fullName: string
) {
  const ats = { wins: 0, losses: 0, pushes: 0, total: 0 };
  const ou = { overs: 0, unders: 0, pushes: 0, total: 0 };

  for (const game of games) {
    if (game.home_score == null || game.away_score == null) continue;

    const isHome = game.home_abbr === abbr;
    const dateStr = game.start_time.split("T")[0];

    const matchingOdds = findMatchingOdds(odds, dateStr, isHome, fullName, abbr);

    // Spread ATS
    const spreadOdds = matchingOdds.find((o) => o.market_type === "spread" && o.line != null);
    if (spreadOdds && spreadOdds.line != null) {
      const homeMargin = game.home_score - game.away_score;
      const spreadResult = homeMargin + spreadOdds.line;

      if (isHome) {
        if (spreadResult > 0) ats.wins++;
        else if (spreadResult < 0) ats.losses++;
        else ats.pushes++;
      } else {
        if (spreadResult < 0) ats.wins++;
        else if (spreadResult > 0) ats.losses++;
        else ats.pushes++;
      }
      ats.total++;
    }

    // Total O/U
    const totalOdds = matchingOdds.find((o) => o.market_type === "total" && o.line != null);
    if (totalOdds && totalOdds.line != null) {
      const actualTotal = game.home_score + game.away_score;
      if (actualTotal > totalOdds.line) ou.overs++;
      else if (actualTotal < totalOdds.line) ou.unders++;
      else ou.pushes++;
      ou.total++;
    }
  }

  return { ats, ou };
}

function getRecentLines(
  games: GameWithResult[],
  odds: OddsRecord[],
  abbr: string,
  fullName: string
) {
  return games.map((game) => {
    const isHome = game.home_abbr === abbr;
    const opp = isHome ? game.away_abbr : game.home_abbr;
    const dateStr = game.start_time.split("T")[0];

    const matchingOdds = findMatchingOdds(odds, dateStr, isHome, fullName, abbr);

    const spreadOdd = matchingOdds.find((o) => o.market_type === "spread");
    const totalOdd = matchingOdds.find((o) => o.market_type === "total");
    const mlOdd = matchingOdds.find((o) => o.market_type === "moneyline");

    const teamScore = isHome ? game.home_score : game.away_score;
    const oppScore = isHome ? game.away_score : game.home_score;
    const won = teamScore != null && oppScore != null && teamScore > oppScore;

    let coveredSpread: boolean | null = null;
    const spreadLine = spreadOdd?.line != null
      ? (isHome ? spreadOdd.line : -spreadOdd.line)
      : null;

    if (spreadOdd?.line != null && game.home_score != null && game.away_score != null) {
      const homeMargin = game.home_score - game.away_score;
      const spreadResult = homeMargin + spreadOdd.line;
      coveredSpread = isHome ? spreadResult > 0 : spreadResult < 0;
    }

    let wentOver: boolean | null = null;
    if (totalOdd?.line != null && game.home_score != null && game.away_score != null) {
      const actualTotal = game.home_score + game.away_score;
      if (actualTotal !== totalOdd.line) {
        wentOver = actualTotal > totalOdd.line;
      }
    }

    const mlPrice = mlOdd
      ? (isHome ? mlOdd.home_price : mlOdd.away_price)
      : null;

    return {
      date: game.start_time,
      opponent: opp,
      isHome,
      result: teamScore != null && oppScore != null ? (won ? "W" : "L") : null,
      score: teamScore != null && oppScore != null ? `${teamScore}-${oppScore}` : null,
      spread: spreadLine,
      total: totalOdd?.line ?? null,
      moneyline: mlPrice,
      coveredSpread,
      wentOver,
    };
  }).filter((l) => l.spread !== null || l.total !== null || l.moneyline !== null);
}
