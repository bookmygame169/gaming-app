-- A membership that really is unlimited.
--
-- "UNLIMITED HOURS" was sold as a 300-hour package with an unlimited-sounding
-- name. It works right up until it does not: the member sees a countdown, the
-- dashboard shows a balance draining, and somebody who used it heavily for a
-- month would eventually be told they had no hours left on the plan they were
-- promised had no limit.
--
-- A flag rather than a null in hours, because null already means something for
-- a day pass, and because roughly twenty places read hours_remaining through
-- `Number(x) || 0` - which turns a null into a zero, and a zero into "no hours
-- left, buy time instead". A boolean cannot be misread that way.
--
-- Carried on the subscription as well as the plan. It is answered on every scan
-- of a lock screen, and a station asking "may this person play?" should not have
-- to join another table to find out.

ALTER TABLE public.membership_plans
  ADD COLUMN IF NOT EXISTS is_unlimited BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS is_unlimited BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.membership_plans.is_unlimited IS
  'Play without a balance: no hours are deducted and no countdown is shown.';

COMMENT ON COLUMN public.subscriptions.is_unlimited IS
  'Copied from the plan when the membership is sold, so a station need not join to ask.';
