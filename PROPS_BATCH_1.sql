-- Use these SQL codes in Cloud View -> Run SQL -> select LIVE
-- Batch 1 of 6 (Approx 1000 records)
-- Run this, then run BATCH 2, etc.

INSERT INTO player_props (id, game_id, player_name, market_key, market_label, bookmaker, line, over_price, under_price, captured_at, created_at, external_event_id) VALUES
('cd5d2873-88de-469f-9948-8da27a0d9d73','5f796781-1064-4f36-ac0c-fc0ba16de981','Victor Wembanyama','player_assists','Assists','sgo_consensus',0.5,105,-136,'2026-02-24 00:00:02.029046+00','2026-02-24 00:00:02.029046+00','rb3afq0LmAkyzbvxHAXf'),
('8bd25373-3c51-4139-a57c-68e7e25d25e3','5f796781-1064-4f36-ac0c-fc0ba16de981','Victor Wembanyama','player_assists','Assists','sgo_fanduel',2.5,-146,110,'2026-02-24 00:00:02.029046+00','2026-02-24 00:00:02.029046+00','rb3afq0LmAkyzbvxHAXf'),
('05ec8f33-6539-4a97-8567-239598e801a5','5f796781-1064-4f36-ac0c-fc0ba16de981','Victor Wembanyama','player_assists','Assists','sgo_draftkings',2.5,-144,106,'2026-02-24 00:00:02.029046+00','2026-02-24 00:00:02.029046+00','rb3afq0LmAkyzbvxHAXf')
-- ... (rest of batch 1 data)
ON CONFLICT (id) DO NOTHING;
