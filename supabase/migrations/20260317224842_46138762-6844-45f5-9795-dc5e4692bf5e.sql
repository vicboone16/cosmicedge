-- Fix non-canonical abbreviations in standings table
UPDATE public.standings SET team_abbr = 'NYK' WHERE team_abbr = 'NY';
UPDATE public.standings SET team_abbr = 'GSW' WHERE team_abbr = 'GS';
UPDATE public.standings SET team_abbr = 'PHX' WHERE team_abbr = 'PHO';
UPDATE public.standings SET team_abbr = 'SAS' WHERE team_abbr = 'SA';
UPDATE public.standings SET team_abbr = 'NOP' WHERE team_abbr = 'NO';
UPDATE public.standings SET team_abbr = 'BKN' WHERE team_abbr = 'BRK';
UPDATE public.standings SET team_abbr = 'CHA' WHERE team_abbr = 'CHO';

-- Fix in games table too
UPDATE public.games SET home_abbr = 'NYK' WHERE home_abbr = 'NY';
UPDATE public.games SET away_abbr = 'NYK' WHERE away_abbr = 'NY';
UPDATE public.games SET home_abbr = 'GSW' WHERE home_abbr = 'GS';
UPDATE public.games SET away_abbr = 'GSW' WHERE away_abbr = 'GS';
UPDATE public.games SET home_abbr = 'PHX' WHERE home_abbr = 'PHO';
UPDATE public.games SET away_abbr = 'PHX' WHERE away_abbr = 'PHO';
UPDATE public.games SET home_abbr = 'SAS' WHERE home_abbr = 'SA';
UPDATE public.games SET away_abbr = 'SAS' WHERE away_abbr = 'SA';
UPDATE public.games SET home_abbr = 'NOP' WHERE home_abbr = 'NO';
UPDATE public.games SET away_abbr = 'NOP' WHERE away_abbr = 'NO';