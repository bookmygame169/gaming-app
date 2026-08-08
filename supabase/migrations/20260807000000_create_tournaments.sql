-- Migration: Tournaments and their registrations
-- Description: Creates the tables the tournament feature has always assumed.
--
-- The pages, the API routes and the capacity RPC were all written and shipped
-- against these tables, but they were never created — so /tournaments returned
-- 500 on every visit and the homepage fired a failing request on every load.
-- This is the missing half.
--
-- Column names and types follow exactly what the existing code reads and writes.

CREATE TABLE IF NOT EXISTS public.tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Nullable: a tournament can span cafes or be run by the platform rather than
  -- one venue. Deleting a cafe should not delete a completed tournament's
  -- history, hence SET NULL rather than CASCADE.
  cafe_id UUID REFERENCES public.cafes(id) ON DELETE SET NULL,

  name TEXT NOT NULL,
  game TEXT NOT NULL,
  description TEXT,
  rules TEXT,

  -- Presentation only: an emoji and an accent colour the cards use.
  icon TEXT,
  color TEXT,

  status TEXT NOT NULL DEFAULT 'upcoming'
    CHECK (status IN ('upcoming', 'ongoing', 'completed', 'cancelled')),

  -- Date and time are separate because they are entered separately and shown
  -- separately, and the time is a local wall-clock value rather than an instant.
  tournament_date DATE NOT NULL,
  tournament_time TEXT NOT NULL,

  location TEXT,

  prize_amount NUMERIC DEFAULT 0,
  prize_currency TEXT DEFAULT '₹',

  registration_fee NUMERIC DEFAULT 0,
  registration_deadline TIMESTAMPTZ,

  max_participants INTEGER,

  -- Maintained by increment_tournament_participants, never written directly, so
  -- two people registering at once cannot both read the same stale count.
  current_participants INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tournaments_status_date
  ON public.tournaments (status, tournament_date);

CREATE INDEX IF NOT EXISTS idx_tournaments_cafe
  ON public.tournaments (cafe_id, tournament_date DESC);

CREATE TABLE IF NOT EXISTS public.tournament_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,

  player_name TEXT NOT NULL,
  player_email TEXT NOT NULL,
  player_phone TEXT,
  team_name TEXT,

  registration_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (registration_status IN ('pending', 'confirmed', 'cancelled')),

  -- Free tournaments confirm immediately; paid ones wait for the money.
  payment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'paid', 'refunded')),
  payment_amount NUMERIC DEFAULT 0,

  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,

  -- Enforced rather than only checked in code: the API looks for an existing
  -- registration first, but two requests arriving together would both pass that
  -- check and both insert.
  UNIQUE (tournament_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tournament_registrations_tournament
  ON public.tournament_registrations (tournament_id);

CREATE INDEX IF NOT EXISTS idx_tournament_registrations_user
  ON public.tournament_registrations (user_id, registered_at DESC);

-- Tournaments are a public listing, so anyone may read them. Everything else
-- goes through the API routes on the service role, which bypasses RLS.
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view tournaments" ON public.tournaments;
CREATE POLICY "Anyone can view tournaments"
  ON public.tournaments FOR SELECT
  USING (true);

-- Registrations are not public: they carry names, emails and phone numbers.
-- No policies at all, so only the service role behind the API can reach them.
ALTER TABLE public.tournament_registrations ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.tournaments IS
  'Tournaments shown on /tournaments. current_participants is maintained by increment_tournament_participants, not written directly.';

COMMENT ON TABLE public.tournament_registrations IS
  'Who signed up for what. Holds personal contact details, so it is readable only through the API.';
