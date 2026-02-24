

## Problem Analysis

There are **two separate issues**:

### Issue 1: Publish Blocked
The deployment system compares the Test database schema against the Live database schema and generates a migration to sync them. **Live has extra objects that don't exist in Test**, so the system tries to DROP them in Live but fails because of inter-dependencies (views depend on functions, views depend on other views).

**Objects in Live but missing from Test:**
- **Functions:** `np_norm_cdf`, `np_apply_edgescore_v11`, `np_persist_edgescore_v11`
- **Views:** `np_player_prop_stat_long`, `np_v_closing_lines`, `np_v_backtest_overlay`, `np_v_backtest_results`

### Issue 2: Aaron Wiggins / Frozen UI on Live Site
Since publishes have been failing, the Live site is running stale code. Any recent frontend fixes (sorting, interactivity, new features) haven't reached production. The "frozen on Aaron Wiggins" behavior is likely caused by old deployed code that has a bug or missing data handling -- once publishing is unblocked, the current codebase (which works in preview) will deploy and fix this.

---

## Plan

### Step 1: Create a single migration to add all missing objects to Test

Write one migration file that creates all 3 functions and 4 views (using `CREATE OR REPLACE` / `CREATE OR REPLACE VIEW`) so the Test schema matches Live. This will eliminate the diff and the deploy system won't try to drop anything.

**Migration contents:**

```text
-- 1. np_norm_cdf function (immutable, used by edgescore v11 computation)
-- 2. np_apply_edgescore_v11 function  
-- 3. np_persist_edgescore_v11 function
-- 4. np_player_prop_stat_long view (unpivots player_game_stats into prop_type/stat_value)
-- 5. np_v_closing_lines view (last snapshot per prop from odds history)
-- 6. np_v_backtest_overlay view (joins predictions with closing lines)
-- 7. np_v_backtest_results view (joins overlay with actual stats + win_flag)
```

### Step 2: Verify publish succeeds

After the migration applies to Test, the schema diff between Test and Live should be empty (or minimal), allowing the publish to go through. Once published, the current frontend code deploys to Live, which should resolve the Aaron Wiggins / frozen UI issue.

---

### Technical Details

The migration will be created as a single SQL file containing all `CREATE OR REPLACE` statements. The view definitions are taken directly from the Live database to ensure exact parity. No frontend code changes are needed -- the preview version already works correctly.

