

# Cosmic Edge — Implementation Plan

## Design Direction
Dark theme with professional sports analytics layout, accented with subtle cosmic/astrology visual elements (star field backgrounds, gradient glows, constellation-inspired lines). Clean data presentation with a premium feel.

## Phase 1: Foundation & Core Layout
- Set up Capacitor for native mobile wrapping
- Create the app shell with bottom tab navigation (Today Slate, Game Detail, Results, Settings)
- Build the **Today Slate** screen — a filterable list of today's games by league (NBA, NFL, MLB, etc.) with live odds display
- Implement dark cosmic theme with professional data cards
- Set up Supabase/Lovable Cloud backend with initial tables (games, odds_snapshots, players, bets, results)

## Phase 2: Odds Integration & Game Detail
- Integrate a live odds provider API (e.g., The Odds API) via edge functions
- Build the **Game Detail** screen with tabs: Team Bets | Player Props
- Display moneyline, spread, and total markets with line movement charts
- Show odds comparison across multiple books
- Store odds snapshots over time for line movement tracking

## Phase 3: Team Bets Mode — Scoring Engine
- Build the **Bet Card** screen with inputs (market selection, stake) and output display (Likelihood, Confidence, Volatility)
- Implement the base scoring model: blend of statistical probability + market implied probability
- Add the Asc/Desc assignment engine (Home=Asc, Favorite=Asc, etc.)
- Display Top Drivers, Top Risks, and Recommendation tags (Pass/Small/Normal/Aggressive)
- Build the **Explain** screen showing full breakdown of all score contributions

## Phase 4: Horary Astrology Engine
- Integrate an ephemeris library for planetary position calculations
- Build event chart generation at game start time (with toggle for question time)
- Compute horary significators: L1/L7, Moon condition, angularity, receptions, applying aspects, prohibitions, VOC, early/late degree flags
- Produce HoraryLean (Asc/Desc/NoCall), HoraryStrength (0–1), and explanation text
- Integrate horary results into the scoring model as a gate/modifier

## Phase 5: Player Props Mode
- Build the Player Props tab within Game Detail
- Input fields: player, line, opponent, expected minutes, injury designation, role notes
- Display projections, recent form, and matchup data
- Store and display natal chart data with data-quality rating (A/B/C)
- Compute transits at game time to natal chart key points
- Produce TransitBoost (-20 to +20) and AstroVolatility (0–1)

## Phase 6: Intel Notes & News Integration
- Build "Intel Notes" creation — user-entered notes attached to games/players with tags (injury rumor, minutes restriction, personal event, coach quote)
- Integrate injury/news feeds (RSS or API)
- Full audit log: capture what the model knew at prediction time

## Phase 7: Results & Calibration
- Build the **Results** screen with bet history
- Track hit rate by lane, league, and market type
- Calibration charts (predicted likelihood vs actual outcomes)
- Post-game result tracker for player props

## Phase 8: Settings & Configuration
- Configurable scoring weights (user can adjust stat vs market vs astro blend)
- Horary ruleset toggles (which traditional rules to apply)
- Astrology settings (house system, orb sizes)
- Odds provider configuration
- Responsible gambling disclaimers and resources
- User staking rubric configuration

## Phase 9: Location & Astrocartography (Advanced)
- Compute travel distance/time zone factors
- Astrocartography overlay for team/city or key roster at venue location
- Optional astrocartography for individual players at venue
- Integrate location factors into scoring model

