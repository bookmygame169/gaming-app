-- Migration: remember what a scanned session was for, so it can start later
--
-- Paying by wallet finishes in one request: the money moves and the PC unlocks
-- before the customer's phone has finished animating. Paying by UPI cannot.
-- The money goes directly from their bank to the café's, and nothing tells this
-- app it arrived — the owner checks their own phone and says so. Minutes may
-- pass, and the request that took the payment is long gone by then.
--
-- So the session has to be written down while it waits. The token row already
-- knows which station and which booking; what it never needed to know, when
-- unlocking happened immediately, was how long the session was meant to be.

ALTER TABLE public.station_unlock_tokens
  ADD COLUMN IF NOT EXISTS duration_minutes INTEGER;

COMMENT ON COLUMN public.station_unlock_tokens.duration_minutes IS
  'Minutes the customer paid for. Kept so a UPI session can be started when the owner confirms the payment, long after the request that took it.';

-- Verifying a payment starts from a booking and needs its station. Without this
-- that is a scan of every token ever issued, and a station asks for one a minute
-- while it sits locked.
CREATE INDEX IF NOT EXISTS station_unlock_tokens_booking_idx
  ON public.station_unlock_tokens (booking_id)
  WHERE booking_id IS NOT NULL;
