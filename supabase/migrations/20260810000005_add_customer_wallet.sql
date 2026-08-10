-- Migration: customer wallet
--
-- A prepaid balance the café tops up. The customer hands over cash or pays by
-- UPI at the counter, the café credits their wallet, and they spend it down on
-- later sessions. There is no payment gateway involved and the customer can
-- never top themselves up — every rupee in here was put there by an owner who
-- says they received it.
--
-- This is money, not points, so it is stricter than the loyalty ledger in three
-- ways:
--
-- 1. A balance can never go below zero. Points going negative is a bug you fix
--    with an offsetting row; money going negative is the café giving away play
--    it was never paid for. The spend path checks the balance first and a
--    trigger refuses it regardless.
--
-- 2. Every top-up carries who credited it and what they were paid. "The
--    customer says they gave me 500" is not something to reconstruct from
--    memory three weeks later when it is disputed.
--
-- 3. Top-ups are idempotent. A counter tablet on a bad connection retries, and
--    a retried top-up must not credit twice.
--
-- The wallet is per café, deliberately. One shared balance across venues would
-- mean money taken at one café being spent at another, which is a settlement
-- problem between two businesses rather than a feature.

CREATE TABLE IF NOT EXISTS public.wallet_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  cafe_id UUID NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,

  -- Last ten digits, matching loyalty and memberships. Most customers are
  -- walk-ins who never sign in, and the phone is all the counter has.
  customer_phone TEXT NOT NULL,

  -- Filled in when the customer has an account, so a wallet survives them
  -- changing their number. Not required, because most do not have one.
  user_id UUID,

  -- Whole rupees. Positive credits, negative spends. One signed column means
  -- the balance is a single SUM and a correction is just another row.
  --
  -- Rupees rather than paise because every other amount in this app is whole
  -- rupees, and a wallet that disagreed with the bill it pays would be worse
  -- than one that cannot express 50 paise.
  amount INTEGER NOT NULL CHECK (amount <> 0),

  reason TEXT NOT NULL CHECK (reason IN ('topup', 'spend', 'refund', 'correction')),

  -- How the café was paid for a top-up: cash, upi, card.
  payment_mode TEXT,

  -- The UPI reference the customer read off their phone, so a disputed top-up
  -- can be matched against the café's own statement.
  payment_reference TEXT,

  -- The booking a spend paid for. Not a foreign key: deleting a booking must
  -- not silently give the money back.
  booking_id UUID,

  -- The owner account that made this entry. Every movement is attributable.
  created_by UUID,

  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_balance
  ON public.wallet_ledger (cafe_id, customer_phone);

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_recent
  ON public.wallet_ledger (cafe_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Idempotent top-ups.
--
-- The counter supplies a key per attempt; a retry carries the same key and is
-- refused by the index rather than by a check the caller might skip.
-- ---------------------------------------------------------------------------
ALTER TABLE public.wallet_ledger
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_ledger_idempotency
  ON public.wallet_ledger (cafe_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ---------------------------------------------------------------------------
-- The balance can never go negative.
--
-- The API checks before it writes, but two tills can pass that check at the
-- same moment and both write. This runs inside the insert, so the second one
-- fails instead of overdrawing.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.wallet_no_overdraw()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_balance INTEGER;
BEGIN
  -- Only spends can overdraw; a credit needs no check and skipping it keeps
  -- top-ups fast.
  IF NEW.amount >= 0 THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_balance
  FROM public.wallet_ledger
  WHERE cafe_id = NEW.cafe_id
    AND customer_phone = NEW.customer_phone;

  IF v_balance + NEW.amount < 0 THEN
    RAISE EXCEPTION 'Wallet balance is only %, cannot deduct %', v_balance, ABS(NEW.amount)
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wallet_no_overdraw ON public.wallet_ledger;
CREATE TRIGGER trg_wallet_no_overdraw
  BEFORE INSERT ON public.wallet_ledger
  FOR EACH ROW
  EXECUTE FUNCTION public.wallet_no_overdraw();

-- Reached only through the API routes on the service role. A customer must
-- never be able to write their own balance.
ALTER TABLE public.wallet_ledger ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.wallet_ledger IS
  'Append-only prepaid balance per cafe + customer_phone. Balance is SUM(amount). Never edit a row; add an offsetting one.';
