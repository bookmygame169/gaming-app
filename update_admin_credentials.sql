-- Reset BookMyGame PLATFORM admin login (not café owner login).
-- Run in Supabase → SQL Editor → New query → paste → Run.
--
-- BEFORE RUNNING: change admin_username and new_password below.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

UPDATE public.profiles
SET
  admin_username = 'admin',
  admin_password = crypt('CHANGE_THIS_PASSWORD', gen_salt('bf')),
  role = CASE WHEN role = 'owner' THEN role ELSE 'admin' END,
  is_admin = true
WHERE role IN ('admin', 'super_admin') OR is_admin = true;

-- If no admin row exists yet, uncomment and edit the INSERT below instead of UPDATE:
-- INSERT INTO public.profiles (
--   id, first_name, last_name, role, is_admin, admin_username, admin_password, created_at, updated_at
-- ) VALUES (
--   gen_random_uuid(), 'BookMyGame', 'Admin', 'admin', true, 'admin',
--   crypt('CHANGE_THIS_PASSWORD', gen_salt('bf')), NOW(), NOW()
-- );

-- Check username (password is hashed — you cannot read it back)
SELECT id, first_name, last_name, admin_username, role, is_admin
FROM public.profiles
WHERE role IN ('admin', 'super_admin') OR is_admin = true;
