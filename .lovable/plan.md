

## Data Gaps and Feature Enhancements Plan

### 1. Populate NFL/NHL/MLB Rosters

Currently only NBA has players (518, all with birthdays). NFL, NHL, and MLB have zero players. The `fetch-players` edge function exists but only supports NBA-style endpoints.

**Action**: Extend `fetch-players` to support NFL, NHL, and MLB via SportsDataIO endpoints, then trigger for each league. The API structure is the same (`/v3/{league}/scores/json/Players`), but stat field mappings differ per sport. Birth date coverage will depend on what SportsDataIO provides for each league.

### 2. Auto-Generate Opponent Stats on Game Log Upload

Currently uploading ATL's game log only creates `team_game_stats` for ATL. The opponent row is not created, even though the raw data is available in the Basketball Reference file (opponent points, FG%, etc.).

**Action**: Modify `import-team-gamelog` to also insert/update a `team_game_stats` row for the opponent using the `opp_*` fields from the same HTML (opp_fg, opp_fga, opp_ft, etc.). This way, uploading one team's game log populates basic box scores for all 29 opponents automatically. Advanced stats (pace, ORtg, etc.) would still require uploading the opponent's own log.

### 3. Feature Brainstorm — Astrology + Sports Betting

Based on apps like Outlier, BetRithm, RotoWire, and the astrological angle unique to this app:

**A. Streak & Trend Engine (RotoWire / BetRithm style)**
- Auto-detect hot/cold streaks: "Team X is 8-2 ATS in last 10" or "Player Y has hit Over on points in 7 straight"
- Correlate streaks with planetary transits to find astrological patterns (e.g., "Player shoots better when Moon is in fire signs")
- Surface these as "Cosmic Trends" cards on the home feed

**B. Prop Builder with Astro Score**
- Let users build same-game parlays (SGP) with an astrological confidence overlay
- Each leg gets an "Astro Score" (1-10) based on the player's natal chart vs. game-time transits
- Show composite parlay confidence combining statistical edge + astrological alignment

**C. Bankroll Tracker & ROI Dashboard**
- Track units wagered, won, lost across all bets in SkySpread
- Show ROI by league, bet type, and astrological factor
- "Your best bets happen when Mercury is direct" type insights
- Leaderboard among friends for social competition

**D. Injury Impact Model with Natal Charts**
- When a player is listed as questionable/out, auto-calculate lineup impact
- Cross-reference with the replacement player's natal chart for the game time
- "Backup PG has Saturn opposing natal Mars — expect lower assist numbers"

**E. Line Movement Alerts + Cosmic Windows**
- Push notifications when lines move significantly (steam moves, reverse line movement)
- Overlay with "cosmic windows" — optimal betting times based on planetary hours and electional astrology
- "Line moved from -3 to -5, AND Jupiter is applying to natal Sun — strong buy signal"

**F. Historical Backtesting**
- Let users test hypotheses: "How do teams perform when Moon is void-of-course?"
- Use the team_game_stats + transit data already in the DB
- Show win rate, ATS record, and statistical significance
- This leverages all the game logs you're uploading right now

**G. Live Game Astro Overlay (enhancing SkySpread)**
- During live games, show real-time transit activations
- "Mercury just crossed the MC of the game chart — watch for a momentum shift"
- Combine with live play-by-play data for pattern recognition

**H. Matchup Grades (Outlier style)**
- Auto-generate A-F grades for each game: offensive matchup, defensive matchup, pace matchup
- Add an "Astro Grade" as a unique differentiator
- Quick-glance view for the daily slate

---

### Technical Details

**Roster sync (Item 1):**
- Update `fetch-players` to accept league parameter and map sport-specific stat fields
- Run for NFL, NHL, MLB via admin page or cron
- SportsDataIO endpoints: `/v3/nfl/scores/json/Players`, `/v3/nhl/scores/json/Players`, `/v3/mlb/scores/json/Players`

**Opponent stats (Item 2):**
- In `import-team-gamelog/index.ts`, after inserting the team's stats row, build a mirror row for the opponent using `opp_*` fields
- Use the same `game_id`, flip `is_home`, swap `team_abbr` to opponent
- Only insert if no existing row for that opponent+game combo (don't overwrite their own uploaded data)

**Feature priorities (Item 3):**
- Items A, C, and F build directly on data already being collected
- Items B and H require the astro scoring engine (partially built via `astro-batch`)
- Items D and E need injury data integration (endpoint exists via `fetch-injuries-lineups`)
- Item G extends the existing live board infrastructure

