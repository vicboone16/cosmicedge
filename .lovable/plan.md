

# Plan: Create Bet Form, Live Scores Edge Function, and E2E Wiring

## Overview
Three additions to the Cosmic Edge app:
1. A "Create Bet" form on the SkySpread page
2. A backend function that fetches live scores and writes to `game_state_snapshots`
3. Wire the Live Board to display real-time scores from snapshots

---

## 1. Create Bet Form on SkySpread

**File: `src/pages/SkySpreadPage.tsx`**

Add a slide-up sheet/dialog triggered by a floating "+" button in the SkySpread header. The form will include:

- **Game selector**: Dropdown populated from the `games` table (today's and upcoming games), showing "Away @ Home" format. This provides the required `game_id` (uuid) plus auto-fills `home_team` and `away_team`.
- **Market type**: Select with options: Moneyline, Spread, Total, Team Total, Player Prop
- **Selection**: Text input for the pick description (e.g., "Lakers -3.5")
- **Side**: Optional select (Home / Away / Over / Under / Player)
- **Line**: Optional numeric input (e.g., -3.5, 226.5)
- **Odds**: Required numeric input for American odds (e.g., -110, +120)
- **Book**: Optional text input for sportsbook name
- **Stake amount + unit**: Numeric input + toggle between "units" and "$"
- **Confidence**: Slider 0-100 (default 50)
- **Edge score**: Slider 0-100 (default 50)
- **Why summary**: Optional text area
- **Notes**: Optional text area

On submit, insert into `bets` table with `user_id` from auth session, then invalidate the query cache to refresh the list.

Uses existing UI components: `Dialog` or `Sheet` from radix, `Input`, `Label`, `Select`, `Slider`.

---

## 2. Live Scores Edge Function

**File: `supabase/functions/fetch-live-scores/index.ts`** (new function)

This function will:
1. Query the `games` table for games with status = 'live' or today's scheduled games
2. For each game with an `external_id`, call the SportsData.io NBA API (using `SPORTSDATAIO_API_KEY`) to get live box scores
3. Upsert results into `game_state_snapshots` with `game_id`, `status`, `home_score`, `away_score`, `quarter`, `clock`
4. Also update the `games` table `home_score`, `away_score`, and `status` fields

The existing `fetch-live` function uses API-Basketball but doesn't write to `game_state_snapshots`. This new function fills that gap using SportsData.io and writes snapshots.

**Config update: `supabase/config.toml`**
```toml
[functions.fetch-live-scores]
verify_jwt = false
```

---

## 3. Wire Live Board to Display Real-Time Scores

**File: `src/pages/LiveBoardPage.tsx`**

Enhance the `LiveCard` component to:
1. Fetch the latest `game_state_snapshot` for each bet's `game_id`
2. Display live score, quarter, and clock when available
3. Derive the "On Track / Sweating / Danger" indicator by comparing bet selection against live score (e.g., if user bet the over at 226.5 and the current pace projects under, show "Sweating")
4. Call the `fetch-live-scores` edge function on mount and on each refetch interval to ensure snapshots are fresh

The Live Board already has `refetchInterval` logic (15s for live, 5min for pregame). The snapshot query will piggyback on this same interval.

---

## 4. End-to-End Testing

After implementation, I will:
1. Navigate to SkySpread and open the Create Bet form
2. Fill in a test bet and submit
3. Verify it appears in the bet list
4. Select the bet and tap "Add to Live Board"
5. Verify it appears on the Live Board
6. Pin it, verify pin state, unpin it
7. Remove it from Live Board
8. Confirm it still exists in SkySpread (copy, not move)

---

## Technical Details

**Database**: No schema changes needed. All required tables (`bets`, `live_board_items`, `game_state_snapshots`, `games`) already exist with appropriate RLS policies.

**Key constraint**: `bets.game_id` is a required uuid FK to `games`. The Create Bet form must select from existing games, not accept free-text game IDs.

**Key constraint**: `bets.odds` is a required integer. The form must enforce this.

**Files to create:**
- `supabase/functions/fetch-live-scores/index.ts`

**Files to modify:**
- `src/pages/SkySpreadPage.tsx` (add Create Bet form + button)
- `src/pages/LiveBoardPage.tsx` (add snapshot display + edge function call)
- `supabase/config.toml` (add fetch-live-scores function config)
