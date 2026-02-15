

## Multi-League CSV Schedule + Scores Import

### Current State
- **NBA**: 2,661 games, 1,506 with scores -- fully working
- **NFL**: 285 games, **0 scores**
- **NHL**: 1,320 games, **0 scores**
- **MLB**: 2,430 games, **0 scores**

The Excel importer (`import-sdio-bulk`) always sets games as "scheduled" and ignores scores. To get scores for NFL/NHL/MLB, we need to use the CSV importer (`import-historical-csv`) which already supports flexible column detection and scores.

### Plan

**1. Add CSV Upload Cards for NFL, NHL, and MLB to the Admin Import Page**

Add three new import sections (matching the NBA pattern) on the Admin page. Each will:
- Accept a `.csv` file upload
- Auto-set the league (NFL / NHL / MLB)
- Send to `import-historical-csv` which already handles score columns (`HomeScore`, `AwayScore`, `HomePoints`, etc.)
- For completed games: inserts with final scores and "final" status
- For future games: inserts with "scheduled" status and no scores

**2. Update `import-sdio-bulk` Schedule Action to Handle Scores**

The existing schedule action (used by the Excel upload path) currently hardcodes `status: "scheduled"`. Update it to:
- Check for score fields in the record (`homeScore`, `awayScore`, `homeTeamScore`, etc.)
- If scores exist, set `home_score`, `away_score`, and `status: "final"`
- If no scores, keep `status: "scheduled"` as before
- For already-imported games (the 285 NFL, 1320 NHL, 2430 MLB), update scores on re-import instead of skipping

**3. Change Skip-to-Upsert Logic**

Currently the schedule importer skips games that already exist by `external_id`. Since NFL/NHL/MLB games are already in the DB but without scores, we need to upsert -- update the existing record with scores if they exist, rather than skipping.

### Expected CSV Format (Same Across All Leagues)

The `import-historical-csv` function auto-detects columns, so any of these work:

```text
Date,HomeTeam,AwayTeam,HomeScore,AwayScore,Venue,Status
2025-01-05,Buffalo Bills,Denver Broncos,31,7,Highmark Stadium,Final
2025-09-04,Kansas City Chiefs,Baltimore Ravens,,,Arrowhead Stadium,Scheduled
```

Column names are flexible -- the function matches: `DateTime/Date/GameDate`, `HomeTeam/Home`, `AwayTeam/Away/Visitor`, `HomeScore/HomePoints/HomePts`, `AwayScore/AwayPoints/VisitorPts`, `Stadium/Venue/Arena`, `Status/GameStatus`.

### Technical Details

**Admin Page changes (`src/pages/AdminImportPage.tsx`):**
- Add a "League Schedule CSV" card with a league selector (NFL/NHL/MLB/NBA) and file input
- On upload, read the CSV as text, send to `import-historical-csv` via FormData with `league` and `data_type=games`
- Display insert/update/skip counts in the log

**Edge function changes (`supabase/functions/import-sdio-bulk/index.ts`):**
- In the `schedule` action, change the skip logic: when a game already exists by `external_id`, check if the incoming record has scores and update if so
- Map score fields from various possible column names

**No new tables or schema changes required** -- this uses the existing `games` table columns (`home_score`, `away_score`, `status`).

