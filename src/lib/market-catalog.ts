/**
 * Complete Odds API Market Catalog
 * Shared reference for edge functions and frontend UI
 */

// ─── Featured (game-level) markets ──────────────────────────────────────────
export const FEATURED_MARKETS = [
  { key: "h2h", label: "Moneyline", description: "Bet on the winning team" },
  { key: "spreads", label: "Spread", description: "Winner after handicap" },
  { key: "totals", label: "Over/Under", description: "Total score threshold" },
  { key: "outrights", label: "Futures", description: "Tournament outcome" },
] as const;

// ─── Additional game-level markets ──────────────────────────────────────────
export const ADDITIONAL_MARKETS = [
  { key: "alternate_spreads", label: "Alt Spreads" },
  { key: "alternate_totals", label: "Alt Totals" },
  { key: "team_totals", label: "Team Totals" },
  { key: "alternate_team_totals", label: "Alt Team Totals" },
  { key: "btts", label: "BTTS", sport: "soccer" },
  { key: "draw_no_bet", label: "Draw No Bet", sport: "soccer" },
  { key: "h2h_3_way", label: "3-Way ML", sport: "soccer" },
] as const;

// ─── Game period markets ────────────────────────────────────────────────────
export interface PeriodMarket {
  key: string;
  label: string;
  sport?: string;
}

export const PERIOD_MARKETS: PeriodMarket[] = [
  // Moneylines
  { key: "h2h_q1", label: "ML Q1" },
  { key: "h2h_q2", label: "ML Q2" },
  { key: "h2h_q3", label: "ML Q3" },
  { key: "h2h_q4", label: "ML Q4" },
  { key: "h2h_h1", label: "ML 1H" },
  { key: "h2h_h2", label: "ML 2H" },
  { key: "h2h_p1", label: "ML P1", sport: "hockey" },
  { key: "h2h_p2", label: "ML P2", sport: "hockey" },
  { key: "h2h_p3", label: "ML P3", sport: "hockey" },
  { key: "h2h_1st_1_innings", label: "ML 1st Inn", sport: "baseball" },
  { key: "h2h_1st_3_innings", label: "ML 1st 3 Inn", sport: "baseball" },
  { key: "h2h_1st_5_innings", label: "ML 1st 5 Inn", sport: "baseball" },
  // Spreads
  { key: "spreads_h1", label: "Spread 1H" },
  { key: "spreads_h2", label: "Spread 2H" },
  { key: "spreads_p1", label: "Spread P1", sport: "hockey" },
  { key: "spreads_p2", label: "Spread P2", sport: "hockey" },
  { key: "spreads_p3", label: "Spread P3", sport: "hockey" },
  { key: "spreads_1st_1_innings", label: "Spread 1st Inn", sport: "baseball" },
  { key: "spreads_1st_3_innings", label: "Spread 1st 3 Inn", sport: "baseball" },
  { key: "spreads_1st_5_innings", label: "Spread 1st 5 Inn", sport: "baseball" },
  { key: "spreads_1st_7_innings", label: "Spread 1st 7 Inn", sport: "baseball" },
  // Totals
  { key: "totals_q1", label: "O/U Q1" },
  { key: "totals_q2", label: "O/U Q2" },
  { key: "totals_q3", label: "O/U Q3" },
  { key: "totals_q4", label: "O/U Q4" },
  { key: "totals_h1", label: "O/U 1H" },
  { key: "totals_h2", label: "O/U 2H" },
  { key: "totals_p1", label: "O/U P1", sport: "hockey" },
  { key: "totals_p2", label: "O/U P2", sport: "hockey" },
  { key: "totals_p3", label: "O/U P3", sport: "hockey" },
  { key: "totals_1st_1_innings", label: "O/U 1st Inn", sport: "baseball" },
  { key: "totals_1st_3_innings", label: "O/U 1st 3 Inn", sport: "baseball" },
  { key: "totals_1st_5_innings", label: "O/U 1st 5 Inn", sport: "baseball" },
  { key: "totals_1st_7_innings", label: "O/U 1st 7 Inn", sport: "baseball" },
  // Team totals
  { key: "team_totals_h1", label: "TT 1H" },
  { key: "team_totals_h2", label: "TT 2H" },
  { key: "team_totals_q1", label: "TT Q1" },
  { key: "team_totals_q2", label: "TT Q2" },
  { key: "team_totals_q3", label: "TT Q3" },
  { key: "team_totals_q4", label: "TT Q4" },
  { key: "team_totals_p1", label: "TT P1", sport: "hockey" },
  { key: "team_totals_p2", label: "TT P2", sport: "hockey" },
  { key: "team_totals_p3", label: "TT P3", sport: "hockey" },
];

// ─── Player prop markets by league ──────────────────────────────────────────
export interface PlayerPropMarket {
  key: string;
  label: string;
  short: string;
  category: "standard" | "alternate";
}

export const NBA_PLAYER_PROPS: PlayerPropMarket[] = [
  { key: "player_points", label: "Points", short: "PTS", category: "standard" },
  { key: "player_points_q1", label: "Points Q1", short: "PTS Q1", category: "standard" },
  { key: "player_rebounds", label: "Rebounds", short: "REB", category: "standard" },
  { key: "player_rebounds_q1", label: "Rebounds Q1", short: "REB Q1", category: "standard" },
  { key: "player_assists", label: "Assists", short: "AST", category: "standard" },
  { key: "player_assists_q1", label: "Assists Q1", short: "AST Q1", category: "standard" },
  { key: "player_threes", label: "3-Pointers", short: "3PM", category: "standard" },
  { key: "player_blocks", label: "Blocks", short: "BLK", category: "standard" },
  { key: "player_steals", label: "Steals", short: "STL", category: "standard" },
  { key: "player_blocks_steals", label: "Blk+Stl", short: "BLK+STL", category: "standard" },
  { key: "player_turnovers", label: "Turnovers", short: "TO", category: "standard" },
  { key: "player_points_rebounds_assists", label: "Pts+Reb+Ast", short: "PRA", category: "standard" },
  { key: "player_points_rebounds", label: "Pts+Reb", short: "PR", category: "standard" },
  { key: "player_points_assists", label: "Pts+Ast", short: "PA", category: "standard" },
  { key: "player_rebounds_assists", label: "Reb+Ast", short: "RA", category: "standard" },
  { key: "player_field_goals", label: "Field Goals", short: "FGM", category: "standard" },
  { key: "player_frees_made", label: "Free Throws", short: "FTM", category: "standard" },
  { key: "player_frees_attempts", label: "FT Attempts", short: "FTA", category: "standard" },
  { key: "player_first_basket", label: "First Basket", short: "1st 🏀", category: "standard" },
  { key: "player_first_team_basket", label: "1st Team Basket", short: "1st TM", category: "standard" },
  { key: "player_double_double", label: "Double-Double", short: "DD", category: "standard" },
  { key: "player_triple_double", label: "Triple-Double", short: "TD", category: "standard" },
  // Alternates
  { key: "player_points_alternate", label: "Alt Points", short: "A-PTS", category: "alternate" },
  { key: "player_rebounds_alternate", label: "Alt Rebounds", short: "A-REB", category: "alternate" },
  { key: "player_assists_alternate", label: "Alt Assists", short: "A-AST", category: "alternate" },
  { key: "player_blocks_alternate", label: "Alt Blocks", short: "A-BLK", category: "alternate" },
  { key: "player_steals_alternate", label: "Alt Steals", short: "A-STL", category: "alternate" },
  { key: "player_turnovers_alternate", label: "Alt Turnovers", short: "A-TO", category: "alternate" },
  { key: "player_threes_alternate", label: "Alt 3PM", short: "A-3PM", category: "alternate" },
  { key: "player_points_assists_alternate", label: "Alt Pts+Ast", short: "A-PA", category: "alternate" },
  { key: "player_points_rebounds_alternate", label: "Alt Pts+Reb", short: "A-PR", category: "alternate" },
  { key: "player_rebounds_assists_alternate", label: "Alt Reb+Ast", short: "A-RA", category: "alternate" },
  { key: "player_points_rebounds_assists_alternate", label: "Alt PRA", short: "A-PRA", category: "alternate" },
];

export const NHL_PLAYER_PROPS: PlayerPropMarket[] = [
  { key: "player_points", label: "Points", short: "PTS", category: "standard" },
  { key: "player_power_play_points", label: "PP Points", short: "PPP", category: "standard" },
  { key: "player_assists", label: "Assists", short: "AST", category: "standard" },
  { key: "player_blocked_shots", label: "Blocked Shots", short: "BLK", category: "standard" },
  { key: "player_shots_on_goal", label: "Shots on Goal", short: "SOG", category: "standard" },
  { key: "player_goals", label: "Goals", short: "G", category: "standard" },
  { key: "player_total_saves", label: "Saves", short: "SV", category: "standard" },
  { key: "player_goal_scorer_first", label: "First Goal", short: "1st G", category: "standard" },
  { key: "player_goal_scorer_last", label: "Last Goal", short: "Last G", category: "standard" },
  { key: "player_goal_scorer_anytime", label: "Anytime Goal", short: "AG", category: "standard" },
  // Alternates
  { key: "player_points_alternate", label: "Alt Points", short: "A-PTS", category: "alternate" },
  { key: "player_assists_alternate", label: "Alt Assists", short: "A-AST", category: "alternate" },
  { key: "player_power_play_points_alternate", label: "Alt PP Pts", short: "A-PPP", category: "alternate" },
  { key: "player_goals_alternate", label: "Alt Goals", short: "A-G", category: "alternate" },
  { key: "player_shots_on_goal_alternate", label: "Alt SOG", short: "A-SOG", category: "alternate" },
  { key: "player_blocked_shots_alternate", label: "Alt Blocked", short: "A-BLK", category: "alternate" },
  { key: "player_total_saves_alternate", label: "Alt Saves", short: "A-SV", category: "alternate" },
];

export const MLB_PLAYER_PROPS: PlayerPropMarket[] = [
  { key: "batter_home_runs", label: "Home Runs", short: "HR", category: "standard" },
  { key: "batter_first_home_run", label: "First HR", short: "1st HR", category: "standard" },
  { key: "batter_hits", label: "Hits", short: "H", category: "standard" },
  { key: "batter_total_bases", label: "Total Bases", short: "TB", category: "standard" },
  { key: "batter_rbis", label: "RBIs", short: "RBI", category: "standard" },
  { key: "batter_runs_scored", label: "Runs Scored", short: "R", category: "standard" },
  { key: "batter_hits_runs_rbis", label: "H+R+RBI", short: "HRR", category: "standard" },
  { key: "batter_singles", label: "Singles", short: "1B", category: "standard" },
  { key: "batter_doubles", label: "Doubles", short: "2B", category: "standard" },
  { key: "batter_triples", label: "Triples", short: "3B", category: "standard" },
  { key: "batter_walks", label: "Walks", short: "BB", category: "standard" },
  { key: "batter_strikeouts", label: "Strikeouts (B)", short: "K-B", category: "standard" },
  { key: "batter_stolen_bases", label: "Stolen Bases", short: "SB", category: "standard" },
  { key: "pitcher_strikeouts", label: "Strikeouts (P)", short: "K-P", category: "standard" },
  { key: "pitcher_record_a_win", label: "Pitcher Win", short: "W", category: "standard" },
  { key: "pitcher_hits_allowed", label: "Hits Allowed", short: "HA", category: "standard" },
  { key: "pitcher_walks", label: "Walks (P)", short: "BB-P", category: "standard" },
  { key: "pitcher_earned_runs", label: "Earned Runs", short: "ER", category: "standard" },
  { key: "pitcher_outs", label: "Outs", short: "OUT", category: "standard" },
  // Alternates
  { key: "batter_total_bases_alternate", label: "Alt TB", short: "A-TB", category: "alternate" },
  { key: "batter_home_runs_alternate", label: "Alt HR", short: "A-HR", category: "alternate" },
  { key: "batter_hits_alternate", label: "Alt Hits", short: "A-H", category: "alternate" },
  { key: "batter_rbis_alternate", label: "Alt RBI", short: "A-RBI", category: "alternate" },
  { key: "batter_walks_alternate", label: "Alt BB", short: "A-BB", category: "alternate" },
  { key: "batter_strikeouts_alternate", label: "Alt K(B)", short: "A-K-B", category: "alternate" },
  { key: "batter_runs_scored_alternate", label: "Alt Runs", short: "A-R", category: "alternate" },
  { key: "batter_singles_alternate", label: "Alt 1B", short: "A-1B", category: "alternate" },
  { key: "batter_doubles_alternate", label: "Alt 2B", short: "A-2B", category: "alternate" },
  { key: "batter_triples_alternate", label: "Alt 3B", short: "A-3B", category: "alternate" },
  { key: "pitcher_hits_allowed_alternate", label: "Alt HA", short: "A-HA", category: "alternate" },
  { key: "pitcher_walks_alternate", label: "Alt BB(P)", short: "A-BB-P", category: "alternate" },
  { key: "pitcher_strikeouts_alternate", label: "Alt K(P)", short: "A-K-P", category: "alternate" },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

export const LEAGUE_PROPS: Record<string, PlayerPropMarket[]> = {
  NBA: NBA_PLAYER_PROPS,
  NHL: NHL_PLAYER_PROPS,
  MLB: MLB_PLAYER_PROPS,
};

/** Get short display name for any market key */
export function getMarketShort(marketKey: string): string {
  for (const league of Object.values(LEAGUE_PROPS)) {
    const found = league.find((m) => m.key === marketKey);
    if (found) return found.short;
  }
  // Period markets
  const period = PERIOD_MARKETS.find((m) => m.key === marketKey);
  if (period) return period.label;
  // Fallback
  return marketKey.replace(/^(player_|batter_|pitcher_)/, "").replace(/_/g, " ").toUpperCase();
}

/** Get label for any market key */
export function getMarketLabel(marketKey: string): string {
  for (const league of Object.values(LEAGUE_PROPS)) {
    const found = league.find((m) => m.key === marketKey);
    if (found) return found.label;
  }
  const period = PERIOD_MARKETS.find((m) => m.key === marketKey);
  if (period) return period.label;
  return marketKey;
}

/** Get standard (non-alternate) market keys for a league */
export function getStandardMarkets(league: string): string[] {
  return (LEAGUE_PROPS[league] || [])
    .filter((m) => m.category === "standard")
    .map((m) => m.key);
}

/** Get all market keys for a league (standard + alternate) */
export function getAllMarkets(league: string): string[] {
  return (LEAGUE_PROPS[league] || []).map((m) => m.key);
}
