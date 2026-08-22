-- Asking for more time from the PC itself.
--
-- The same queue as a new session: it is the same owner looking at the same
-- dashboard deciding whether somebody has paid. What differs is what approval
-- does - a new session creates a booking and unlocks a machine, while this one
-- lengthens a booking that already exists and leaves the machine alone.
--
-- The booking is named when the request is made, not looked up when it is
-- answered. Between the two the customer may have finished and somebody else
-- may have sat down, and the wrong session growing by an hour is money in the
-- wrong place.

ALTER TABLE public.station_play_requests
  ADD COLUMN IF NOT EXISTS extends_booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL;

ALTER TABLE public.station_play_requests
  DROP CONSTRAINT IF EXISTS station_play_requests_request_type_check;

ALTER TABLE public.station_play_requests
  ADD CONSTRAINT station_play_requests_request_type_check
  CHECK (request_type = ANY (ARRAY['hourly'::text, 'membership'::text, 'day_pass'::text, 'extend'::text]));

-- An extension is shaped like an hourly session - a number of minutes, no
-- membership plan - and additionally must say which booking it lengthens.
ALTER TABLE public.station_play_requests
  DROP CONSTRAINT IF EXISTS station_play_request_shape;

ALTER TABLE public.station_play_requests
  ADD CONSTRAINT station_play_request_shape CHECK (
    (request_type = 'hourly' AND duration_minutes IS NOT NULL AND membership_plan_id IS NULL)
    OR (request_type = 'extend' AND duration_minutes IS NOT NULL AND membership_plan_id IS NULL
        AND extends_booking_id IS NOT NULL)
    OR (request_type NOT IN ('hourly', 'extend') AND membership_plan_id IS NOT NULL)
  );

COMMENT ON COLUMN public.station_play_requests.extends_booking_id IS
  'The live booking this request lengthens. Set when the customer asks, not when the owner answers.';
