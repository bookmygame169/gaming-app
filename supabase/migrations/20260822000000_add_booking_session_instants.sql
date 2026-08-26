-- Real session bounds, stored as timestamptz so lock/unlock does not re-parse
-- "6:00 PM" strings. booking_date / start_time stay for display; readers prefer
-- these columns when they exist.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_bookings_starts_at
  ON public.bookings (starts_at)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN public.bookings.starts_at IS
  'IST session start as an instant. Dual-read with booking_date + start_time.';
COMMENT ON COLUMN public.bookings.ends_at IS
  'IST session end as an instant. Dual-read with start + duration.';

-- Best-effort backfill. start_time is mixed: "6:00 PM" and "15:00".
-- Unparseable rows stay null; the app still dual-reads booking_date + start_time.
UPDATE public.bookings AS b
SET
  starts_at = s.starts_at,
  ends_at = s.starts_at + make_interval(mins => GREATEST(COALESCE(NULLIF(b.duration, 0), 60), 1))
FROM (
  SELECT
    id,
    (
      make_timestamp(
        split_part(booking_date::text, '-', 1)::int,
        split_part(booking_date::text, '-', 2)::int,
        split_part(booking_date::text, '-', 3)::int,
        hour24,
        minute,
        0
      ) AT TIME ZONE 'Asia/Kolkata'
    ) AS starts_at
  FROM (
    SELECT
      id,
      booking_date,
      CASE
        WHEN period = 'pm' AND hour BETWEEN 1 AND 11 THEN hour + 12
        WHEN period = 'am' AND hour = 12 THEN 0
        WHEN period IS NULL AND hour BETWEEN 0 AND 23 THEN hour
        WHEN period IN ('am', 'pm') AND hour BETWEEN 1 AND 12 THEN hour
        ELSE NULL
      END AS hour24,
      minute
    FROM (
      SELECT
        id,
        booking_date,
        (regexp_match(lower(btrim(start_time)), '^(\d{1,2}):(\d{2})'))[1]::int AS hour,
        (regexp_match(lower(btrim(start_time)), '^(\d{1,2}):(\d{2})'))[2]::int AS minute,
        (regexp_match(lower(btrim(start_time)), '\y(am|pm)\y'))[1] AS period
      FROM public.bookings
      WHERE starts_at IS NULL
        AND booking_date IS NOT NULL
        AND start_time IS NOT NULL
    ) raw
  ) norm
  WHERE hour24 IS NOT NULL
    AND minute BETWEEN 0 AND 59
) AS s
WHERE b.id = s.id;
