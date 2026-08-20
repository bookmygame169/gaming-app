-- These functions run as their owner (SECURITY DEFINER), which means they
-- ignore row-level security by design. Every one of them was executable by
-- anon: the role the website's public key resolves to.
--
-- delete_cafe_cascade is the one that matters most. It has no caller anywhere
-- in the codebase, and it deletes a cafe and everything hanging off it. It was
-- reachable by anyone who could read the key out of the page source - which is
-- everyone, since that key is in the page source by design.
--
-- validate_coupon keeps its grant: the checkout page calls it from the browser
-- to check a code before booking, and it only reads.
--
-- Two server routes had to be fixed alongside this, and they are the reason
-- the grants existed at all: /api/owner/login and /api/tournaments/register
-- reached these functions through @/lib/supabaseClient, which holds the PUBLIC
-- anon key despite both being server code. Revoking without fixing those would
-- have locked the owner out of their own dashboard.

DO $$
DECLARE
  fn record;
  keep_for_browser CONSTANT text[] := ARRAY['validate_coupon'];
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
    WHERE p.proname IN (
      'delete_cafe_cascade', 'change_admin_credentials',
      'verify_admin_login', 'verify_owner_login',
      'claim_unlock_token', 'use_coupon',
      'increment_inventory_stock',
      'increment_tournament_participants', 'increment_tournament_participants_undo',
      'purge_expired_unlock_tokens'
    )
      AND NOT (p.proname = ANY (keep_for_browser))
  LOOP
    -- PUBLIC as well as the two named roles: a grant to PUBLIC is what makes
    -- these reachable in the first place, and revoking only anon leaves it.
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', fn.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', fn.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', fn.sig);
  END LOOP;
END $$;
