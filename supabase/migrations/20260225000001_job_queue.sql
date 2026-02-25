-- Migration: Postgres-backed job queue for episode generation
-- Adds job_input, claimed_at, worker_id columns to episodes.
-- Creates claim_next_job() and reset_stale_jobs() RPC functions.
-- Creates pg_notify trigger for instant job pickup.

-- =============================================================================
-- NEW COLUMNS
-- =============================================================================

ALTER TABLE public.episodes ADD COLUMN job_input jsonb;
ALTER TABLE public.episodes ADD COLUMN claimed_at timestamptz;
ALTER TABLE public.episodes ADD COLUMN worker_id text;

-- =============================================================================
-- UPDATE STATUS CHECK CONSTRAINT (add 'queued')
-- =============================================================================

ALTER TABLE public.episodes DROP CONSTRAINT IF EXISTS episodes_status_check;
ALTER TABLE public.episodes ADD CONSTRAINT episodes_status_check
  CHECK (status IN ('pending', 'queued', 'processing', 'ready', 'failed'));

-- Index for workers polling for queued jobs (oldest first)
CREATE INDEX idx_episodes_queued ON public.episodes(created_at)
  WHERE status = 'queued';

-- =============================================================================
-- claim_next_job(p_worker_id TEXT) -> JSONB
-- Atomically claims the oldest queued episode for a worker.
-- Returns NULL if no jobs available.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.claim_next_job(p_worker_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_episode record;
BEGIN
  SELECT id, user_id, job_input
  INTO v_episode
  FROM public.episodes
  WHERE status = 'queued'
  ORDER BY created_at
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_episode IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.episodes
  SET status = 'processing',
      claimed_at = now(),
      worker_id = p_worker_id,
      progress_stage = 'claimed'
  WHERE id = v_episode.id;

  RETURN jsonb_build_object(
    'id', v_episode.id,
    'user_id', v_episode.user_id,
    'job_input', v_episode.job_input
  );
END;
$$;

-- =============================================================================
-- reset_stale_jobs(p_timeout_minutes INT) -> INT
-- Resets stuck processing jobs back to queued.
-- Returns the number of jobs reset.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.reset_stale_jobs(p_timeout_minutes int DEFAULT 15)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count int;
BEGIN
  UPDATE public.episodes
  SET status = 'queued',
      claimed_at = NULL,
      worker_id = NULL,
      progress_stage = NULL
  WHERE status = 'processing'
    AND claimed_at < now() - (p_timeout_minutes || ' minutes')::interval;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- =============================================================================
-- pg_notify trigger — instant notification when a job is queued
-- =============================================================================

CREATE OR REPLACE FUNCTION public.notify_new_job()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_notify('new_job', NEW.id::text);
  RETURN NEW;
END;
$$;

CREATE TRIGGER episode_queued_notify
  AFTER INSERT ON public.episodes
  FOR EACH ROW
  WHEN (NEW.status = 'queued')
  EXECUTE FUNCTION public.notify_new_job();

-- Also fire on UPDATE to 'queued' (retry case)
CREATE TRIGGER episode_requeued_notify
  AFTER UPDATE OF status ON public.episodes
  FOR EACH ROW
  WHEN (NEW.status = 'queued')
  EXECUTE FUNCTION public.notify_new_job();
