# Nexus & Team Page — 9-Issue Fix Plan

## Overview

This plan addresses all 9 issues raised. All fixes target the Published (Live) site. Changes are in frontend components and logic only — no schema migrations required, as the data exists and just needs correct querying and display logic. Add a last 5 game results drill-down when tapping on a team card in the Nexus Teams list, showing the 5 most recent scores inline before navigating to the full team page

---

## Issue 1 — Trending Players Always Empty

### Root Cause

The `player_props` table has 0 rows in production. When the query returns nothing, no trending players are shown.

### Fix

Implement a 3-tier fallback in `NexusPage.tsx` → `PlayersTab`:

**Tier 1** (if `player_props` has data): current logic — rank by prop frequency.

**Tier 2** (preferred for now): Query actual last-5-game composite scores from the `games` table + `player_game_stats`. Since `player_game_stats` is also currently empty, advance to Tier 3.

**Tier 3** (guaranteed fallback): Query `players` table filtered to `league = 'NBA'`, ordering by a curated list of well-known player names, or simply return the first 12 players that have a headshot URL (to ensure clean display). This guarantees 10+ players always appear.

**Implementation**:

- Modify `queryFn` in the `trending` query:
  1. Try `player_props` — if result length >= 10, use it.
  2. Try `player_game_stats` joined to `players` — rank by `PTS + REB + AST + STL + BLK - TOV` over last 14 days — if result length >= 10, use it.
  3. Fallback: fetch top players from `players` WHERE `headshot_url IS NOT NULL` AND `league = 'NBA'` LIMIT 12, ordered by name (deterministic).
- Add a stat indicator label to each trending card: show "NBA" badge + position so it never looks empty.

---

## Issue 2 — Team "Last 5 Dots" Not Always 5

### Root Cause

The current logic reads the `streak` field (e.g., "W2") and renders only 2 dots. It doesn't know the full last-5 history.

### Fix

Replace the streak-only logic with a real last-5-games query from the `games` table:

In `TeamsTab` in `NexusPage.tsx`:

- After loading standings, run a **batch query** for all team abbrs: fetch the most recent 5 `final` games per team.
- Since Supabase doesn't natively support a "top N per group" query efficiently, use a client-side approach:
  - Fetch the last 30 final games per league, filtering by `home_abbr IN (teamAbbrs) OR away_abbr IN (teamAbbrs)`.
  - Client-side: group by team, take the 5 most recent, determine W/L.
- Display exactly 5 dots. If fewer than 5 final games found (rare), pad with gray dots.
- Dot order: left = oldest, right = newest (most recent on right).

---

## Issue 3 — Results Card Too Bulky

### Root Cause

The Team Page's Recent Games section uses a tall card format with a lot of padding and a separate period ticker row.

### Fix

In `TeamPage.tsx` Recent Games section, tighten the card format:

- Reduce padding from `p-2.5` to `p-2`.
- Display scores inline: `@ CHA   107-110   L` (one line, not stacked).
- Show FINAL label inline (right-side), small `text-[9px]` muted.
- Hide `PeriodScoresTicker` by default (collapse it behind a tap, or remove it from this list view to reduce bulk).
- Match the compact format already used in the HistoricalPage results tab.

---

## Issue 4 — ATS Record Shows Partial Data (1-0)

### Root Cause

The `computeRecords` function matches odds to games using `snapshot_date === dateStr`, where `dateStr` is derived from `game.start_time.split("T")[0]`. Games with UTC midnight start times (e.g., `2026-02-11T00:00:00Z`) resolve to `2026-02-11` in UTC but are actually Feb 10 in US timezones — causing date mismatches with the historical odds `snapshot_date`.

### Fix

In `TeamOddsSection.tsx` `computeRecords` function:

- Expand the date matching window: try `dateStr`, `dateStr - 1 day`, and `dateStr + 1 day` (±1 day tolerance).
- Also loosen the team name matching — if `fullName` doesn't match, also try matching by game `home_abbr`/`away_abbr` vs the abbreviation, since some historical odds use different team name formats.
- Update the `getRecentLines` function with the same loosened date-matching logic.
- Increase the `finalGames` limit from `100` to `200` to capture the full season.

---

## Issue 5 — Upcoming/Recent Game Sections Show Wrong Games

### Root Cause

The `upcomingGames` query only filters `status = 'scheduled'` but the schedule data includes games from November 2025 that are also tagged `scheduled` (they were never updated to `final`). The database shows `start_time` dates of Nov 16, 18, 20, etc. that have passed.

Similarly, the `recentGames` section in `TeamOddsSection` fetches upcoming games for the "Upcoming Lines" section — the `upcomingOdds` query uses `status = 'scheduled'` which also picks up stale past-scheduled games.

### Fix

**In `TeamPage.tsx**`:

- `upcomingGames` query: add `.gte("start_time", new Date().toISOString())` filter so only truly future games appear.
- `recentGames` query: already filters by `status IN ('final', 'live')` — this is correct. No change needed here.

**In `TeamOddsSection.tsx**`:

- `upcomingOdds` query (for "Upcoming Lines"): add `.gte("start_time", new Date().toISOString())` to the inner upcoming games fetch.
- `recentLines` (for "Recent Lines"): is driven by `finalGames` which correctly uses `status = 'final'` — no change needed.

This single filter addition fixes both "Upcoming Lines" and "Upcoming Games" showing past games.

---

## Issue 6 — Team Rankings & Stats Missing / PPG Mismatch

### Root Cause

- `team_season_stats.points_per_game` stores per-**half** PPG (47pts), not per-game PPG (114pts). This is because the CSV import divided total points by 2 halves rather than by games played.
- `team_season_stats.off_rating`, `def_rating`, `pace` are all `NULL` — the SportsDataIO advanced endpoint wasn't populated.
- `team_game_stats` has correct per-game data but only for teams with game logs (limited coverage).

### Fix

**Single source of truth**: Use `team_game_stats` (per-game logs) as the authoritative source for advanced stats, since it has valid `off_rating`, `def_rating`, `pace`. This is what `TeamPage.tsx` already does for "Advanced Stats."

**Remove the confusing `team_season_stats` "Team Rankings" bar chart** (shown in the referenced screenshot as the duplicated/conflicting section — this is the `TeamOddsSection` → `TeamMatchupTab` comparison bars). Instead:

- In `TeamPage.tsx`, rename "Advanced Stats" → "Team Stats (Season Avg)" and make it visible by default (collapsed toggle optional).
- Remove the duplicate PPG display. Show only one PPG: computed from `team_game_stats` averages (`seasonAvg.ppg`), labeled as "Avg PPG ({N} games)" to be explicit.
- For `off_rating`, `def_rating`, `pace` that show "—" when no game logs: show a helpful note "No advanced stats available yet" instead of rows of dashes.
- In `GameMatchupTab` comparison bars: derive PPG from `team_game_stats` averages (same query logic), not from `team_season_stats`.

---

## Issue 7 — Typography / Section Header Inconsistency

### Root Cause

Different sections use different patterns for section headers. "Recent Lines / Upcoming Lines" in `TeamOddsSection.tsx` uses a purple uppercase small-caps style (`text-[9px] font-semibold text-primary/70 uppercase tracking-wider`). Other sections use `text-xs font-semibold text-muted-foreground uppercase tracking-widest` with an icon.

### Fix

Standardize all section headers in `TeamPage.tsx` and `TeamOddsSection.tsx`:

- Create a consistent header style matching the **icon + uppercase small text** pattern already used in `TeamPage.tsx` section headers (which actually looks the best and most consistent).
- Update `TeamOddsSection.tsx` "Recent Lines" and "Upcoming Lines" sub-headers to use the same `text-xs font-semibold text-muted-foreground uppercase tracking-widest` style with a small icon (`TrendingUp` / `Calendar`).
- Update `TeamPage.tsx` "Upcoming Games", "Recent Games", "Roster" headers to all use exactly the same JSX pattern.

---

## Issue 8 — Roster Section Styling

### Root Cause

The Roster header in `TeamPage.tsx` uses the correct icon style but its player rows have inconsistent padding/typography vs the rest of the page. Also, the section title style slightly differs from other headers.

### Fix

- Ensure the Roster section header uses exactly the same `<h3>` style as all other sections (per Issue 7 fix).
- The player rows in the Roster already look reasonable from the code. Confirm the `Avatar` + name + position + zodiac badge layout renders cleanly on mobile. No major changes needed beyond the header consistency.

---

## Issue 9 — Auto-Refresh Pipeline

### Root Cause

The app fetches on page load but doesn't re-fetch after games change from scheduled → final. The `useGames` hook has a `refetchInterval` for live games but Team pages don't.

### Fix

In `TeamPage.tsx`:

- Add `refetchInterval` to `recentGames` and `upcomingGames` queries: refresh every 3 minutes (`180_000ms`) when the page is active.
- For games currently `live`, use a faster 30-second interval (check if any game in `recentGames` has `status = 'live'`).
- In `NexusPage.tsx` `TeamsTab`: add `staleTime: 5 * 60_000` and `refetchInterval: 3 * 60_000` to the standings query so dots update automatically after games complete.

---

## Files to Modify


| File                                      | Changes                                                                                                                |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `src/pages/NexusPage.tsx`                 | Trending players fallback logic; 5-dot derivation from actual game results; standings refetch interval                 |
| `src/pages/TeamPage.tsx`                  | Fix upcoming games date filter; compact recent games cards; tighten roster header; add refetch intervals               |
| `src/components/team/TeamOddsSection.tsx` | Fix upcoming lines date filter; loosen ATS date-matching (±1 day); increase finalGames limit; header style consistency |


No database migrations required. No new edge functions required.

---

## Acceptance Criteria (verified on Live site, mobile)

- Trending Players shows 12 players with name + team + position every time.
- Every team card in Nexus → Teams shows exactly 5 W/L dots derived from actual game results.
- Recent Games cards are compact and match the historical results card style.
- ATS Record reflects all season games that have matching odds (not just 1-0).
- Upcoming Games/Lines only show games with `start_time >= NOW()`.
- Recent Games/Lines only show games with `status = 'final'`.
- Team Stats section shows one PPG source clearly labeled with game count.
- All section headers use the same icon + uppercase muted style.
- Roster section header matches all others.
- Pages auto-refresh standings and game data every 3 minutes without manual reload.