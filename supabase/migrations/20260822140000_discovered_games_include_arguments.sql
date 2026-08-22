-- Tell Game Pass titles apart from each other.
--
-- Every Store and Xbox game launches the same way: explorer.exe, with the
-- game's own shell:AppsFolder id as the argument. That is deliberate and it is
-- the good path - it needs no permissions, it does not care which drive the
-- game sits on, and the id is identical on every PC in the café, so one entry
-- works on all of them.
--
-- It does mean the path alone is not an identity. Keyed on exe_path, a café
-- with eight Game Pass games had eight rows collapse into one, and the whole
-- report failed the moment a single PC sent two of them in one batch. The
-- argument is what separates them, so the argument belongs in the key.
--
-- Empty string rather than NULL, because NULLs do not compare equal in a
-- unique index and PostgREST needs plain columns it can name as its conflict
-- target - a coalesce() expression is not something it can point at.

UPDATE public.station_discovered_games SET arguments = '' WHERE arguments IS NULL;

ALTER TABLE public.station_discovered_games ALTER COLUMN arguments SET DEFAULT '';
ALTER TABLE public.station_discovered_games ALTER COLUMN arguments SET NOT NULL;

DROP INDEX IF EXISTS idx_discovered_games_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_discovered_games_unique
  ON public.station_discovered_games (cafe_id, station_name, exe_path, arguments);
