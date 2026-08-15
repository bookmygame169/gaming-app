-- Migration: short-lived codes behind the QR on the lock screen
--
-- The lock screen shows a QR a customer scans to pay for and start a session.
-- What it must NOT contain is the station name. A QR encoding
-- /play/pc-01 is a permanent password to that machine: photograph it once,
-- or simply guess the URL, and you can unlock that PC from the next seat, from
-- home, or after you have left. The lock would be decorative.
--
-- So the QR carries a random token that means nothing on its own, is valid for
-- about a minute, and works once. Scanning it is then proof that the person is
-- in front of that screen at that moment, which is the only thing that makes
-- "unlock the machine I am sitting at" safe to offer.
--
-- The agent asks for a new one on a timer and redraws it. An unredeemed token
-- simply expires.

CREATE TABLE IF NOT EXISTS public.station_unlock_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id      UUID NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,

  -- Lower case, matching the MQTT topic the website publishes to.
  station_name TEXT NOT NULL,

  -- URL-safe random. Long enough that guessing is not a strategy: a minute of
  -- validity times any plausible request rate is nowhere near this space.
  token        TEXT NOT NULL UNIQUE,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL,

  -- Set when a customer redeems it. Present rather than deleting the row so a
  -- second scan of the same code can be told "already used" rather than
  -- "invalid", and so a disputed session can be traced back.
  redeemed_at  TIMESTAMPTZ,
  redeemed_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  booking_id   UUID
);

-- The only lookup that happens on the customer's path, so it wants an index.
CREATE INDEX IF NOT EXISTS station_unlock_tokens_token_idx
  ON public.station_unlock_tokens (token);

-- For clearing out old rows, and for showing a station's recent activity.
CREATE INDEX IF NOT EXISTS station_unlock_tokens_station_idx
  ON public.station_unlock_tokens (cafe_id, station_name, created_at DESC);

COMMENT ON TABLE public.station_unlock_tokens IS
  'Single-use, short-lived codes shown as a QR on a station lock screen. Scanning one proves the customer is physically at that machine.';

-- ---------------------------------------------------------------------------
-- Redeeming, as one step
-- ---------------------------------------------------------------------------
--
-- Checking "is this token unused?" and then marking it used is two statements,
-- and between them a second request can pass the same check. On this table that
-- means two customers - or one customer scanning twice - both getting a session
-- for one payment.
--
-- Doing it as a single UPDATE ... WHERE redeemed_at IS NULL makes the database
-- settle it: exactly one caller gets a row back, everyone else gets nothing.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_unlock_token(
  p_token   TEXT,
  p_user_id UUID
)
RETURNS TABLE (cafe_id UUID, station_name TEXT, token_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.station_unlock_tokens AS t
  SET redeemed_at = NOW(),
      redeemed_by = p_user_id
  WHERE t.token = p_token
    AND t.redeemed_at IS NULL
    AND t.expires_at > NOW()
  RETURNING t.cafe_id, t.station_name, t.id;
END;
$$;

COMMENT ON FUNCTION public.claim_unlock_token IS
  'Marks a token used and returns its station, or returns nothing if it was already used, expired or unknown. One statement, so two simultaneous scans cannot both win.';

-- ---------------------------------------------------------------------------
-- Housekeeping
-- ---------------------------------------------------------------------------
-- A station asks for a token every minute it sits locked, so these accumulate
-- at roughly 1,400 rows per machine per day. Nothing reads one older than a
-- couple of minutes.
CREATE OR REPLACE FUNCTION public.purge_expired_unlock_tokens()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  removed INTEGER;
BEGIN
  -- Redeemed ones are kept much longer: they are the audit trail for a session
  -- somebody paid for.
  DELETE FROM public.station_unlock_tokens
  WHERE (redeemed_at IS NULL AND expires_at < NOW() - INTERVAL '1 hour')
     OR (redeemed_at IS NOT NULL AND redeemed_at < NOW() - INTERVAL '90 days');

  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$;

ALTER TABLE public.station_unlock_tokens ENABLE ROW LEVEL SECURITY;

-- No policies on purpose. Every path that touches this table goes through a
-- Next.js route using the service role: the agent asking for a token, and the
-- customer redeeming one. A browser has no business reading it - the whole
-- point of the token is that only the person looking at the screen has it.
