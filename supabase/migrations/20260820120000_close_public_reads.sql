-- Phase 2: the browser stops reading these tables.
--
-- The owner dashboard and the admin console now fetch through
-- /api/owner/lookup and /api/admin/lookup, which read the cookie those
-- consoles actually sign in with. Their queries run on the service role, so
-- nothing below affects them.
--
-- The customer pages are unaffected for a different reason: they hold a real
-- Supabase session, so "Users can view own bookings" already describes exactly
-- what they may see. Dropping the wide-open policies does not narrow them, it
-- stops everyone ELSE seeing the same rows.
--
-- Two policies per table, not one: temp_public_read_pending_api_migration was
-- added when writes were closed, and anon_read_* pre-dates all of this. Both
-- are USING (true), so leaving either behind would leave the table open.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['bookings','booking_items','booking_orders','subscriptions',
                           'station_pricing','membership_plans','coupons','inventory_items']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS temp_public_read_pending_api_migration ON public.%I', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "anon_read_bookings"      ON public.bookings;
DROP POLICY IF EXISTS "anon_read_booking_items" ON public.booking_items;

-- station_pricing keeps a deliberate public read: the storefront quotes prices
-- to people who have not signed in, and there is nothing personal in it.
DROP POLICY IF EXISTS "Allow public read access to station pricing" ON public.station_pricing;
CREATE POLICY public_read_station_pricing ON public.station_pricing
  FOR SELECT USING (true);

COMMENT ON POLICY public_read_station_pricing ON public.station_pricing IS
  'Prices are public by intent - the storefront quotes them before anyone signs in. No personal data here.';
