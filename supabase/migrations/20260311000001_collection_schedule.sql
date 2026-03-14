-- Migration: Add rotating weekly schedule to collections
-- Each collection can be assigned to specific days of the week (0=Sun, 6=Sat).
-- On any given day, only the scheduled collection generates an episode.

ALTER TABLE public.collections
  ADD COLUMN schedule_days integer[] NOT NULL DEFAULT '{}';
