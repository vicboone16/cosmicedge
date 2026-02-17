

# Duplicate Player Cleanup + App Assessment

## Issue: Duplicate "Last, First" vs "First Last" Players

**Root Cause:** Basketball Reference CSVs use "Last, First" name format. When imported, the player lookup failed to match existing "First Last" records, creating duplicates. The NBAstuffer importer and other importers use "First Last" format, so they matched correctly.

**Production Data:**
- 70 players stored as "Last, First" in the NBA `players` table
- 61 of those are confirmed duplicates of existing "First Last" records
- 9 are "comma-only" players with no "First Last" counterpart
- 0 season stats are linked to the comma-format duplicates (stats went to the correct records)

---

## Plan

### 1. Database Cleanup (Production + Test)

Run a SQL migration that:
- Merges any related data (player_season_stats, player_game_stats, etc.) from comma-format duplicates into their canonical "First Last" counterparts
- Deletes the 61 confirmed duplicate "Last, First" records
- Flips the 9 comma-only records to "First Last" format

### 2. Import Functions: Name Normalization

Update all import edge functions that handle player names to auto-flip "Last, First" to "First Last" before DB lookup/insert:

- `import-player-season-stats` (line 195 — where `name` is read from CSV)
- `import-players-csv` (roster mode and birthtime mode)
- `import-player-gamelog-csv`
- `search_players_unaccent` RPC — make search also match reversed name order

### 3. Search RPC Enhancement

Update the `search_players_unaccent` function to also match when users type partial "Last, First" or "First Last" interchangeably, so even if a stray record slips through, users find the right player.

### 4. Client-Side Display Guard

In the `EntitySearch` component on the Props page, add deduplication logic that normalizes "Last, First" to "First Last" and merges results with the same normalized name + league.

---

## Broader App Assessment

After reviewing the full codebase (routing, data flow, edge functions, pages), here is a summary of the app's health and areas for improvement:

### What's Working Well
- **Architecture**: Clean separation of pages, components, hooks, and edge functions
- **Auth flow**: RequireAuth wrapper properly protects all routes
- **Data pipeline**: Comprehensive import system covering schedules, stats, PBP, players across 4 leagues
- **Astrology integration**: Zodiac/transit modifiers are functional and creative
- **Search**: Accent-insensitive player search via PostgreSQL `unaccent` extension

### Areas to Improve

| Area | Issue | Recommendation |
|------|-------|----------------|
| **Name normalization** | No centralized "Last, First" -> "First Last" conversion in import pipeline | Add a shared `normalizeName()` utility used by all importers |
| **Transit modifiers** | Hardcoded date ranges for Mars/Mercury retrograde on PlayerPage (lines 38-39) | Move to a database table or config so they update without code changes |
| **Error handling** | Some edge functions return errors in the response body with 200 status | Standardize to proper HTTP status codes |
| **Mobile UX** | Date picker on Index page uses small tap targets | Increase touch area for mobile navigation arrows |
| **Offline/PWA** | `vite-plugin-pwa` is installed but no service worker config is visible | Either configure the PWA properly or remove the dependency |
| **Admin access control** | Admin routes use `RequireAuth` but no admin role check in the route | Add admin role verification to prevent regular users from accessing `/admin` |
| **Query limits** | Player searches and list queries don't paginate beyond 200 rows | Add pagination or infinite scroll for large result sets |
| **NFL "LeBron James"** | A stray NFL record for LeBron James exists in production | Clean up as part of the data migration |

### Technical Details

**Files to modify:**
1. **New migration SQL** — cleanup duplicate players in both environments
2. `supabase/functions/import-player-season-stats/index.ts` — add name flip at line ~195
3. `supabase/functions/import-players-csv/index.ts` — add name flip in roster and birthtime modes
4. `search_players_unaccent` RPC — enhance to match reversed names
5. `src/pages/PlayerPropsPage.tsx` — client-side dedup in EntitySearch

**Deployment note:** The SQL cleanup needs to run on both Test and Live environments. The edge function changes deploy automatically. After publishing, the schema migration will apply to Live.

