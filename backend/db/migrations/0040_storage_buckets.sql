-- 0040_storage_buckets.sql
-- Create the two storage buckets: raw-data (yfinance CSVs) and run-artifacts
-- (manifest, equity curves). See data-model.md §Storage Buckets.
--
-- Both buckets use path-prefix RLS: first path segment must equal auth.uid().

INSERT INTO storage.buckets (id, name, public)
VALUES ('raw-data', 'raw-data', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('run-artifacts', 'run-artifacts', false)
ON CONFLICT (id) DO NOTHING;

-- Policies for raw-data
DROP POLICY IF EXISTS "raw-data own-user RW" ON storage.objects;
CREATE POLICY "raw-data own-user RW" ON storage.objects
    FOR ALL
    TO authenticated
    USING (
        bucket_id = 'raw-data'
        AND (storage.foldername(name))[1] = auth.uid()::text
    )
    WITH CHECK (
        bucket_id = 'raw-data'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

DROP POLICY IF EXISTS "raw-data service_role RW" ON storage.objects;
CREATE POLICY "raw-data service_role RW" ON storage.objects
    FOR ALL
    TO service_role
    USING (bucket_id = 'raw-data')
    WITH CHECK (bucket_id = 'raw-data');

-- Policies for run-artifacts
DROP POLICY IF EXISTS "run-artifacts own-user RW" ON storage.objects;
CREATE POLICY "run-artifacts own-user RW" ON storage.objects
    FOR ALL
    TO authenticated
    USING (
        bucket_id = 'run-artifacts'
        AND (storage.foldername(name))[1] = auth.uid()::text
    )
    WITH CHECK (
        bucket_id = 'run-artifacts'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

DROP POLICY IF EXISTS "run-artifacts service_role RW" ON storage.objects;
CREATE POLICY "run-artifacts service_role RW" ON storage.objects
    FOR ALL
    TO service_role
    USING (bucket_id = 'run-artifacts')
    WITH CHECK (bucket_id = 'run-artifacts');
