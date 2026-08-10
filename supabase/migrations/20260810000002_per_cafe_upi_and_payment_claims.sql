-- Migration: each café collects its own money, and payments get checked
--
-- Two problems, one flow.
--
-- 1. The UPI id on the booking page was hardcoded to a single Paytm QR. Every
--    café's advance payments landed in the same account. With one café that is
--    merely wrong bookkeeping; with two it is taking someone else's money.
--
-- 2. Nothing recorded that a payment happened. A UPI deep link hands the
--    customer to their bank app and never reports back — there is no callback
--    to listen for without a payment gateway. So the app showed a Pay button,
--    the customer paid, and the booking sat exactly as before.
--
-- The honest fix for (2) is not to pretend the app can verify a payment. It
-- cannot. What it can do is capture the customer's claim, put it in front of
-- the owner next to the amount and the reference, and let one tap in the
-- dashboard turn a claim into a verified payment. The claim is never treated as
-- money: only the owner's confirmation moves the booking off 'pending', which
-- is the same gate that unlocks the machine.

-- ---------------------------------------------------------------------------
-- Where a café's money goes.
-- ---------------------------------------------------------------------------
ALTER TABLE public.cafes
  ADD COLUMN IF NOT EXISTS upi_id TEXT,
  ADD COLUMN IF NOT EXISTS upi_display_name TEXT;

COMMENT ON COLUMN public.cafes.upi_id IS
  'The cafe''s own UPI id (e.g. name@bank). Online payment is hidden until this is set - better no Pay button than one that pays the wrong cafe.';

COMMENT ON COLUMN public.cafes.upi_display_name IS
  'Name shown in the customer''s UPI app when paying. Should match the registered payee name so the customer recognises it.';

-- ---------------------------------------------------------------------------
-- Payment claims.
--
-- A row here says "the customer says they paid", not "the money arrived".
-- Those are different facts and conflating them is how a café gives away free
-- play. The status column keeps them apart.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.booking_payment_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,

  -- Denormalised so the owner's payments list is one query, and so a claim
  -- stays attributable if the booking is later moved.
  cafe_id UUID NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,

  -- What the customer says they sent, in rupees. Kept separate from the
  -- booking total: they should match, and a mismatch is exactly what the owner
  -- needs to see rather than have papered over.
  amount INTEGER NOT NULL CHECK (amount >= 0),

  -- The UPI reference / UTR the customer reads off their payment app. This is
  -- what the owner matches against their own statement.
  reference TEXT,

  status TEXT NOT NULL DEFAULT 'claimed'
    CHECK (status IN ('claimed', 'verified', 'rejected')),

  -- Who checked, and when. An owner disputing a session later needs to know
  -- which of them waved it through.
  verified_by UUID,
  verified_at TIMESTAMPTZ,
  note TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One open claim per booking. Without this a customer tapping "I've paid"
-- twice puts two rows in front of the owner for the same money.
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_claims_one_open_per_booking
  ON public.booking_payment_claims (booking_id)
  WHERE status = 'claimed';

-- Serves the owner's payments queue: what still needs checking, newest first.
CREATE INDEX IF NOT EXISTS idx_payment_claims_pending
  ON public.booking_payment_claims (cafe_id, created_at DESC)
  WHERE status = 'claimed';

CREATE INDEX IF NOT EXISTS idx_payment_claims_booking
  ON public.booking_payment_claims (booking_id);

-- Reached only through the API routes on the service role, which check that
-- the booking belongs to the claimer and that the café belongs to the owner.
ALTER TABLE public.booking_payment_claims ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.booking_payment_claims IS
  'A customer''s claim that they paid. Not proof. Only an owner moving it to verified confirms the booking.';
