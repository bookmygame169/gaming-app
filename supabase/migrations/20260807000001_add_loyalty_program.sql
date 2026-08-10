-- Migration: Loyalty points
-- Description: Customers earn points on completed sessions and redeem them
-- against future ones.
--
-- Two design notes:
--
-- 1. Balances are a ledger, not a column. Every change is a row, so a balance
--    can always be explained, a mistake can be corrected with an offsetting
--    entry rather than an edit, and two awards landing at once cannot overwrite
--    each other.
--
-- 2. Rows are keyed by phone number, not account id. Most customers are
--    walk-ins who never sign in, and their bookings carry only a phone. The
--    same phone is written many ways ("9876543210", "+91 98765 43210"), so the
--    last ten digits are stored and matched.

CREATE TABLE IF NOT EXISTS public.loyalty_settings (
  cafe_id UUID PRIMARY KEY REFERENCES public.cafes(id) ON DELETE CASCADE,

  -- Off until an owner turns it on, so nothing starts accruing a liability
  -- behind their back.
  enabled BOOLEAN NOT NULL DEFAULT false,

  -- Points earned per 100 rupees spent.
  points_per_hundred INTEGER NOT NULL DEFAULT 5 CHECK (points_per_hundred >= 0),

  -- What a point is worth in rupees when redeemed.
  rupees_per_point NUMERIC NOT NULL DEFAULT 1 CHECK (rupees_per_point >= 0),

  -- Stops a balance being spent in trivial amounts.
  min_redeem_points INTEGER NOT NULL DEFAULT 50 CHECK (min_redeem_points >= 0),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.loyalty_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  cafe_id UUID NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,

  -- Last ten digits only. See the note above.
  customer_phone TEXT NOT NULL,

  -- Filled in when the customer has an account, so their history survives a
  -- phone number change. Not required, because most do not.
  user_id UUID,

  -- Positive earns, negative redeems. A single signed column means the balance
  -- is one SUM, and a correction is just another row.
  points INTEGER NOT NULL,

  reason TEXT NOT NULL CHECK (reason IN ('booking', 'redeemed', 'manual', 'bonus', 'expired')),

  -- Not a foreign key: a booking deleted later must not take the points it
  -- granted with it, or a balance would silently drop.
  booking_id UUID,

  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_balance
  ON public.loyalty_ledger (cafe_id, customer_phone);

CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_recent
  ON public.loyalty_ledger (cafe_id, created_at DESC);

-- Awarding twice for the same booking is the obvious failure here - a retry, a
-- double status change - so the database refuses it outright rather than
-- relying on every caller to check first.
CREATE UNIQUE INDEX IF NOT EXISTS idx_loyalty_ledger_one_award_per_booking
  ON public.loyalty_ledger (booking_id)
  WHERE reason = 'booking' AND booking_id IS NOT NULL;

-- Reached only through the API routes on the service role. A customer must not
-- be able to write their own points.
ALTER TABLE public.loyalty_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_ledger ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.loyalty_ledger IS
  'Append-only points history. Balance is SUM(points) per cafe_id + customer_phone. Never edit a row; add an offsetting one.';

-- ---------------------------------------------------------------------------
-- No backfill.
--
-- This migration originally awarded points for every past completed booking,
-- so that regulars would open the app to a balance rather than a zero. In
-- practice that wrote 11,522 points across 282 customers for sessions already
-- paid for and already enjoyed — the cafe took on the liability and got nothing
-- back for it, because the visits had already happened.
--
-- Points start from the day the scheme is switched on. The rows that migration
-- created are removed by 20260810000003_loyalty_rewards_and_reset.sql.
-- ---------------------------------------------------------------------------
