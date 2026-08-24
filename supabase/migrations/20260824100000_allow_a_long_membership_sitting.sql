-- A booking may last longer than five hours.
--
-- bookings.duration was capped at 300 minutes, which was true of everything
-- we sold when the cap was written: blocks of half an hour to five hours.
--
-- A membership session is not a block. The number written when it starts is a
-- backstop - twelve hours, the point at which a machine somebody walked away
-- from locks itself - and the number written when it ends is however long they
-- actually played. Both can exceed five hours, and both were being refused:
-- starting on a plan with more than five hours left failed outright, and a
-- long sitting could not be closed, so the seat stayed "in use" forever.
--
-- One day is the new ceiling. It still catches the mistake the old cap was
-- guarding against - hours typed into a field that counts minutes - without
-- refusing a session somebody really sat through.

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_duration_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_duration_check CHECK (duration > 0 AND duration <= 1440);
