-- Fixes a real Supabase security advisor warning: "Clients can list all
-- files in this bucket" - a broad SELECT policy on storage.objects lets any
-- client (including unauthenticated ones) call the Storage list/query API
-- and enumerate every file ever uploaded to the bucket by every user.
--
-- The recaps bucket is already public (see 20260809120000_initial_schema.sql),
-- so fetching a known file by its public URL - the only thing this app
-- actually does, via getPublicUrl() - works with zero RLS policies at all.
-- The SELECT policy below was never needed for that; it only enabled
-- storage.list(), which this app never calls, so removing it changes
-- nothing the app does while closing the enumeration hole.
--
-- Safe to run more than once (DROP POLICY IF EXISTS).

drop policy if exists "Anyone can view recap files" on storage.objects;
