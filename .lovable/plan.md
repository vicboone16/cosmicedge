

# Comprehensive Feature Plan: Game Detail Enhancements, Historical Hub, Player Props Fix, and Bet Engine Upgrades

This plan addresses all outstanding issues and feature requests in a single coordinated effort.

---

## Part 1: Fix NHL Player Roster Data (Critical)

**Problem**: Only 518 NBA players exist in the database. Zero NHL/MLB/NFL players, so NHL/MLB/NFL game detail pages show empty rosters.

**Solution**: Trigger the `fetch-participants` edge function for NHL, MLB, and NFL to populate rosters, then verify the league filter already in `GameDetail.tsx` works correctly.

- Call `fetch-participants` for each missing league (NHL, MLB, NFL)
- Verify the `.eq("league", game.league)` filter in `GameDetail.tsx` (already added) returns correct players

---

## Part 2: Fix Game Start Times

**Problem**: Old games have incorrect start times from the previous ingestion bug.

**Solution**:
- Trigger a fresh `fetch-odds` call for each active league to re-ingest with correct times
- The start_time fix (skip null times) is already deployed
- Existing games with bad times will be overwritten by the upsert logic when the same external_id is matched

---

## Part 3: Fix Player Props Search

**Problem**: The Player Props page shows "No player props available" because the query depends on `gameIds` being populated first, but if no games exist for the selected date, no props load. The search input filters by player name but there may be no data to filter.

**Solution**:
- The search itself works correctly in code (line 160-163 of `PlayerPropsPage.tsx`)
- The issue is likely no props data in the database. Triggering a refresh via the Refresh All button should populate data
- Add a fallback: if no games found for the date, show a message suggesting the user try a different date or refresh

---

## Part 4: Enhanced Game Detail Page - Player Cards with Stats & History

**File**: `src/pages/GameDetail.tsx`

Enhance the Player Zodiac Map section to include a PrizePicks-style expandable player card:

- Each player card shows: name, zodiac sign, birthday, position
- Tapping a player expands to reveal:
  - **Last 5/10 game stats** (from `player_game_stats` table): PTS, REB, AST, etc.
  - **Over/Under lines** from `player_props` for that game
  - **Astro info**: natal sign, element, current transit modifiers
- Add a "High/Low" indicator comparing the prop line to recent average
- Players remain clickable to navigate to full `/player/:id` page

---

## Part 5: Historical Hub Page (Replace Historical Odds)

**File**: `src/pages/HistoricalOddsPage.tsx` (rename to `HistoricalPage.tsx`)

Transform the current "Historical Odds" into a comprehensive "Historical" hub with tabbed sub-sections:

### Tab 1: Game Results
- Browse past games by date and league
- Show final scores (home_score, away_score from `games` table)
- Show the closing odds alongside results
- Win/loss outcome badges

### Tab 2: Historical Odds & Line Movement
- Current functionality (closing lines, line movement charts, CLV analysis)
- No changes needed, just nested under the tab

### Tab 3: Historical Astrology
- For each past game, show the horary chart data that applied at game time
- Show transit positions, planetary hour, aspects active at tip-off
- Pull from `astro_calculations` table where available

### Tab 4: Historical Player Stats
- Browse `player_game_stats` by date/league
- Show individual box scores for completed games
- Filter by team or player name

### Tab 5: Team Market Outcomes
- Final scores, ATS results, over/under results
- Aggregate team performance trends (record against the spread, over/under record)
- Pull from `games` + `historical_odds` tables

**Route change**: Update `/historical` route to use the new component. Update bottom nav label from "History" to keep consistent.

---

## Part 6: Bet Engine Enhancements

**File**: `src/components/skyspread/CreateBetForm.tsx`

### Same-Game Parlay (SGP) support
- Add a toggle/chip: "Standard Parlay" vs "Same Game Parlay"
- SGP mode locks all legs to the same game
- Auto-populate available markets (ML, spread, total, player props) from that game

### Projected Win calculation
- Add a "Projected Win" display that computes payout based on stake amount and odds
- Formula: stake * decimal_odds for single bets, stake * combined_decimal_odds for parlays

### Past date selection
- Extend the date picker to allow past dates (for logging historical bets)
- Currently only shows next 7 days; add past 7 days as well

### Dollar amount prominently displayed
- Show stake and projected win at the bottom of the form in a summary bar

---

## Part 7: Player Birthday Data

**Current state**: All 518 NBA players have birth dates. NHL/MLB/NFL players don't exist yet.

**Solution**: The `fetch-participants` edge function already handles `birth_date` from the data providers. Once rosters are fetched for other leagues (Part 1), birthdays will be populated for players where the provider has that data. For any gaps, the user can manually provide data or we can add a data enrichment step.

---

## Technical Summary

| Change | Files |
|--------|-------|
| Trigger roster fetch for NHL/MLB/NFL | Edge function calls |
| Trigger fresh odds fetch for correct times | Edge function calls |
| Expandable player cards with stats + history | `src/pages/GameDetail.tsx` |
| Historical hub with 5 tabs | `src/pages/HistoricalOddsPage.tsx` (rewrite) |
| SGP support + projected win + past dates | `src/components/skyspread/CreateBetForm.tsx` |
| Route/nav updates | `src/App.tsx` |
| Player props page - add empty state improvement | `src/pages/PlayerPropsPage.tsx` |

