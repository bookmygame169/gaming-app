-- Migration: Pairing codes for linking a PC to a café
-- Description: Lets an owner add a machine by downloading a generic installer
-- and typing a short code, instead of carrying credentials around on a USB
-- stick.
--
-- Why this exists: the alternative is baking broker credentials into the
-- installer, which makes every download a secret that cannot be hosted publicly,
-- cannot be shared between cafés, and has to be rebuilt whenever a password
-- changes. With a pairing code the installer carries nothing at all — the agent
-- exchanges the code for its settings on first run.
--
-- Codes are single-use and short-lived because redeeming one hands back the
-- broker credentials.

CREATE TABLE IF NOT EXISTS public.station_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  cafe_id UUID NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,

  -- Which station the machine redeeming this code becomes.
  station_name TEXT NOT NULL,

  -- Short and typed by hand on a machine that has no keyboard shortcuts and
  -- possibly no mouse yet, so it avoids characters people confuse: no O/0, no
  -- I/1.
  code TEXT NOT NULL UNIQUE,

  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Short window: an unused code lying around is a way to obtain the café's
  -- broker credentials.
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '2 hours'),

  -- Set when redeemed. Single-use, so a code that leaks after installation is
  -- already spent.
  redeemed_at TIMESTAMPTZ,
  redeemed_machine TEXT
);

CREATE INDEX IF NOT EXISTS idx_station_enrollments_cafe
  ON public.station_enrollments (cafe_id, created_at DESC);

-- Reached only by the service role behind the API routes. A code must never be
-- readable from a browser session other than the owner's own dashboard, which
-- goes through the server.
ALTER TABLE public.station_enrollments ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.station_enrollments IS
  'Single-use, short-lived codes that let a freshly installed agent fetch its own settings. Redeeming one returns broker credentials, so treat an unredeemed code as a secret.';
