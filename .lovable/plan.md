
# Bulk Game Status Editor, CSV Template Downloads & Database Export

## Overview

Three distinct features to be built:

1. **Bulk Game Status Editor** — A new tab inside the Games manager that switches to a spreadsheet-style table for mass-updating status and scores across a date range and league filter, with a single "Save All Changes" action.

2. **CSV Template Download Buttons** — Added directly to each import card in the Imports tab so you can download a correctly-formatted template CSV before uploading.

3. **Export to CSV Buttons** — A new Export section in the Admin Hub (inside the Games tab) that downloads the current `games` or `players` table as a CSV file for editing and re-uploading.

---

## Technical Details

### Feature 1: Bulk Game Status Editor (new tab in AdminGameManager.tsx)

The existing `AdminGameManager` already has date navigation and league filtering. A second view mode ("Bulk Edit") will be added as a toggle alongside the current card-based "Card View".

**How it works:**
- Toggling to "Bulk Edit" mode shows an editable table with columns: Away @ Home, Time, Status (dropdown), Away Score, Home Score.
- All visible rows are loaded into a local editable state (a `Record<id, edits>` object).
- Only rows with changes are highlighted (dirty rows shown with a subtle background color).
- A "Save X Changes" button at the top commits all dirty rows in a single batch `UPDATE` call using `.in("id", dirtyIds)` — but since each row may have different values, it loops through dirty rows and fires parallel individual updates (Promise.all) with a concise toast summary.
- Date range: adds a second date picker ("End Date") that appears only in bulk edit mode, so you can span multiple days (e.g., an entire week of games).
- The existing single-day date nav remains unchanged in card view mode.

**New state added to `AdminGameManager.tsx`:**
```typescript
const [viewMode, setViewMode] = useState<"card" | "bulk">("card");
const [bulkEndDate, setBulkEndDate] = useState<Date | null>(null);
const [bulkEdits, setBulkEdits] = useState<Record<string, { status: string; home_score: string; away_score: string }>>({});
```

**Bulk query** (only active in bulk mode): fetches games between `startDate` and `bulkEndDate` (up to 7 days max enforced in UI) for the selected league.

**Bulk save mutation:** loops through dirty `bulkEdits` entries, fires parallel `supabase.from("games").update(...)eq("id", id)` calls, then invalidates queries and toasts summary.

### Feature 2: CSV Template Download Buttons

A pure client-side utility function `downloadCsvTemplate(filename, headers, exampleRow)` will be added that constructs a CSV string with a header row and one example row, then triggers a browser download via `URL.createObjectURL`.

Templates to add (one button per import card in `AdminImportPage.tsx`):

| Card | Template filename | Headers |
|---|---|---|
| Schedule/Scores CSV | `schedule_scores_template.csv` | Date, HomeTeam, AwayTeam, HomeScore, AwayScore, Venue, Status |
| Roster CSV | `roster_template.csv` | Name, Team, Position, League, BirthDate, BirthPlace, BirthTime, ExternalId |
| Birth Time CSV | `birth_time_template.csv` | Name, League, BirthTime, BirthPlace |

Each button uses a `Download` icon from lucide-react and sits inline with the existing upload controls.

### Feature 3: Export to CSV Buttons

A new `AdminExportPanel` component will be created at `src/components/admin/AdminExportPanel.tsx`.

**Export options:**
- **Games Export** — with league filter + status filter (all / scheduled / final / postponed) + date range (optional). Queries `games` table with pagination to bypass the 1,000-row Supabase default limit (fetches in chunks of 1,000 using `.range(offset, offset+999)` until no more rows).
- **Players Export** — with league filter. Queries `players` table (id, name, team, position, league, birth_date, birth_time, birth_place, natal_data_quality).

Both exports:
- Show a loading state while fetching
- Use the same `downloadCsvTemplate` utility to serialize and trigger download
- File is named `games_NBA_2026-02-19.csv` or `players_NFL_2026-02-19.csv` etc.

This panel is added to the **Games tab** of `AdminPage.tsx` below the existing `AdminGameManager`, or as a collapsible card section.

---

## Files To Create / Modify

1. **`src/components/admin/AdminExportPanel.tsx`** — New component (Export section).
2. **`src/components/admin/AdminGameManager.tsx`** — Add bulk edit toggle, bulk end date picker, editable table view, bulk save mutation.
3. **`src/pages/AdminImportPage.tsx`** — Add template download buttons to three import cards.
4. **`src/pages/AdminPage.tsx`** — Add `AdminExportPanel` under the Games tab content.
5. **`src/lib/csv-utils.ts`** — New shared utility: `downloadCsvTemplate`, `arrayToCsv`, `downloadCsv`.

---

## Implementation Sequence

1. Create `src/lib/csv-utils.ts` with shared CSV helpers.
2. Create `src/components/admin/AdminExportPanel.tsx`.
3. Modify `src/pages/AdminImportPage.tsx` to add template download buttons.
4. Modify `src/components/admin/AdminGameManager.tsx` to add bulk edit mode.
5. Modify `src/pages/AdminPage.tsx` to wire in the export panel.

---

## Edge Cases & Notes

- Bulk edit date range is capped at 14 days to prevent loading thousands of rows into the browser.
- The export uses chunked pagination (`.range()`) to exceed the default 1,000-row API limit for large leagues like NBA/MLB.
- Template downloads are fully client-side — no network call needed.
- The bulk save will skip games where status, home_score, and away_score are all unchanged from the originally loaded values (true dirty checking).
- Export columns for games: `id, league, home_team, away_team, home_abbr, away_abbr, start_time, status, home_score, away_score` — exactly what the schedule CSV importer expects for re-upload.
