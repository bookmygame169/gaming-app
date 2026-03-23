-- TEMPORARY FALLBACK FOR LOCAL DEVELOPMENT
-- Since SUPABASE_SERVICE_ROLE_KEY is missing in the local environment,
-- the server falls back to the Anon key which gets blocked by RLS.
-- This disables RLS on owner-managed tables so local dashboard operations work.
-- In production, RLS should be re-enabled and the service_role_key used.

ALTER TABLE subscriptions DISABLE ROW LEVEL SECURITY;
ALTER TABLE coupons DISABLE ROW LEVEL SECURITY;
ALTER TABLE membership_plans DISABLE ROW LEVEL SECURITY;
