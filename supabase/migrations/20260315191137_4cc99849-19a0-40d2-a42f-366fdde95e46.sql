
-- Fix MIN players incorrectly assigned to DAL
UPDATE public.players SET team = 'MIN' WHERE league = 'NBA' AND name IN (
  'Anthony Edwards', 'Ayo Dosunmu', 'Jaden McDaniels', 'Naz Reid',
  'Rudy Gobert', 'Julius Randle', 'Donte DiVincenzo', 'Ryan Nembhard',
  'AJ Johnson', 'Terrence Shannon Jr.', 'Jaylen Clark', 'Julian Phillips',
  'Rocco Zikarsky', 'Moussa Cisse', 'Skylar Mays'
) AND team = 'DAL';
