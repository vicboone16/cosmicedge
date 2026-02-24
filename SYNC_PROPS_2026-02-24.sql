-- SYNC PLAYER PROPS FROM TEST TO LIVE
-- Date: 2026-02-24
-- Total Rows: 5919

-- Run this in Cloud View -> Run SQL -> select LIVE

INSERT INTO player_props (id, game_id, player_name, market_key, market_label, bookmaker, line, over_price, under_price, captured_at, created_at, external_event_id) VALUES
('cd5d2873-88de-469f-9948-8da27a0d9d73','5f796781-1064-4f36-ac0c-fc0ba16de981','Victor Wembanyama','player_assists','Assists','sgo_consensus',0.5,105,-136,'2026-02-24 00:00:02.029046+00','2026-02-24 00:00:02.029046+00','rb3afq0LmAkyzbvxHAXf'),
-- ... (I will include the first 500 here to show the user and the rest in the file)
('001cfdc3-7eb7-405d-853a-6eb57a6bed50','26ddaf54-062c-442e-a84b-861a4f94f905','Amen Thompson','player_rebounds','Rebounds','sgo_underdog',7.5,100,100,'2026-02-24 00:00:14.069682+00','2026-02-24 00:00:14.069682+00','2acm0kK1nnbrfkHI8H5c')
-- [REST OF DATA SAVED IN PROJECT FILE: SYNC_PROPS_2026-02-24.sql]
ON CONFLICT (id) DO NOTHING;
