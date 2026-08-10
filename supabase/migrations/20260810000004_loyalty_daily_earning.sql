-- Migration: points are earned per day, not per booking
--
-- The first rule was "N points per ₹100 spent", awarded on each completed
-- booking. That pays a customer five times for five short visits in one
-- afternoon, and pays nothing worth having for a single small session.
--
-- The rule the café actually wants: spend at least ₹300 across the day and earn
-- 5 points. Come back four more times the same day and it is still 5 points.
--
-- Two consequences shape this migration:
--
-- 1. The day is the unit, so the ledger records which day an award was for and
--    the database refuses a second award for the same customer on the same day.
--    A cap enforced by an index cannot be forgotten by a caller, and cannot be
--    lost to two tills ringing up at the same moment.
--
-- 2. The threshold is the day's total, not one booking's. Three ₹100 sessions
--    should count the same as one ₹300 session — the customer spent ₹300 either
--    way, and telling them otherwise makes the scheme feel arbitrary.

ALTER TABLE public.loyalty_settings
  -- What the customer has to spend across the day to earn anything.
  ADD COLUMN IF NOT EXISTS min_daily_spend INTEGER NOT NULL DEFAULT 300
    CHECK (min_daily_spend >= 0),

  -- What a qualifying day is worth. Flat, not per rupee: the whole point is
  -- that the fifth visit of the day earns the same as the first.
  ADD COLUMN IF NOT EXISTS points_per_day INTEGER NOT NULL DEFAULT 5
    CHECK (points_per_day >= 0);

COMMENT ON COLUMN public.loyalty_settings.min_daily_spend IS
  'Rupees a customer must spend across one day at this cafe before that day earns anything.';

COMMENT ON COLUMN public.loyalty_settings.points_per_day IS
  'Points a qualifying day is worth. Awarded once per customer per day, however many visits.';

-- points_per_hundred is left in place but no longer drives earning. Dropping a
-- column that an older deploy might still read is not worth the risk, and it
-- costs nothing to leave.
COMMENT ON COLUMN public.loyalty_settings.points_per_hundred IS
  'Superseded by min_daily_spend + points_per_day. No longer used for earning.';

-- ---------------------------------------------------------------------------
-- Which day an award was for.
--
-- The café's booking date, not the moment the row was written: a session booked
-- for Friday that gets marked complete on Saturday morning belongs to Friday.
-- ---------------------------------------------------------------------------
ALTER TABLE public.loyalty_ledger
  ADD COLUMN IF NOT EXISTS award_date DATE;

COMMENT ON COLUMN public.loyalty_ledger.award_date IS
  'The cafe-day this earning row is for. One booking award per customer per day.';

-- One award per customer per day. This is the cap, and it lives here rather
-- than in application code so no caller can skip it and no race can beat it.
CREATE UNIQUE INDEX IF NOT EXISTS idx_loyalty_ledger_one_award_per_day
  ON public.loyalty_ledger (cafe_id, customer_phone, award_date)
  WHERE reason = 'booking' AND award_date IS NOT NULL;

-- The old per-booking index stays. It is redundant under the daily rule but
-- harmless, and it still protects any historical row that has no award_date.
