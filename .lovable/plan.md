

# Import ESPN-Format NBA Box Score XLSX

## Overview

Your spreadsheet contains per-game NBA player box scores in ESPN format (e.g., FG = "8-13", 3PT = "3-5"). Once imported, these stats will appear on each player's profile page under their game log, and also power the Game Detail stats tab showing who played and how they performed.

## What Will Be Built

### 1. New Backend Function: `import-nba-boxscore-xlsx`

A new backend function that:
- Accepts the XLSX file upload
- Parses each row, splitting compound stat columns ("8-13" into made=8, attempted=13)
- Matches players by name (creating new player records if needed, with "Last, First" normalization)
- Matches games by team abbreviation + opponent + date (with +/-1 day tolerance for timezone)
- Inserts records into `player_game_stats` with upsert on (game_id, player_id)
- Skips DNP rows (where `did_not_play = TRUE`)

**Columns mapped from the spreadsheet:**
- `player_name` -> player lookup/create
- `team_abbr` -> team
- `game_date` -> game matching
- `MIN`, `PTS`, `REB`, `AST`, `STL`, `BLK`, `TO`, `PF`, `Plus-Minus` -> direct integer fields
- `FG` ("8-13") -> `fg_made`, `fg_attempted`
- `3PT` ("3-5") -> `three_made`, `three_attempted`
- `FT` ("2-3") -> `ft_made`, `ft_attempted`
- `OREB`, `DREB` -> `off_rebounds`, `def_rebounds`
- `starter` -> `starter` boolean

**Game matching logic:**
- For each row, determine the opponent by finding the other team in the same `event_id`
- Look up game by home/away abbreviation + date in the games table
- Use the same +/-1 day fuzzy matching as the existing importers

### 2. Admin UI Upload Button

Add a new card to the Admin Import page:
- Title: "NBA Box Score XLSX Import (ESPN Format)"
- Description explaining the expected format
- File input accepting `.xlsx` files
- Import button that sends the file to the new function
- Result logging showing rows parsed, stats inserted, players created, games unmatched

### 3. Where Stats Appear

Once imported, the data automatically shows up in:
- **Player Page** - Game log table (last 82 games with PTS, REB, AST, etc.)
- **Game Detail > Stats Tab** - Full box score for each team
- **Trends Page** - Player stat trends over time
- **Historical Page** - Historical box score lookups

No changes needed to these pages since they already read from `player_game_stats`.

---

## Technical Details

### New file: `supabase/functions/import-nba-boxscore-xlsx/index.ts`

Key parsing logic for split stats:
```text
"8-13" -> { made: 8, attempted: 13 }
```

Game matching strategy:
- Group rows by `event_id` to identify both teams in each game
- Determine home vs away from the two team entries per event
- Match against the `games` table using `home_abbr|away_abbr|date`

### Modified file: `src/pages/AdminImportPage.tsx`

Add a new Card section with:
- File input for `.xlsx`
- Uses the `xlsx` library (already installed) to convert to JSON client-side, then sends as JSON to the edge function
- OR sends the raw file as FormData (edge function handles XLSX parsing via a Deno-compatible library)

Since the `xlsx` library is already installed on the frontend, the most reliable approach is to parse the XLSX client-side into JSON rows, then POST the JSON to a simpler edge function. This avoids Deno XLSX compatibility issues.

### Files to create/modify:
1. **Create** `supabase/functions/import-nba-boxscore-xlsx/index.ts` - New edge function accepting JSON rows
2. **Modify** `src/pages/AdminImportPage.tsx` - Add upload card with client-side XLSX parsing

