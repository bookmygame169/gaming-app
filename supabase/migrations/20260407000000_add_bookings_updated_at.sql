DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'bookings'
      AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.bookings
      ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();

    UPDATE public.bookings
    SET updated_at = COALESCE(created_at, now())
    WHERE updated_at IS NULL;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.update_bookings_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bookings_updated_at ON public.bookings;

CREATE TRIGGER bookings_updated_at
BEFORE UPDATE ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.update_bookings_updated_at();
