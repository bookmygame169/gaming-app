-- Which physical machine a customer paid for, as a column rather than as text
-- inside a label.
--
-- booking_items.title holds "60|pc-01,pc-02" — the duration and the assigned
-- stations packed into one string, split on a delimiter that nothing escapes.
-- That string is the canonical record of which PC to unlock: syncStationsForBooking
-- parses it back out before publishing to the broker.
--
-- Consequences of leaving it there:
--   * no foreign key, so a station can be assigned that does not exist
--   * "which bookings used pc-01?" is a full scan and a string parse
--   * editing a label, which reads like a display change, silently repoints
--     hardware
--
-- Added alongside the title rather than replacing it. Code reaches production
-- the moment it is pushed and this migration runs whenever someone runs it, so
-- everything reads the column when present and falls back to parsing the title
-- when it is not. The title keeps working as a label either way.

ALTER TABLE public.booking_items
  ADD COLUMN IF NOT EXISTS station_names TEXT[];

-- Backfill from the existing format: everything after the first "|", split on
-- commas, trimmed, blanks dropped. Rows whose title carries no assignment are
-- left NULL rather than set to an empty array, so "never assigned" stays
-- distinguishable from "assigned nothing".
UPDATE public.booking_items
SET station_names = (
  SELECT ARRAY(
    SELECT btrim(part)
    FROM unnest(string_to_array(split_part(title, '|', 2), ',')) AS part
    WHERE btrim(part) <> ''
  )
)
WHERE station_names IS NULL
  AND title LIKE '%|%'
  AND btrim(split_part(title, '|', 2)) <> '';

-- The lookup the parse could never support: every booking on a given machine.
CREATE INDEX IF NOT EXISTS booking_items_station_names_idx
  ON public.booking_items USING GIN (station_names);

COMMENT ON COLUMN public.booking_items.station_names IS
  'Stations assigned to this item. Authoritative; title is display only.';

-- Kept in step by the database, not by the application.
--
-- The alternative was writing both fields from every insert path. That puts a
-- reference to a brand-new column on the booking-creation path, and if the code
-- reaches production before this migration is run, every booking fails. That
-- exact ordering has already broken this system once, when an agent_version
-- write took all three stations offline for hours.
--
-- A trigger has neither problem: it exists only once the column does, it keeps
-- rows written by older deployments correct, and the application carries on
-- writing the title it always wrote.
CREATE OR REPLACE FUNCTION public.booking_items_sync_station_names()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- An explicit assignment wins. Only derive when the caller said nothing,
  -- so this can never overwrite a value written on purpose.
  IF NEW.station_names IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.title IS NULL OR position('|' in NEW.title) = 0 THEN
    RETURN NEW;
  END IF;

  NEW.station_names := (
    SELECT ARRAY(
      SELECT btrim(part)
      FROM unnest(string_to_array(split_part(NEW.title, '|', 2), ',')) AS part
      WHERE btrim(part) <> ''
    )
  );

  IF array_length(NEW.station_names, 1) IS NULL THEN
    NEW.station_names := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_booking_items_station_names ON public.booking_items;
CREATE TRIGGER trg_booking_items_station_names
  BEFORE INSERT OR UPDATE OF title, station_names ON public.booking_items
  FOR EACH ROW
  EXECUTE FUNCTION public.booking_items_sync_station_names();

-- A note on what is stored here.
--
-- Values go in as written: this column holds 'PS5-01' where the title said
-- 'PS5-01', and 'racing sim-01' where the title said that. Canonicalising in
-- SQL would mean duplicating the console-type alias table that lives in
-- TypeScript, and two copies of that rule would drift.
--
-- Correctness does not depend on it. Both readers — the column and the title
-- fallback — pass every value through normaliseStationName() and drop what does
-- not resolve, so 'PS5-01' and 'ps5-01' arrive as the same station and a label
-- like '3 Consoles', which is a description that got packed in as though it
-- were a station name, resolves to nothing either way.
--
-- The index is therefore a coarse filter. A query looking for one station
-- should normalise the name it is searching for first.
