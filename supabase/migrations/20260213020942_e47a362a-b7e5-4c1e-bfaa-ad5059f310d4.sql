-- Drop partial unique index and create a full unique constraint
DROP INDEX IF EXISTS games_external_id_unique;

-- First, ensure no NULL external_ids exist by giving them a generated value
UPDATE games SET external_id = 'legacy_' || id WHERE external_id IS NULL;

-- Create a proper unique constraint on external_id
ALTER TABLE games ADD CONSTRAINT games_external_id_key UNIQUE (external_id);
