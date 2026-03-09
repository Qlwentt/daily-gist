-- Migration: Free Edition support
-- Adds category columns, replaces unique constraint with partial indexes,
-- adds RLS policy for free users to view shared category episodes.

-- =============================================================================
-- NEW COLUMNS
-- =============================================================================

ALTER TABLE public.users ADD COLUMN category text;
ALTER TABLE public.newsletter_sources ADD COLUMN category text;
ALTER TABLE public.episodes ADD COLUMN category text;

-- =============================================================================
-- REPLACE UNIQUE CONSTRAINT WITH PARTIAL INDEXES
-- =============================================================================

-- Drop the existing unique constraint on (user_id, date)
ALTER TABLE public.episodes DROP CONSTRAINT IF EXISTS episodes_user_id_date_key;

-- Personal episodes: one per user per day (category IS NULL)
CREATE UNIQUE INDEX episodes_user_date_personal
  ON public.episodes(user_id, date)
  WHERE category IS NULL;

-- Category episodes: one per user per day per category (category IS NOT NULL)
CREATE UNIQUE INDEX episodes_user_date_category
  ON public.episodes(user_id, date, category)
  WHERE category IS NOT NULL;

-- =============================================================================
-- RLS: Free users can view shared category episodes
-- =============================================================================

-- Free users need to see episodes from the system user that match their category
CREATE POLICY "Free users can view category episodes"
  ON public.episodes FOR SELECT
  USING (
    auth.uid() = user_id
    OR (
      category IS NOT NULL
      AND category = (
        SELECT u.category FROM public.users u WHERE u.id = auth.uid()
      )
    )
  );
