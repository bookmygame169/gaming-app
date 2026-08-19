-- The password that closes the lock screen, set by the owner rather than typed
-- at each PC.
--
-- It was per-machine: an administrator ran set-exit-password.ps1 on every
-- station, which means three chances to mistype it and no way to change it
-- without walking to each desk. One value per café is what an owner can
-- actually remember and update.
--
-- A hash, never the password. This repository is public, the value is served to
-- every station, and it lands in a file on a PC a customer is signed into.
-- PBKDF2-SHA256 with a per-café salt, in the same format the agent already
-- verifies: iterations.salt.hash, salt and hash base64.

ALTER TABLE public.cafes
  ADD COLUMN IF NOT EXISTS station_exit_password_hash TEXT;

COMMENT ON COLUMN public.cafes.station_exit_password_hash IS
  'PBKDF2-SHA256 hash of the Ctrl+Alt+Shift+Q exit password for this cafe''s stations. Never the password itself. Null means the chord does nothing.';
