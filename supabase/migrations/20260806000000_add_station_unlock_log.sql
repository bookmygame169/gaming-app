-- Migration: Audit trail for station unlock/lock commands
-- Description: Records every time a physical station is unlocked or locked, and
-- who did it.
--
-- Why the snapshot columns: a booking can be edited or soft-deleted after the
-- fact. Since a PC cannot be unlocked without a booking, the booking is the
-- payment record — which means deleting it afterwards is the way to unlock a
-- machine and keep the cash. Copying the amount, payment mode and status at the
-- moment of unlock means the trail survives that.
--
-- Nothing here ever deletes or updates: it is append-only by intent.

CREATE TABLE IF NOT EXISTS public.station_unlock_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  cafe_id UUID NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  station_name TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('unlock', 'lock')),

  -- Intentionally NOT a foreign key. A booking deleted later must not take its
  -- own audit trail with it, which is the whole point of this table.
  booking_id UUID,

  -- Who or what caused it. 'staff_manual' today; 'qr_scan' once customers can
  -- pay at the machine.
  trigger_source TEXT NOT NULL DEFAULT 'staff_manual',

  -- The signed-in owner/staff account that clicked the button.
  staff_id UUID,

  -- Snapshots of the booking as it was at this moment.
  booking_amount NUMERIC,
  payment_mode TEXT,
  booking_status TEXT,
  duration_seconds INTEGER,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_station_unlock_log_cafe_time
  ON public.station_unlock_log (cafe_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_station_unlock_log_booking
  ON public.station_unlock_log (booking_id);

CREATE INDEX IF NOT EXISTS idx_station_unlock_log_staff
  ON public.station_unlock_log (staff_id, created_at DESC);

-- Locked down with no policies: only the service role reaches this, which is
-- what the /api/owner/stations route uses. Staff must not be able to read or
-- alter the record of their own unlocks from the browser.
ALTER TABLE public.station_unlock_log ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.station_unlock_log IS
  'Append-only record of station unlock/lock commands. Snapshot columns survive booking edits and deletion.';
