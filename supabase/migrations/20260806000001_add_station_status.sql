-- Migration: Live status for each physical station
-- Description: Stores the most recent heartbeat from each station agent, so the
-- dashboard can show which machines are online, locked, or in use.
--
-- Why HTTP heartbeats rather than MQTT: the agents already publish status over
-- MQTT, but reading that needs a subscription held open permanently, and the
-- site runs serverless — functions are frozen between requests. Having the agent
-- POST its state as well means no always-on listener and no broker credentials
-- in the browser.
--
-- One row per station, overwritten on each heartbeat. History is not kept here;
-- station_unlock_log is the audit trail.

CREATE TABLE IF NOT EXISTS public.station_status (
  cafe_id UUID NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  station_name TEXT NOT NULL,

  -- 'locked' or 'unlocked', as reported by the agent itself — what the machine
  -- says it is doing, not what the backend last asked for. A mismatch between
  -- the two is worth noticing.
  status TEXT NOT NULL,

  -- Free text, not a foreign key: the agent echoes back whatever session id it
  -- was given, which during testing is not always a real booking.
  session_id TEXT,

  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (cafe_id, station_name)
);

CREATE INDEX IF NOT EXISTS idx_station_status_last_seen
  ON public.station_status (cafe_id, last_seen_at DESC);

-- No policies: reached only by the service role behind the API routes.
ALTER TABLE public.station_status ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.station_status IS
  'Latest heartbeat per station. A stale last_seen_at means the agent is not running — which on a cafe PC is worth investigating.';
