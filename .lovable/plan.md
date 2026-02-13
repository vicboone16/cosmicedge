# Fix: API Key Debugging + Venue Coordinates Population

## Issue 1: The Odds API 401 Errors

The API key is stored as the secret `THE_ODDS_API_KEY` and used correctly in this URL format:

```text
https://api.the-odds-api.com/v4/sports/{sport_key}/odds/?apiKey={KEY}&regions=us&markets=h2h,spreads,totals,team_totals,alternate_spreads,alternate_totals&oddsFormat=american
```

The 401 means The Odds API is rejecting the key value itself. Common causes:

- Extra whitespace or newline copied with the key
- Wrong key (e.g. from a different account or expired trial)
- Key not yet activated

**Action**: Re-enter the API key using the secret update tool, being careful to copy only the key with no extra spaces. Share the URL format above with Odds API support if the issue persists.

---

## Issue 2: Venue Coordinates Never Populated

The `stadiums` table has full data (name, latitude, longitude, team_abbr, league) for all teams. However, the `fetch-odds` edge function never looks up this table -- it only saves the venue name from the API response. All 1,272 games have `venue_lat = null` and `venue_lng = null`, which is why horary charts and astrocartography fail.

### Fix: Update `fetch-odds` to populate coordinates from `stadiums`

**File: `supabase/functions/fetch-odds/index.ts**`

After saving or updating each game (around line 606-634), add a lookup to the `stadiums` table by `home_abbr` and `league` to fill in:

- `venue` (from stadiums.name if not already set)
- `venue_lat` (from stadiums.latitude)
- `venue_lng` (from stadiums.longitude)

This is a simple addition to the game save loop:

```text
// After determining gameId, look up stadium coords
const { data: stadium } = await supabase
  .from("stadiums")
  .select("name, latitude, longitude")
  .eq("team_abbr", game.home_abbr)
  .eq("league", game.league)
  .maybeSingle();

if (stadium) {
  await supabase.from("games").update({
    venue: game.venue || stadium.name,
    venue_lat: stadium.latitude,
    venue_lng: stadium.longitude,
  }).eq("id", gameId);
}
```

### Also: Backfill existing games

Run a one-time SQL update to populate coordinates for all existing games that already have a matching home team in the stadiums table:

```sql
UPDATE games g
SET venue_lat = s.latitude,
    venue_lng = s.longitude,
    venue = COALESCE(g.venue, s.name)
FROM stadiums s
WHERE g.home_abbr = s.team_abbr
  AND g.league = s.league
  AND g.venue_lat IS NULL;
```

---

Also, when I'm creating a bet, the only options that I have are, um, for basketball, even there, even though there should be other options. And, uh, yeah, I only have basketball games, and I'm not able to pick the day either, and I'm also not able to do, like, a same game parlay, um, a multiple player prop parlay. Like, I wanna be able to do all of those options, uh, when I'm creating bets. And on the initial page, I'm not able to scroll up, so I'm only able to scroll in the bottom half of the screen, and I want the entire page to be able to scroll up. Three, three, uh, three, eh, three, eh, eh. And also for the games, once again, it's still displaying, um, eight fifty-eight AM, so it's not displaying, like, when the games are actually starting. It's, it's stating, um... I think, I don't even know what time that is.

&nbsp;

&nbsp;

## Summary


| Change                                   | File                                     |
| ---------------------------------------- | ---------------------------------------- |
| Re-enter THE_ODDS_API_KEY secret         | Secret management                        |
| Add stadium lookup to game save loop     | `supabase/functions/fetch-odds/index.ts` |
| Backfill existing games with coordinates | Database migration                       |
