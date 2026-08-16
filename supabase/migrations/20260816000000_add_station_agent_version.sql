-- Migration: record which build each station is running
--
-- The agent updates itself, but only while it is not running - stopping the
-- lock on a PC somebody is sitting at is worse than being a version behind. On
-- a machine that stays signed in all day that means it can sit on an old build
-- for a long time, which is correct and completely invisible.
--
-- The result was a reasonable question with no way to answer it: a new
-- installer had been published, the release said so, and there was no way to
-- tell whether any café PC had taken it. Every other explanation - a failed
-- build, a bad release, a broken updater - had to be ruled out by hand.
--
-- The station already reports in every thirty seconds. It may as well say what
-- it is.

ALTER TABLE public.station_status
  ADD COLUMN IF NOT EXISTS agent_version TEXT;

COMMENT ON COLUMN public.station_status.agent_version IS
  'Version of the lock agent this station last reported. Null means a build older than the one that started sending it.';
