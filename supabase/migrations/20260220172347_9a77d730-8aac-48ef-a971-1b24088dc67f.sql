
-- Fix csv-imports bucket policies to enforce ownership via folder structure

-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Users can read own CSV imports" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload CSV imports" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own CSV imports" ON storage.objects;

-- Recreate with ownership checks using folder structure: csv-imports/{user_id}/filename.csv
CREATE POLICY "Users can read own CSV imports"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'csv-imports'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can upload to own folder"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'csv-imports'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete own CSV imports"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'csv-imports'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
