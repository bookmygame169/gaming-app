-- Migration: Atomic tournament registration counter
-- Description: current_participants was set to 0 on tournament creation and
-- never incremented anywhere, so the "tournament is full" check in
-- /api/tournaments/register could never fire. This RPC increments the count
-- and enforces the capacity limit in a single UPDATE, so concurrent
-- registrations serialize on the row lock instead of both reading the same
-- stale count and both succeeding past capacity.

CREATE OR REPLACE FUNCTION increment_tournament_participants(p_tournament_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_count INT;
BEGIN
  UPDATE tournaments
  SET current_participants = COALESCE(current_participants, 0) + 1
  WHERE id = p_tournament_id
    AND (max_participants IS NULL OR COALESCE(current_participants, 0) < max_participants)
  RETURNING current_participants INTO new_count;

  RETURN new_count; -- NULL means not found or already full
END;
$$;

GRANT EXECUTE ON FUNCTION increment_tournament_participants(UUID) TO anon;
GRANT EXECUTE ON FUNCTION increment_tournament_participants(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_tournament_participants(UUID) TO service_role;

COMMENT ON FUNCTION increment_tournament_participants IS 'Atomically increments tournaments.current_participants if under max_participants; returns NULL if full or not found';

-- Companion undo, used when a slot was reserved but the registration row
-- insert that followed it failed, so the count doesn't drift upward.
CREATE OR REPLACE FUNCTION increment_tournament_participants_undo(p_tournament_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_count INT;
BEGIN
  UPDATE tournaments
  SET current_participants = GREATEST(0, COALESCE(current_participants, 0) - 1)
  WHERE id = p_tournament_id
  RETURNING current_participants INTO new_count;

  RETURN new_count;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_tournament_participants_undo(UUID) TO anon;
GRANT EXECUTE ON FUNCTION increment_tournament_participants_undo(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_tournament_participants_undo(UUID) TO service_role;

COMMENT ON FUNCTION increment_tournament_participants_undo IS 'Releases a slot claimed by increment_tournament_participants when the following registration insert fails';
