
# Props + Nexus: Two Connected Hubs

## Overview
Keep **Props** as its own bottom nav tab AND add **Nexus** as a new tab. To avoid 7 cramped icons, **History** gets absorbed into Nexus (since Nexus is the deep research/historical data hub). Final bottom nav becomes:

**Slate | Celestial | Props | SkySpread | Nexus | Astra** (6 tabs)

## What Changes

### 1. Bottom Nav Update
- Replace **History** with **Nexus** (using a `Compass` or `Database` icon)
- Route: `/nexus`
- The existing `/historical` page content moves into a "History" tab inside Nexus

### 2. Props Page Enhancements
The existing Props page (`/props`) stays as-is with these additions:

**a) Player names become clickable links**
- Tapping a player name in the props table navigates to `/player/:id` (their Nexus profile)
- A back button on the player page returns to `/props`

**b) "Add to SkySpread" action on each prop row**
- A small `+` or crosshair icon on each row
- Tapping it opens the existing `CreateBetForm` / `PropBuilderDialog` pre-filled with that prop's data (player, market, line, odds)
- The bet is created in SkySpread automatically

**c) Team props sub-view**
- Add a toggle at the top: **Player Props | Team Props**
- Team Props shows game-level markets (spreads, totals, moneylines) from `odds_snapshots`
- Tapping a team name navigates to `/team/:league/:abbr` (Nexus team profile)

### 3. New Nexus Page (`/nexus`)
A tabbed hub with four sections:

**Tab: "Players"**
- Reuses the `EntitySearch` component for finding players
- Shows trending players (those with most prop activity)
- Tapping a player goes to `/player/:id`

**Tab: "Teams"**
- League filter pills (NBA, NHL, NFL, MLB)
- Grid of team cards with W/L record and last-5 results
- Tapping a team goes to `/team/:league/:abbr`

**Tab: "Trends"**
- Moves the existing `TrendsPage` content here
- Same filters, league toggle, hit-rate cards

**Tab: "History"**
- Moves the existing `HistoricalPage` content here
- Historical odds, past results, ATS/O-U records

### 4. Enhanced Player Profile (`/player/:id`)
Add new sections below existing content:
- **H2H vs Upcoming Opponent** -- stats from past games against that team
- **Situational Splits** -- Home vs Away averages
- **Archetype Comparison** -- players with similar stat profiles
- **Astro Overlay** -- transit modifiers if birth data available

### 5. Enhanced Team Profile (`/team/:league/:abbr`)
Add new sections:
- **L5 / L10 Performance Trends** -- computed from `team_game_stats`
- **H2H History** -- selectable opponent, past matchup results
- **ATS / O-U Record** -- from `historical_odds`
- **Astro Overlay** -- current transit influences

### 6. Cross-Navigation Flow

```text
Props Page                         Nexus Page
+------------------+               +------------------+
| Player Props     |               | Players | Teams  |
| [LeBron - PTS]---|--click------->| Player Profile   |
|   [+] Add to SS--|--tap--------->| SkySpread (bet)  |
|                  |               |                  |
| Team Props       |               | Trends | History |
| [LAL spread]-----|--click------->| Team Profile     |
+------------------+               +------------------+
```

- From Props: click player name -> Player profile in Nexus
- From Props: click team name -> Team profile in Nexus  
- From Props: click `+` icon -> Creates bet in SkySpread
- From Nexus profiles: "View Props" link -> back to Props filtered for that player/team

---

## Technical Details

### Files to Create
- `src/pages/NexusPage.tsx` -- Main hub with Players / Teams / Trends / History tabs

### Files to Modify
- `src/components/layout/BottomNav.tsx` -- Replace History with Nexus, keep Props
- `src/App.tsx` -- Add `/nexus` route, keep `/historical` as redirect to `/nexus`
- `src/pages/PlayerPropsPage.tsx` -- Make player names clickable, add "Add to SkySpread" button, add Team Props toggle
- `src/pages/PlayerPage.tsx` -- Add H2H, splits, archetype sections
- `src/pages/TeamPage.tsx` -- Add L5/L10, H2H history, ATS record sections

### No Database Changes Needed
All data already exists in the database:
- `player_game_stats` for H2H and splits
- `player_season_stats` for archetype comparison
- `historical_odds` + `games` for ATS/O-U records
- `odds_snapshots` for team-level props
- `standings` for team records
