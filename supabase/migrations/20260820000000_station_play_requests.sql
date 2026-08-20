-- Migration: paying for a session from the locked PC itself
--
-- Until now a session could only be started by someone at the counter, or by a
-- customer with a phone, an account and a working data connection scanning the
-- QR. A customer sitting at a locked machine with cash in their pocket had one
-- option: get up and find staff.
--
-- This is the third way in. The lock screen asks for a name, a number and what
-- they want to buy, and puts the request in front of the owner. Nothing about
-- the machine changes until the owner approves it, which is the same gate the
-- other two routes already pass through - a request is not a payment, and this
-- table never pretends otherwise.
--
-- Deliberately its own table rather than a 'pending' booking. A booking that
-- exists before anyone agreed to it shows up in occupancy, in reports and in
-- the dashboard's own idea of which stations are busy, and every one of those
-- would be wrong for as long as the request sat unanswered. The booking is
-- written on approval, by which point it is true.

CREATE TABLE IF NOT EXISTS public.station_play_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  cafe_id UUID NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,

  -- Lower case, matching the MQTT topic and station_pricing.station_name.
  station_name TEXT NOT NULL,

  -- Typed by the customer on the lock screen. This is the only identity we
  -- have: there is no account and no login on a café PC, and requiring one
  -- would defeat the point of the feature.
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,

  request_type TEXT NOT NULL
    CHECK (request_type IN ('hourly', 'membership', 'day_pass')),

  -- Hourly only: how long they asked for.
  duration_minutes INTEGER
    CHECK (duration_minutes IS NULL OR duration_minutes > 0),

  -- Membership and day pass only: which plan they picked.
  membership_plan_id UUID REFERENCES public.membership_plans(id) ON DELETE SET NULL,

  -- Copied from the price list at request time, never sent up from the PC.
  -- A customer naming their own price is the same hole whichever screen they
  -- are sitting at.
  amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),

  payment_method TEXT NOT NULL CHECK (payment_method IN ('online', 'counter')),

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'cancelled')),

  -- What approval produced. Null until then, and null forever for a request
  -- that was refused.
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,

  -- How long the station was actually unlocked for.
  --
  -- Not the same as duration_minutes even for an hourly request, because the
  -- owner can change it before approving. For a membership or a day pass there
  -- is no requested duration at all: the customer plays until they end the
  -- session, and this is only the backstop that re-locks a machine somebody
  -- walked away from.
  approved_minutes INTEGER CHECK (approved_minutes IS NULL OR approved_minutes > 0),

  decided_by UUID,
  decided_at TIMESTAMPTZ,
  decline_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- An hourly request carries a duration and no plan; the other two carry a
  -- plan and no duration. Without this a malformed row reaches the approval
  -- code, which would then have to guess what the customer wanted.
  CONSTRAINT station_play_request_shape CHECK (
    (request_type = 'hourly'
      AND duration_minutes IS NOT NULL
      AND membership_plan_id IS NULL)
    OR
    (request_type <> 'hourly'
      AND membership_plan_id IS NOT NULL)
  )
);

-- One unanswered request per station.
--
-- Without this, a customer tapping Pay Now twice - or getting bored and
-- starting again - puts two rows in front of the owner for one seat, and
-- approving both would take the money twice.
CREATE UNIQUE INDEX IF NOT EXISTS idx_play_requests_one_pending_per_station
  ON public.station_play_requests (cafe_id, station_name)
  WHERE status = 'pending';

-- Serves the owner's queue: what still needs answering, newest first.
CREATE INDEX IF NOT EXISTS idx_play_requests_pending
  ON public.station_play_requests (cafe_id, created_at DESC)
  WHERE status = 'pending';

-- Serves the agent polling for its own request's outcome.
CREATE INDEX IF NOT EXISTS idx_play_requests_station
  ON public.station_play_requests (cafe_id, station_name, created_at DESC);

-- Reached only through the API routes on the service role. The agent's routes
-- authenticate with the station heartbeat token and check the station belongs
-- to the café; the owner's check the café belongs to the owner.
ALTER TABLE public.station_play_requests ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.station_play_requests IS
  'A customer at a locked PC asking to buy time. Not a booking and not a payment - only an owner approving it unlocks anything.';

COMMENT ON COLUMN public.station_play_requests.approved_minutes IS
  'Minutes the station was unlocked for. For membership and day pass this is only the backstop that re-locks a machine nobody ended the session on.';
