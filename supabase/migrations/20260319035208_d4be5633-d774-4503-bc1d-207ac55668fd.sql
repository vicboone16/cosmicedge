-- Normalize stale team abbreviations in players table
UPDATE players SET team = 'GSW' WHERE team = 'GS' AND league = 'NBA';
UPDATE players SET team = 'PHX' WHERE team = 'PHO' AND league = 'NBA';
UPDATE players SET team = 'NOP' WHERE team = 'NO' AND league = 'NBA';
UPDATE players SET team = 'SAS' WHERE team = 'SA' AND league = 'NBA';
-- Also fix any common NHL/NFL stale abbreviations
UPDATE players SET team = 'LAK' WHERE team = 'LA' AND league = 'NHL';
UPDATE players SET team = 'TBL' WHERE team = 'TB' AND league = 'NHL';
UPDATE players SET team = 'SJS' WHERE team = 'SJ' AND league = 'NHL';
UPDATE players SET team = 'NJD' WHERE team = 'NJ' AND league = 'NHL';
UPDATE players SET team = 'WSH' WHERE team = 'WAS' AND league = 'NHL';