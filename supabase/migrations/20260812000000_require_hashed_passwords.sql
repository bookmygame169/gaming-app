-- Migration: passwords must be hashed, no exceptions
--
-- 20260810000006 hashed the dashboard passwords and taught password_matches to
-- accept either a bcrypt hash or a plaintext value. The plaintext branch was
-- deliberate and temporary: it meant the migration and the deploy could land in
-- either order without locking anyone out of their own dashboard.
--
-- Both have landed. Every stored password is bcrypt, and the only writer is
-- change_admin_credentials, which hashes. The branch now protects nothing and
-- would quietly accept a plaintext password if one were ever written again — so
-- it goes.
--
-- The new behaviour fails closed. A value that is not a bcrypt hash matches
-- nothing, which means a row written by some future mistake locks that account
-- out rather than letting anyone in with the raw string. Being locked out is
-- recoverable; the alternative is not.

CREATE OR REPLACE FUNCTION public.password_matches(p_stored TEXT, p_candidate TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF p_stored IS NULL OR p_candidate IS NULL THEN
    RETURN false;
  END IF;

  -- Not a bcrypt hash: refuse rather than fall back to comparing raw text.
  IF p_stored NOT LIKE '$2%' THEN
    RETURN false;
  END IF;

  RETURN p_stored = crypt(p_candidate, p_stored);
END;
$$;

COMMENT ON FUNCTION public.password_matches IS
  'Compares a candidate against a stored bcrypt hash. NULL or non-bcrypt never matches.';

-- ---------------------------------------------------------------------------
-- Belt and braces: hash anything that is somehow still plaintext, so running
-- this on a database that missed the earlier migration does not lock its owner
-- out. A no-op on a database that is already correct.
-- ---------------------------------------------------------------------------
UPDATE public.profiles
SET admin_password = crypt(admin_password, gen_salt('bf'))
WHERE admin_password IS NOT NULL
  AND admin_password NOT LIKE '$2%';

UPDATE public.profiles
SET owner_password = crypt(owner_password, gen_salt('bf'))
WHERE owner_password IS NOT NULL
  AND owner_password NOT LIKE '$2%';
