

## Competitive Edge Upgrade: Backtest, Quant, and Live

### Overview

Three interconnected upgrades to make Cosmic Edge a serious astrology-betting platform: prove the astrology predictions work (backtest), sharpen the statistical models (quant), and deliver real-time action (live).

---

### Phase 1: Backtest Astrology Predictions Against Results

**Goal**: Run the astro verdict engine on completed games and compare predictions to actual outcomes to measure accuracy.

**What gets built**:

1. **New "backtest" mode in the quant-engine edge function**
   - Accepts a date range and league
   - For each completed game (`status = 'final'`), runs `handleAstroVerdict` and compares `favored_team` to the actual winner
   - Returns aggregate stats: total games, correct picks, accuracy %, accuracy by strength tier (strong/moderate/slight), accuracy by layer (horary, astrocartography, etc.)

2. **New "Backtest" tab on the Historical page**
   - Date range picker (start/end) and league selector
   - "Run Backtest" button that calls the new mode
   - Results dashboard showing:
     - Overall hit rate (e.g., "58% correct on 200 games")
     - Breakdown by prediction strength (strong/moderate/slight)
     - Breakdown by individual layer performance
     - ROI simulation assuming flat $100 bets on the favored side at market odds

3. **New `backtest_results` table**
   - Stores each backtest run with parameters and results for historical comparison
   - Columns: id, league, date_start, date_end, total_games, correct_picks, accuracy, layer_breakdown (JSONB), created_at

**Data available**: NBA has 1,243 final games, NHL has 2,807, NFL has 285 -- plenty for meaningful backtesting.

---

### Phase 2: Sharpen the Quant Engine

**Goal**: Add new models and improve existing ones to increase prediction accuracy.

**What gets built**:

1. **Home/Away splits model** (`home_away_splits`)
   - Teams perform differently at home vs away; use team_game_stats to compute separate home/away averages for key metrics (ORtg, DRtg, eFG%, pace)
   - Weight: 15% for moneyline, 20% for spread

2. **Rest days / schedule fatigue model** (`schedule_fatigue`)
   - Calculate days since last game for each team using the games table
   - Back-to-back detection (0 rest days = significant penalty)
   - Weight: 10% for moneyline, 15% for spread, 10% for total

3. **Recent form / momentum model** (`recent_form`)
   - Win/loss record in last 5 and last 10 games
   - Point differential trend (improving vs declining)
   - Weight: 10% for moneyline, 10% for spread

4. **Head-to-head history model** (`h2h_history`)
   - Season series record between the two teams
   - Average margin in previous meetings
   - Weight: 5% for moneyline, 10% for spread

5. **Rebalance existing market weights** to accommodate new models while keeping total weight = 1.0

6. **League-specific baselines**
   - Currently only NBA baselines exist; add NHL, NFL, and MLB baseline constants so the quant engine works properly for all four leagues

**Technical changes**: All in `supabase/functions/quant-engine/index.ts` -- new compute functions, updated `MARKET_WEIGHTS`, and new baseline objects per league.

---

### Phase 3: Improve Live In-Game Features

**Goal**: Make the live experience more dynamic with alerts, multi-league support, and in-play odds tracking.

**What gets built**:

1. **Multi-league live score support**
   - Current `fetch-live-scores` only handles NBA via SportsDataIO box scores
   - Add NHL, NFL, and MLB score fetching using the same SportsDataIO API patterns (different sport endpoints)
   - Add SGO (SportsGameOdds) as a fallback source for all leagues

2. **Live odds movement tracking**
   - During live games, poll odds every 60 seconds and store snapshots
   - Show a mini line-movement sparkline on the Live Board cards
   - Highlight significant line moves (> 15 cents ML, > 0.5 spread) with a badge

3. **Smart alerts system**
   - New `alerts` table: id, user_id, game_id, alert_type, threshold, triggered_at, message
   - Alert types: score_change, line_move, quarter_end, game_final, prop_hit
   - In-app toast notifications when alerts trigger (via realtime subscription)
   - UI to configure alerts from the Game Detail page ("Alert me if spread moves past -5")

4. **Live Board enhancements**
   - Auto-settle bets when game reaches "final" (compare result to bet side/line)
   - Show live P&L running total in the header
   - Add a "cash out" simulation showing estimated current value based on live odds vs placed odds

---

### Technical Details

**Database changes (3 new tables)**:

```text
backtest_results
  - id (uuid, PK)
  - user_id (uuid)
  - league (text)
  - date_start (date)
  - date_end (date)
  - total_games (int)
  - correct_picks (int)
  - accuracy (numeric)
  - layer_breakdown (jsonb)
  - roi_simulation (jsonb)
  - created_at (timestamptz)

alerts
  - id (uuid, PK)
  - user_id (uuid)
  - game_id (uuid, FK)
  - alert_type (text)
  - threshold (numeric)
  - message (text)
  - triggered (boolean, default false)
  - triggered_at (timestamptz)
  - created_at (timestamptz)
```

Enable realtime on `alerts` table for push notifications.

**Edge function changes**:
- `quant-engine/index.ts`: New `mode = "backtest"` handler, 4 new model functions, league-specific baselines
- `fetch-live-scores/index.ts`: Add NHL/NFL/MLB endpoints, SGO fallback
- New `check-alerts/index.ts`: Runs after each score/odds update, checks thresholds, marks alerts as triggered

**Frontend changes**:
- `src/pages/HistoricalPage.tsx`: New "Backtest" tab with date range picker and results dashboard
- `src/pages/LiveBoardPage.tsx`: Auto-settle logic, live P&L header, sparkline charts
- `src/pages/GameDetail.tsx`: "Set Alert" button on game cards
- `src/components/live/AlertSetupDialog.tsx`: New dialog for configuring alerts

**Implementation order**:
1. Phase 2 first (quant models) -- foundation for backtesting accuracy
2. Phase 1 next (backtest) -- validates the models
3. Phase 3 last (live) -- most user-facing polish

