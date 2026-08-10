-- Migration: café reviews
--
-- Someone deciding between two cafés they have never visited has nothing to go
-- on but photos the owner chose. Ratings are the cheapest way to make that
-- decision for them, and the only feature here that works better the more
-- customers there are.
--
-- Two rules shape the table:
--
-- 1. Only someone who actually played can review. The review points at the
--    booking it came from, and one booking can leave one review. Without that
--    anchor a café's rating is worth nothing the first time a competitor finds
--    the form.
--
-- 2. Ratings are stored, averages are not. A cached average on the cafés table
--    would be one more thing to keep in step with edits and deletions, and the
--    number of reviews per café is small enough to average on read.

CREATE TABLE IF NOT EXISTS public.cafe_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  cafe_id UUID NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,

  -- Which visit this is about. Not null: proof of play is the point.
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,

  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),

  -- Optional. Plenty of people will tap five stars and leave; that is still a
  -- useful signal and should not be blocked on writing prose.
  comment TEXT CHECK (comment IS NULL OR LENGTH(comment) <= 1000),

  -- The name shown next to the review, copied at write time. A review should
  -- not change its byline because someone later edited their profile, and it
  -- should survive the profile being deleted.
  display_name TEXT,

  -- Set by the owner. Kept on the review rather than in a separate table so a
  -- reply cannot outlive the thing it replies to.
  owner_reply TEXT CHECK (owner_reply IS NULL OR LENGTH(owner_reply) <= 1000),
  owner_replied_at TIMESTAMPTZ,

  -- Lets an owner get an abusive review off their page without deleting it,
  -- so there is still a record if it is disputed.
  is_hidden BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One review per visit. A customer with ten bookings can leave ten reviews;
-- nobody can leave ten for one session.
CREATE UNIQUE INDEX IF NOT EXISTS idx_cafe_reviews_one_per_booking
  ON public.cafe_reviews (booking_id);

-- Serves the café page: newest visible reviews for one café.
CREATE INDEX IF NOT EXISTS idx_cafe_reviews_cafe_recent
  ON public.cafe_reviews (cafe_id, created_at DESC)
  WHERE is_hidden = false;

-- Serves "have I already reviewed this?" on the customer's own bookings.
CREATE INDEX IF NOT EXISTS idx_cafe_reviews_user
  ON public.cafe_reviews (user_id, created_at DESC);

-- Reached only through the API routes on the service role, which check that
-- the booking belongs to the reviewer and that they actually turned up.
ALTER TABLE public.cafe_reviews ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.cafe_reviews IS
  'One review per completed booking. Averages are computed on read, never cached on cafes.';
