-- PC game menu entries per café (shown on the lock agent after unlock).

CREATE TABLE IF NOT EXISTS public.cafe_pc_games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id UUID NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  exe_path TEXT NOT NULL,
  arguments TEXT,
  process_name TEXT,
  icon_path TEXT,
  working_directory TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cafe_pc_games_cafe_sort
  ON public.cafe_pc_games (cafe_id, sort_order);

ALTER TABLE public.cafe_pc_games ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.cafe_pc_games IS
  'Game tiles for the PC lock agent menu. Synced to gaming PCs on startup.';
