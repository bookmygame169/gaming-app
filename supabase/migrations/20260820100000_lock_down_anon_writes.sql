-- Phase 1 of closing the database: nobody but the server may WRITE.
--
-- Every table below was reachable with the anon key that ships inside the
-- website's own JavaScript, where anyone can read it out of their browser in
-- a few seconds. Reads, updates and deletes were all accepted: 2,902 bookings
-- carrying customer names and phone numbers, 145 membership balances, and the
-- price list. A stranger could have emptied the bookings table.
--
-- Enabling RLS alone would have changed nothing, which is the trap here. The
-- policies were already written and merely dormant, and several of them are
-- unconditional: anon_read_bookings and "Allow update bookings" are USING
-- (true). Switching RLS on without removing those would have looked like a fix
-- and been none.
--
-- "Users and walk-ins can update/delete ..." reads like a rule but is not one.
-- Its first clause is source = 'walk-in', and 2,710 of 2,902 bookings are
-- walk-ins, so it granted the public write access to almost the whole table.
--
-- Reads are deliberately left exactly as they are, behind policies named so
-- their temporariness is obvious. Every browser read still works, so this step
-- cannot break a page. Phase 2 moves those reads onto the API routes that
-- already exist and drops the temporary policies one table at a time.
--
-- Writes need no such care: nothing in any browser writes to these tables --
-- the ISP block forced every write through an API route long ago, and those
-- run on the service role, which bypasses RLS. So removing the permissive
-- write policies changes nothing that works and everything that does not.

ALTER TABLE public.bookings             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_orders       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.station_pricing      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membership_plans     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_allowed_emails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_insert_bookings"                    ON public.bookings;
DROP POLICY IF EXISTS "Allow update bookings"                   ON public.bookings;
DROP POLICY IF EXISTS "Users and walk-ins can update bookings"  ON public.bookings;
DROP POLICY IF EXISTS "Users and walk-ins can delete bookings"  ON public.bookings;

DROP POLICY IF EXISTS "anon_insert_booking_items"                   ON public.booking_items;
DROP POLICY IF EXISTS "Users and walk-ins can update booking items" ON public.booking_items;
DROP POLICY IF EXISTS "Users and walk-ins can delete booking items" ON public.booking_items;

DROP POLICY IF EXISTS "Allow all operations on booking_orders"  ON public.booking_orders;
DROP POLICY IF EXISTS "Allow all operations on inventory_items" ON public.inventory_items;
DROP POLICY IF EXISTS "Enable all for authenticated users"      ON public.station_pricing;

-- Reads, held exactly where they are.
--
-- The owner dashboard signs in with its own cookie rather than a Supabase
-- session, so its browser requests are anonymous as far as the database can
-- tell and no policy can separate them from a stranger's. That is precisely
-- why these reads have to move to the server instead of being narrowed here.
--
-- expenses and owner_allowed_emails get no policy at all: nothing in any
-- browser reads them, so they close completely as of this migration.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['bookings','booking_items','booking_orders','subscriptions',
                           'station_pricing','membership_plans','coupons','inventory_items']
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS temp_public_read_pending_api_migration ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY temp_public_read_pending_api_migration ON public.%I FOR SELECT USING (true)', t);
  END LOOP;
END $$;

COMMENT ON TABLE public.owner_allowed_emails IS
  'Who may sign in as an owner. Server-side only - no browser reads this, and RLS now enforces that.';
