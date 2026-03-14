-- Migration: Collections (Power tier)
-- Allows paid users to organize newsletters into themed podcasts.

CREATE TABLE public.collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  host_voice text,
  guest_voice text,
  intro_music text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, slug)
);

CREATE INDEX collections_user_id ON public.collections(user_id);

-- RLS
ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own collections"
  ON public.collections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own collections"
  ON public.collections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own collections"
  ON public.collections FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own collections"
  ON public.collections FOR DELETE
  USING (auth.uid() = user_id);

-- Service role bypass (for cron/admin operations)
CREATE POLICY "Service role full access on collections"
  ON public.collections FOR ALL
  USING (auth.role() = 'service_role');
