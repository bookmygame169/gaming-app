-- Migration: hash the dashboard passwords, and close the owner default
--
-- admin_password and owner_password are stored as plain text and compared with
-- `=`. Anyone who can read the profiles row can sign in as that person, and
-- until recently the admin settings page fetched the current password into the
-- browser to compare it there.
--
-- Two things are fixed here.
--
-- 1. Existing passwords are hashed with bcrypt in place, and both verify
--    functions compare with crypt() instead of `=`.
--
-- 2. verify_owner_login treats a NULL owner_password as the literal 'owner123'
--    via COALESCE — so any owner row with a username and no password set can be
--    signed into with a known string. The same hole was fixed on the admin side
--    in 20260805000000 and never on this one. It goes now.
--
-- Rollout safety matters more than tidiness here: getting this wrong locks
-- someone out of their own dashboard. The functions therefore accept a hashed
-- password *or* a plaintext one. After this migration no plaintext remains, and
-- the app only ever writes hashes, so the plaintext branch is unreachable in
-- practice — it exists so that a row written by an older deploy still in flight
-- cannot lock its owner out. It can be dropped once the deploy has settled.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Hash what is already there.
--
-- A bcrypt hash starts with $2, so anything that does not is still plaintext.
-- That test is what makes this migration safe to run twice.
-- ---------------------------------------------------------------------------
UPDATE public.profiles
SET admin_password = crypt(admin_password, gen_salt('bf'))
WHERE admin_password IS NOT NULL
  AND admin_password NOT LIKE '$2%';

UPDATE public.profiles
SET owner_password = crypt(owner_password, gen_salt('bf'))
WHERE owner_password IS NOT NULL
  AND owner_password NOT LIKE '$2%';

-- ---------------------------------------------------------------------------
-- Comparing a candidate password against whatever is stored.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.password_matches(p_stored TEXT, p_candidate TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  -- No stored password is never a match. This is the hole that let a NULL
  -- password mean "the default one".
  IF p_stored IS NULL OR p_candidate IS NULL THEN
    RETURN false;
  END IF;

  IF p_stored LIKE '$2%' THEN
    RETURN p_stored = crypt(p_candidate, p_stored);
  END IF;

  -- Not a hash: a row from an older deploy. See the note at the top.
  RETURN p_stored = p_candidate;
END;
$$;

-- ---------------------------------------------------------------------------
-- Admin login.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.verify_admin_login(TEXT, TEXT);

CREATE FUNCTION public.verify_admin_login(p_username TEXT, p_password TEXT)
RETURNS TABLE (user_id UUID, username TEXT, is_valid BOOLEAN)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.admin_username,
    (
      public.password_matches(p.admin_password, p_password)
      AND (p.is_admin = true OR p.role IN ('admin', 'super_admin'))
    )
  FROM public.profiles p
  WHERE p.admin_username = p_username
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_admin_login(TEXT, TEXT) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Owner login. The COALESCE default is gone.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.verify_owner_login(TEXT, TEXT);

CREATE FUNCTION public.verify_owner_login(p_username TEXT, p_password TEXT)
RETURNS TABLE (user_id UUID, username TEXT, is_valid BOOLEAN)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.owner_username,
    (
      public.password_matches(p.owner_password, p_password)
      AND p.role = 'owner'
    )
  FROM public.profiles p
  WHERE p.owner_username = p_username
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_owner_login(TEXT, TEXT) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Changing your own admin credentials.
--
-- Verifying the old password and writing the new one happen together, in the
-- database, so the plaintext never has to travel back to the application to be
-- compared — which is exactly what the settings page used to do.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.change_admin_credentials(
  p_user_id UUID,
  p_current_password TEXT,
  p_new_username TEXT DEFAULT NULL,
  p_new_password TEXT DEFAULT NULL
)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_stored TEXT;
BEGIN
  SELECT admin_password INTO v_stored
  FROM public.profiles
  WHERE id = p_user_id;

  IF NOT public.password_matches(v_stored, p_current_password) THEN
    RETURN false;
  END IF;

  UPDATE public.profiles
  SET
    admin_username = COALESCE(NULLIF(TRIM(p_new_username), ''), admin_username),
    admin_password = CASE
      WHEN NULLIF(p_new_password, '') IS NULL THEN admin_password
      ELSE crypt(p_new_password, gen_salt('bf'))
    END
  WHERE id = p_user_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.change_admin_credentials(UUID, TEXT, TEXT, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.change_admin_credentials(UUID, TEXT, TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION public.password_matches IS
  'Compares a candidate against a stored bcrypt hash, falling back to plaintext for rows not yet migrated. NULL never matches.';
