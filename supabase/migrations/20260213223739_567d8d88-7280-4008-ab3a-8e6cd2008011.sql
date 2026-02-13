
-- Add source column to games table
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'api';

-- Add source column to historical_odds table
ALTER TABLE public.historical_odds ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'api';

-- Create csv-imports storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('csv-imports', 'csv-imports', false)
ON CONFLICT (id) DO NOTHING;

-- RLS: authenticated users can upload to csv-imports
CREATE POLICY "Authenticated users can upload CSV imports"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'csv-imports' AND auth.uid() IS NOT NULL);

-- RLS: users can read their own uploads
CREATE POLICY "Users can read own CSV imports"
ON storage.objects FOR SELECT
USING (bucket_id = 'csv-imports' AND auth.uid() IS NOT NULL);

-- RLS: users can delete their own uploads
CREATE POLICY "Users can delete own CSV imports"
ON storage.objects FOR DELETE
USING (bucket_id = 'csv-imports' AND auth.uid() IS NOT NULL);
