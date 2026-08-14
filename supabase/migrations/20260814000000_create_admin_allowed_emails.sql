-- Migration: Google-only admin login allowlist
-- Description: Which Gmail accounts may sign into /admin via Google OAuth.
-- Author: BookMyGame
-- Date: 2026-08-14

CREATE TABLE IF NOT EXISTS public.admin_allowed_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  added_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT admin_allowed_emails_email_unique UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS idx_admin_allowed_emails_email
  ON public.admin_allowed_emails (LOWER(email));

COMMENT ON TABLE public.admin_allowed_emails IS
  'Gmail addresses allowed to sign into the platform admin panel with Google.';

-- Bootstrap: replace with your Gmail if different (run in SQL editor after deploy).
INSERT INTO public.admin_allowed_emails (email, added_by)
VALUES ('bookmygame169@gmail.com', 'migration')
ON CONFLICT (email) DO NOTHING;

ALTER TABLE public.admin_allowed_emails ENABLE ROW LEVEL SECURITY;

-- No public policies: only the service role (API routes) reads this table.
