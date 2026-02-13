export type League = "NBA" | "NFL" | "MLB" | "NHL" | "NCAAB" | "NCAAF";

export interface GameOdds {
  moneyline: { home: number; away: number };
  spread: { home: number; away: number; line: number };
  total: { over: number; under: number; line: number };
}

export interface Game {
  id: string;
  league: League;
  homeTeam: string;
  awayTeam: string;
  homeAbbr: string;
  awayAbbr: string;
  startTime: string;
  venue: string;
  odds: GameOdds;
  status: "scheduled" | "live" | "final";
  homeScore?: number;
  awayScore?: number;
}

const today = new Date();
const makeTime = (h: number, m: number) => {
  const d = new Date(today);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

export const mockGames: Game[] = [
  {
    id: "nba-1",
    league: "NBA",
    homeTeam: "Los Angeles Lakers",
    awayTeam: "Boston Celtics",
    homeAbbr: "LAL",
    awayAbbr: "BOS",
    startTime: makeTime(19, 30),
    venue: "Crypto.com Arena",
    odds: {
      moneyline: { home: 145, away: -170 },
      spread: { home: -3.5, away: 3.5, line: -110 },
      total: { over: -110, under: -110, line: 224.5 },
    },
    status: "scheduled",
  },
  {
    id: "nba-2",
    league: "NBA",
    homeTeam: "Golden State Warriors",
    awayTeam: "Phoenix Suns",
    homeAbbr: "GSW",
    awayAbbr: "PHX",
    startTime: makeTime(22, 0),
    venue: "Chase Center",
    odds: {
      moneyline: { home: -135, away: 115 },
      spread: { home: -2.5, away: 2.5, line: -110 },
      total: { over: -105, under: -115, line: 230 },
    },
    status: "scheduled",
  },
  {
    id: "nba-3",
    league: "NBA",
    homeTeam: "Milwaukee Bucks",
    awayTeam: "Denver Nuggets",
    homeAbbr: "MIL",
    awayAbbr: "DEN",
    startTime: makeTime(20, 0),
    venue: "Fiserv Forum",
    odds: {
      moneyline: { home: -150, away: 130 },
      spread: { home: -3, away: 3, line: -110 },
      total: { over: -110, under: -110, line: 228 },
    },
    status: "live",
    homeScore: 58,
    awayScore: 52,
  },
  {
    id: "nfl-1",
    league: "NFL",
    homeTeam: "Kansas City Chiefs",
    awayTeam: "Buffalo Bills",
    homeAbbr: "KC",
    awayAbbr: "BUF",
    startTime: makeTime(16, 30),
    venue: "Arrowhead Stadium",
    odds: {
      moneyline: { home: -155, away: 135 },
      spread: { home: -3, away: 3, line: -110 },
      total: { over: -110, under: -110, line: 51.5 },
    },
    status: "scheduled",
  },
  {
    id: "nfl-2",
    league: "NFL",
    homeTeam: "Philadelphia Eagles",
    awayTeam: "Dallas Cowboys",
    homeAbbr: "PHI",
    awayAbbr: "DAL",
    startTime: makeTime(13, 0),
    venue: "Lincoln Financial Field",
    odds: {
      moneyline: { home: -200, away: 170 },
      spread: { home: -4.5, away: 4.5, line: -110 },
      total: { over: -110, under: -110, line: 45.5 },
    },
    status: "final",
    homeScore: 31,
    awayScore: 24,
  },
  {
    id: "mlb-1",
    league: "MLB",
    homeTeam: "New York Yankees",
    awayTeam: "Houston Astros",
    homeAbbr: "NYY",
    awayAbbr: "HOU",
    startTime: makeTime(19, 5),
    venue: "Yankee Stadium",
    odds: {
      moneyline: { home: -130, away: 110 },
      spread: { home: -1.5, away: 1.5, line: -110 },
      total: { over: -110, under: -110, line: 8.5 },
    },
    status: "scheduled",
  },
  {
    id: "nhl-1",
    league: "NHL",
    homeTeam: "Edmonton Oilers",
    awayTeam: "Toronto Maple Leafs",
    homeAbbr: "EDM",
    awayAbbr: "TOR",
    startTime: makeTime(21, 0),
    venue: "Rogers Place",
    odds: {
      moneyline: { home: -140, away: 120 },
      spread: { home: -1.5, away: 1.5, line: -110 },
      total: { over: -110, under: -110, line: 6.5 },
    },
    status: "scheduled",
  },
];

export const leagues: League[] = ["NBA", "NFL", "MLB", "NHL", "NCAAB", "NCAAF"];

export const leagueColors: Record<League, string> = {
  NBA: "var(--cosmic-glow)",
  NFL: "var(--cosmic-green)",
  MLB: "var(--cosmic-red)",
  NHL: "var(--cosmic-cyan)",
  NCAAB: "var(--cosmic-gold)",
  NCAAF: "var(--cosmic-gold)",
};
