-- What each PC can see installed on itself, for the owner to choose from.
--
-- The agent has six scanners in it - Steam, Steam's common folders, the
-- registry, Xbox, Store apps, Epic - and all six are switched off. They were
-- disabled because their results went straight onto the customer's screen, and
-- what they turned up alongside the games was File Explorer, the NVIDIA panel,
-- Logitech's software and adware called PremierOpinion.
--
-- The scanners were never the problem. Showing their raw output to a paying
-- customer was. So they run again and report here instead, and nothing reaches
-- a lock screen until an owner has ticked it - which is also the only way a
-- game like Forza, installed through Xbox with no desktop shortcut, was ever
-- going to be findable without somebody typing a path by hand.

CREATE TABLE IF NOT EXISTS public.station_discovered_games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  cafe_id UUID NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  station_name TEXT NOT NULL,

  name TEXT NOT NULL,
  exe_path TEXT NOT NULL,
  arguments TEXT,
  process_name TEXT,

  -- Which scanner found it: steam, xbox, epic, registry, store, desktop.
  -- Shown to the owner, because "found in your Steam library" is a far better
  -- reason to trust a row than the row on its own.
  source TEXT NOT NULL,

  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Set when an owner has dealt with it, so a rejected row does not come back
  -- every time the scanner runs. Null means it is still waiting to be judged.
  decided_at TIMESTAMPTZ,
  decision TEXT CHECK (decision IS NULL OR decision IN ('added', 'ignored'))
);

-- One row per game per station. A scan every few hours must update what it
-- already reported rather than pile up duplicates.
--
-- Plain columns rather than lower(exe_path): the upsert names these three as
-- its conflict target, and a functional index does not satisfy that. Case
-- matters less than it looks - a given scanner reports a path the same way
-- every run, so the same game does not oscillate between spellings.
CREATE UNIQUE INDEX IF NOT EXISTS idx_discovered_games_unique
  ON public.station_discovered_games (cafe_id, station_name, exe_path);

-- Serves the owner's list: what is still waiting on a decision.
CREATE INDEX IF NOT EXISTS idx_discovered_games_pending
  ON public.station_discovered_games (cafe_id, last_seen_at DESC)
  WHERE decided_at IS NULL;

ALTER TABLE public.station_discovered_games ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.station_discovered_games IS
  'Games a station found installed on itself. Suggestions only - nothing here reaches a lock screen until an owner adds it to cafe_pc_games.';
