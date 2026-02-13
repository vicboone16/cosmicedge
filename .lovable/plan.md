
# Historical Data CSV Import Plan

## What You'll Do

Upload your CSV/Excel files (one per sport) containing historical game results, scores, odds, and player stats. A new backend function will parse each file and insert the data into the same tables the app already reads from — so the Historical page, astrology overlays, and analytics all work exactly the same, just powered by your local data instead of API calls.

## How It Works

1. **You upload your spreadsheets** via a new "Import Historical Data" section on the Settings page
2. A backend function reads each file, maps the columns to the existing database schema, and batch-inserts the rows
3. Duplicate detection prevents re-importing the same games
4. Once imported, the Historical page, odds charts, player stats, and astrology analysis all pull from the stored data — no API calls needed

## What Gets Built

### 1. CSV Import Edge Function (`import-historical-csv`)
- Accepts a CSV file upload plus a `league` parameter (NBA, NFL, MLB, NHL) and a `data_type` parameter (games, odds, player_stats)
- Parses the CSV rows and maps columns to the existing table schemas:
  - **Games** go into the `games` table (home_team, away_team, start_time, home_score, away_score, status="final")
  - **Odds** go into the `historical_odds` table (market_type, bookmaker, home_price, away_price, line, snapshot_date)
  - **Player stats** go into the `player_game_stats` table (points, rebounds, assists, etc.)
- Uses team name normalization (the same `TEAM_ABBR` map already in the codebase) to generate abbreviations
- Deduplicates by matching on league + home_team + away_team + start_time (within 2-hour window, per existing convention)
- Links odds rows to their matching `game_id` in the games table
- Processes in batches of 200 rows to avoid timeouts

### 2. File Upload UI (Settings Page)
- New "Import Historical Data" card on the Settings page
- File picker that accepts `.csv` and `.xlsx` files
- Dropdown selectors for League (NBA/NFL/MLB/NHL) and Data Type (Games & Scores, Odds, Player Stats)
- Progress indicator showing rows processed
- Success/error toast notifications

### 3. Column Auto-Mapping
- The function will detect common column headers from SportsDataIO exports (e.g., `HomeTeam`, `AwayTeam`, `HomeScore`, `AwayScore`, `DateTime`, `OverUnder`, `PointSpread`)
- Falls back to positional mapping if headers don't match
- Logs any unmapped or skipped rows for troubleshooting

### 4. Storage Bucket for Uploads
- Create a `csv-imports` storage bucket for temporarily holding uploaded files
- Files are processed and then can be cleaned up

## What Stays the Same
- The Historical page continues reading from `games`, `historical_odds`, and `player_game_stats` — no UI changes needed there
- Astrology overlays keep working since they reference game start times and venue coordinates from the same `games` table
- The "Fetch" button on the Historical page still works for pulling new data from APIs when needed — CSV import just pre-fills the database so you don't burn quota on past seasons

## Technical Details

### Database Changes
- No new tables needed — data goes into existing `games`, `historical_odds`, and `player_game_stats` tables
- Add a `source` column (text, default 'api') to `games` and `historical_odds` so you can distinguish API-fetched vs CSV-imported data

### Edge Function: `import-historical-csv`
- Endpoint: POST with multipart/form-data (file + league + data_type)
- Uses service role key for inserts (same pattern as other data-fetching functions)
- CSV parsing via a lightweight Deno CSV parser
- Returns: `{ success, rows_parsed, rows_inserted, rows_skipped, errors[] }`

### Settings Page Addition
- New card below the Timezone selector
- Upload flow: Select league → Select data type → Pick file → Click Import → See progress → Done toast

### Expected CSV Column Formats
The function will handle SportsDataIO's standard export format. For example, a Games CSV might have: `Date, HomeTeam, AwayTeam, HomeScore, AwayScore, Stadium, Season` — each gets mapped to the corresponding database column.

Before your first upload, I'll ask you to share one of the CSV files so I can see the exact column headers and map them precisely.
