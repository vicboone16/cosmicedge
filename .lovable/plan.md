# Cosmic Edge: Major Feature Update Plan

## Overview

This plan covers 7 major workstreams: fetching participants, nav updates, CLV calculator with astro data, timezone-aware time display, horary chart analysis, game-time astro scrubber, and house rulership analysis.

---

## 1. Fetch Fresh Participants Data

Trigger the `fetch-participants` backend function to populate the players table with the updated API key.

**Steps:**

- Call the deployed `fetch-participants` function for each supported league (NBA, NHL, MLB)
- Verify data populates the `players` table

---

## 2. Add SkySpread Back to Bottom Nav

Currently the bottom nav has: Slate, Transits, Props, History, Live. SkySpread needs to be added.

**Steps:**

- Update `src/components/layout/BottomNav.tsx` to add a SkySpread entry (using the `Star` or `Crosshair` icon) linking to `/skyspread`
- Reorder to: Slate, Transits, Props, SkySpread, History, Live (6 items -- may need to shrink spacing or use a "More" menu for the 6th)
- Slate should have and keep its own page and that's where the live games should also live so it's a toggle feature or you can click a slate option and see the live game and player details and also live odds. (I will upload screenshots or a video to clarify)

---

## 3. CLV Calculator with Astrological Context

Build a CLV analysis feature that compares placed bets' odds against historical closing lines and overlays astrological data for those games.

**Steps:**

- Create a new `src/pages/CLVCalculatorPage.tsx` page
- Query user's `bets` table joined with `historical_odds` to compare bet odds vs closing line
- Calculate CLV percentage: `(closing_implied_prob - bet_implied_prob) / bet_implied_prob * 100`
- For each bet's game, fetch cached `astro_calculations` (transits for game date) and display:
  - Planetary hour at game time
  - Key transits active during the game
  - Element balance for game day
- Show aggregate CLV stats: total CLV, CLV by league, CLV by market type, CLV by planetary hour
- Add route `/clv` to `App.tsx`
- Link from SkySpread page and Historical Odds page

---

## 4. Timezone-Aware Game Times and Zodiac Hours

### 4a. User Timezone Preference in Settings

- Add a timezone selector to `SettingsPage.tsx` using `Intl.supportedValuesOf('timeZone')` for the dropdown
- Save to the `profiles.timezone` column (already exists)
- Default to `Intl.DateTimeFormat().resolvedOptions().timeZone` (browser auto-detect)

### 4b. Create a `useTimezone` Hook

- New hook `src/hooks/use-timezone.ts`
- Reads from user profile if logged in, falls back to browser timezone
- Exports a `formatInUserTZ(date, formatStr)` helper and `userTimezone` string

### 4c. Update Game Time Displays

- **GameCard**: Show game start time in user's timezone with a note like "ET" or "PT"
- **GameDetail**: Show game time in user TZ with timezone label
- **Index (Slate)**: All times converted to user TZ
- **TransitsPage**: Planetary hour calculations use game start time in user TZ

### 4d. Zodiac Hour of Game Start

- Calculate the actual planetary/zodiac hour based on game start time (not current time)
- The planetary hour system divides daylight and nighttime into 12 segments each, ruled by planets in Chaldean order (Saturn, Jupiter, Mars, Sun, Venus, Mercury, Moon)
- Display on GameCard and GameDetail alongside game start time
- Show the ruling planet symbol and name

---

## 5. Horary Chart Analysis

### 5a. Horary Chart Edge Function

- Add a new `mode=horary` to the existing `astrovisor` edge function
- Input: game start time, venue coordinates (lat/lng), and the question context (home vs away)
- Call AstroVisor API to compute a chart for that exact moment and location
- Extract and return: entire natal chart with aspects and table reflecting all placements (house, degree, sign, etc) Ascendant sign, Descendant sign, and rulers of all Houses for that specific chart 

### 5b. Horary Analysis Component

- New component `src/components/game/HoraryChartSection.tsx`
- Display on GameDetail page
- Shows:
  - **Ascendant (1st House)**: The querent / home team -- sign, degree, ruling planet
  - **Descendant (7th House)**: The opponent / away team -- sign, degree, ruling planet
  - **4th House (IC)**: End of the matter / final score
  - **10th House (MC)**: Outcome / public result
  - Lords/rulers of each house with dignity status
  - Moon's last and next aspects (applying aspects = future action)
- Traditional Frawley/Lilly rules interpretation:
  - Which team's significator is stronger by essential dignity
  - Is the Moon applying to a favorable aspect with either significator
  - Mutual reception, combustion, or debility indicators

---

## 6. Game-Time Astro Chart Scrubber

### 6a. Transit Timeline Component

- New component `src/components/game/TransitScrubber.tsx`
- A slider/scrubber that spans from 2 hours before to 4 hours after game start
- As user scrubs, it recalculates planetary positions for that moment
- Uses the AstroVisor API (or client-side approximation for speed) to show:
  - Current planetary positions at the scrubbed time
  - Which transits are exact or applying/separating
  - Highlight when key aspects perfect during the game window

### 6b. Implementation Approach

- Use a `Slider` component for the time scrubber
- For performance, pre-fetch transit data at key intervals (game start, every 15 minutes, +1h, +2h, +3h) and interpolate between
- Show planetary positions updating in real-time as slider moves
- Display a mini transit chart with planet positions in signs

### 6c. Integration

- Add to GameDetail page below the existing Celestial Insights section
- Include a "key moments" indicator showing when major aspects perfect

---

## 7. House Rulers for Game Chart (Favorite/Underdog & Home/Away)

### 7a. Game Chart Dignities Component

- New component `src/components/game/GameChartRulers.tsx`
- For each game, calculate who is the Ascendant (home team / favorite) and Descendant (away team / underdog)
- Display:
  - **1st House Lord**: Home team significator -- planet, sign, dignity
  - **7th House Lord**: Away team significator -- planet, sign, dignity
  - **4th House Lord**: End of matter
  - **10th House Lord**: Prize/outcome
- Color-code by dignity: Domicile (green), Exaltation (gold), Detriment (red), Fall (red)
- Include a simple verdict: "Home Lord in domicile vs Away Lord in detriment = strong home advantage"

### 7b. Favorite/Underdog Assignment

- Use moneyline odds to determine favorite (negative ML) vs underdog (positive ML)
- Map: Home team = 1st house, Away team = 7th house
- Note if the favorite is the away team (role reversal from traditional horary)

---

## Database Changes

### Migration: Add timezone default and CLV tracking

```sql
-- No new tables needed; profiles.timezone already exists
-- Ensure it has a sensible default
ALTER TABLE profiles ALTER COLUMN timezone SET DEFAULT 'America/New_York';
```

No other schema changes required -- all astro data is cached in the existing `astro_calculations` table and bets/historical_odds already have the fields needed for CLV.

---

## New Files


| File                                         | Purpose                                 |
| -------------------------------------------- | --------------------------------------- |
| `src/hooks/use-timezone.ts`                  | Timezone preference hook                |
| `src/pages/CLVCalculatorPage.tsx`            | CLV calculator page                     |
| `src/components/game/HoraryChartSection.tsx` | Horary chart analysis for game detail   |
| `src/components/game/TransitScrubber.tsx`    | Time scrubber for transit visualization |
| `src/components/game/GameChartRulers.tsx`    | House rulers display for game chart     |
| `src/lib/planetary-hours.ts`                 | Planetary hour calculation utilities    |
| `src/lib/horary-utils.ts`                    | Traditional horary interpretation logic |


## Modified Files


| File                                     | Change                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------ |
| `src/components/layout/BottomNav.tsx`    | Add SkySpread tab                                                              |
| `src/pages/SettingsPage.tsx`             | Add timezone selector                                                          |
| `src/pages/GameDetail.tsx`               | Add HoraryChartSection, TransitScrubber, GameChartRulers, timezone-aware times |
| `src/components/GameCard.tsx`            | Timezone-aware times, zodiac hour from game start                              |
| `src/pages/HistoricalOddsPage.tsx`       | Add astro context to historical games, link to CLV                             |
| `src/pages/TransitsPage.tsx`             | Use game start times for planetary hours                                       |
| `src/App.tsx`                            | Add CLV route                                                                  |
| `supabase/functions/astrovisor/index.ts` | Add `mode=horary` support                                                      |


---

## Implementation Order

1. Fetch participants (immediate API call)
2. Timezone hook + Settings page update
3. Bottom nav update (SkySpread)
4. Planetary hours utility + GameCard/GameDetail time fixes
5. Horary chart (edge function + component)
6. Game chart rulers component
7. Transit scrubber component
8. CLV calculator page
9. Historical odds page astro enrichment