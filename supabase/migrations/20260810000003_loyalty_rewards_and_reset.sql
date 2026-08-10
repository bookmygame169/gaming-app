-- Migration: a rewards menu, and points that start from today
--
-- Two changes the owner asked for after seeing the first version.
--
-- 1. The scheme starts now. The original migration backfilled points from every
--    past completed booking so regulars would open the app to a real balance.
--    That put 11,522 points across 282 customers on the books for sessions that
--    were already paid for and already enjoyed — a liability bought with
--    nothing. Those rows go, and the backfill will not run again.
--
-- 2. Points buy things, not just money off. "50 points" means nothing to a
--    customer; "a free Coke" or "30 minutes free" is a reason to come back. The
--    café writes its own menu.

-- ---------------------------------------------------------------------------
-- Clear the backfill.
--
-- Deliberately narrow: only rows carrying the backfill's own note. Anything
-- genuinely earned since — a session, a manual adjustment, a redemption — is
-- left alone, so this stays correct even if it is run later than intended.
-- ---------------------------------------------------------------------------
DELETE FROM public.loyalty_ledger
WHERE reason = 'booking'
  AND note = 'Awarded for past visits when loyalty was switched on';

-- ---------------------------------------------------------------------------
-- The menu.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.loyalty_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  cafe_id UUID NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,

  -- What the customer reads: "Free Coke", "30 minutes free".
  name TEXT NOT NULL CHECK (LENGTH(TRIM(name)) > 0),
  description TEXT,

  points_cost INTEGER NOT NULL CHECK (points_cost > 0),

  -- free_minutes  — value is minutes of play
  -- free_item     — value is what the item costs the café, in rupees
  -- discount      — value is rupees off the bill
  --
  -- Stored as a kind plus a number rather than free text, so the owner's
  -- reports can tell "gave away 400 minutes" from "gave away Rs800 of stock".
  kind TEXT NOT NULL DEFAULT 'free_item'
    CHECK (kind IN ('free_minutes', 'free_item', 'discount')),

  value INTEGER NOT NULL DEFAULT 0 CHECK (value >= 0),

  -- Off rather than deleted, so a seasonal reward can come back without
  -- orphaning the redemptions that reference it.
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- The order the café wants them read in; cheapest-first is rarely the story
  -- they want to tell.
  sort_order INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loyalty_rewards_menu
  ON public.loyalty_rewards (cafe_id, sort_order, points_cost)
  WHERE is_active = true;

ALTER TABLE public.loyalty_rewards ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.loyalty_rewards IS
  'What points can be spent on at each cafe. Deactivate rather than delete: redemptions point back here.';

-- ---------------------------------------------------------------------------
-- Which reward a redemption was for.
--
-- Not a foreign key with a cascade: deleting a reward must not erase the record
-- of points already spent on it, or a balance would silently change.
-- ---------------------------------------------------------------------------
ALTER TABLE public.loyalty_ledger
  ADD COLUMN IF NOT EXISTS reward_id UUID;

COMMENT ON COLUMN public.loyalty_ledger.reward_id IS
  'The loyalty_rewards row this redemption was for, if any. Intentionally not a foreign key so history survives the reward being removed.';
