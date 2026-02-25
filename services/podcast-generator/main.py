"""
Daily Gist Podcast Generator — Worker Service

Workers poll the episodes table for queued jobs using Postgres SKIP LOCKED.
Instant pickup via pg_notify; 5s poll as fallback.

POST /generate  — synchronous generation (for testing)
GET  /health    — health check for Railway
"""

import base64
import concurrent.futures
import logging
import os
import platform
import select
import threading
import time
from contextlib import contextmanager
from datetime import datetime, timezone

import anthropic
import psycopg2
from fastapi import Depends, FastAPI, HTTPException, Request
from pydantic import BaseModel
from supabase import create_client

from pipeline import generate_podcast

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Daily Gist Podcast Generator")

GENERATOR_API_KEY = os.environ.get("GENERATOR_API_KEY")
MAX_WORKERS = int(os.environ.get("MAX_WORKERS", "2"))
DATABASE_URL = os.environ.get("DATABASE_URL")

# Pipeline-level retry: if the entire generate_podcast() call fails with a
# transient error, wait and retry once before marking the episode as failed.
_PIPELINE_MAX_RETRIES = 2
_PIPELINE_RETRY_DELAY_S = 60

_RETRYABLE_EXCEPTIONS = (
    anthropic.RateLimitError,
    anthropic.APIConnectionError,
    concurrent.futures.TimeoutError,
    ConnectionError,
    TimeoutError,
)


def _is_retryable(exc: Exception) -> bool:
    """Return True if the exception is transient and worth retrying."""
    if isinstance(exc, _RETRYABLE_EXCEPTIONS):
        return True
    # 529 overloaded — caught as generic APIStatusError
    if isinstance(exc, anthropic.APIStatusError) and exc.status_code == 529:
        return True
    return False


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

def verify_token(request: Request) -> None:
    if not GENERATOR_API_KEY:
        raise HTTPException(status_code=500, detail="GENERATOR_API_KEY not configured")

    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")

    token = auth[len("Bearer "):]
    if token != GENERATOR_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid token")


# ---------------------------------------------------------------------------
# Supabase client (REST API for storage + DB updates)
# ---------------------------------------------------------------------------

def _get_supabase():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("Supabase not configured")
    return create_client(url, key)


# ---------------------------------------------------------------------------
# Models (for /generate endpoint)
# ---------------------------------------------------------------------------

class GenerateRequest(BaseModel):
    user_id: str
    newsletter_text: str


class GenerateResponse(BaseModel):
    audio_base64: str
    transcript: str
    source_newsletters: list[str]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

_worker_threads: list[threading.Thread] = []
_shutdown_event = threading.Event()


@app.get("/health")
def health():
    alive_workers = sum(1 for t in _worker_threads if t.is_alive())
    return {
        "status": "ok",
        "workers": {"alive": alive_workers, "configured": MAX_WORKERS},
    }


@app.post("/generate", response_model=GenerateResponse)
def generate(body: GenerateRequest, _auth: None = Depends(verify_token)):
    """Synchronous generation for testing."""
    logger.info(
        "Generating podcast for user_id=%s, input=%d chars",
        body.user_id,
        len(body.newsletter_text),
    )

    try:
        mp3_bytes, transcript, source_newsletters = generate_podcast(body.newsletter_text)
    except Exception:
        logger.exception("Podcast generation failed for user_id=%s", body.user_id)
        raise HTTPException(status_code=500, detail="Podcast generation failed")

    audio_base64 = base64.b64encode(mp3_bytes).decode("ascii")

    logger.info(
        "Podcast ready for user_id=%s: %d bytes MP3, %d chars transcript",
        body.user_id,
        len(mp3_bytes),
        len(transcript),
    )

    return GenerateResponse(
        audio_base64=audio_base64,
        transcript=transcript,
        source_newsletters=source_newsletters,
    )


# ---------------------------------------------------------------------------
# Worker loop — polls episodes table via claim_next_job()
# ---------------------------------------------------------------------------

@contextmanager
def _pg_connect():
    """Open a direct Postgres connection (needed for LISTEN/NOTIFY)."""
    conn = psycopg2.connect(DATABASE_URL)
    conn.set_isolation_level(psycopg2.extensions.ISOLATION_LEVEL_AUTOCOMMIT)
    try:
        yield conn
    finally:
        conn.close()


def _process_job(episode_id: str, user_id: str, job_input: dict):
    """Run the podcast pipeline for a claimed job, upload result, update DB."""
    supabase = _get_supabase()

    try:
        newsletter_text = job_input["newsletter_text"]
        email_ids = job_input["email_ids"]
        storage_path = job_input["storage_path"]
        date = job_input["date"]
        user_email = job_input.get("user_email")
        target_length_minutes = job_input.get("target_length_minutes", 10)
        intro_music = job_input.get("intro_music")

        logger.info(
            "Processing job: episode_id=%s, user_id=%s, %d chars input",
            episode_id, user_id, len(newsletter_text),
        )

        # Resolve user_email if not provided
        if not user_email:
            user_resp = supabase.table("users").select("email").eq("id", user_id).single().execute()
            if user_resp.data and user_resp.data.get("email"):
                user_email = user_resp.data["email"]

        def _update_progress(stage: str, metadata: dict | None = None):
            value = stage
            if metadata and "chunk" in metadata and "total" in metadata:
                value = f"{stage}:{metadata['chunk']}/{metadata['total']}"
            supabase.table("episodes").update({
                "progress_stage": value,
            }).eq("id", episode_id).execute()

        for attempt in range(_PIPELINE_MAX_RETRIES):
            try:
                mp3_bytes, transcript, source_newsletters = generate_podcast(
                    newsletter_text,
                    user_email=user_email,
                    on_progress=_update_progress,
                    target_length_minutes=target_length_minutes,
                    intro_music=intro_music,
                )
                break  # success
            except Exception as exc:
                if attempt < _PIPELINE_MAX_RETRIES - 1 and _is_retryable(exc):
                    logger.warning(
                        "Pipeline attempt %d failed (%s), retrying in %ds...",
                        attempt + 1,
                        type(exc).__name__,
                        _PIPELINE_RETRY_DELAY_S,
                    )
                    time.sleep(_PIPELINE_RETRY_DELAY_S)
                else:
                    raise

        logger.info(
            "Pipeline complete for episode_id=%s, %d bytes MP3",
            episode_id, len(mp3_bytes),
        )

        _update_progress("uploading")

        # Upload MP3 to Supabase Storage
        supabase.storage.from_("podcasts").upload(
            storage_path,
            mp3_bytes,
            file_options={"content-type": "audio/mpeg", "upsert": "true"},
        )

        # Get public URL
        public_url = supabase.storage.from_("podcasts").get_public_url(storage_path)

        # Update episode record
        supabase.table("episodes").update({
            "audio_url": public_url,
            "audio_size_bytes": len(mp3_bytes),
            "transcript": transcript or None,
            "source_newsletters": source_newsletters,
            "status": "ready",
        }).eq("id", episode_id).execute()

        # Verify the episode is visible before inserting segments
        for vis_attempt in range(3):
            check = supabase.table("episodes").select("id").eq("id", episode_id).execute()
            if check.data:
                break
            logger.warning(
                "Episode %s not visible (attempt %d/3), waiting",
                episode_id, vis_attempt + 1,
            )
            time.sleep(1)
        else:
            raise RuntimeError(f"Episode {episode_id} not visible after 3 attempts")

        # Create episode segment
        supabase.table("episode_segments").insert({
            "episode_id": episode_id,
            "segment_type": "deep_dive",
            "title": "Newsletter Digest",
            "summary": f"Digest of {len(email_ids)} newsletter(s)",
            "source_email_ids": email_ids,
            "sort_order": 0,
        }).execute()

        # Mark emails as processed
        now = datetime.now(timezone.utc).isoformat()
        supabase.table("raw_emails").update({
            "processed_at": now,
        }).in_("id", email_ids).execute()

        logger.info("Job completed: episode_id=%s", episode_id)

    except Exception:
        logger.exception("Job failed: episode_id=%s", episode_id)
        try:
            supabase.table("episodes").update({
                "status": "failed",
                "error_message": "Podcast generation failed",
            }).eq("id", episode_id).execute()
        except Exception:
            logger.exception("Failed to update episode status to failed")


def _worker_loop(worker_id: str):
    """Main loop for a worker thread: claim jobs, process them, repeat."""
    logger.info("Worker %s started", worker_id)

    while not _shutdown_event.is_set():
        try:
            with _pg_connect() as conn:
                cur = conn.cursor()

                # LISTEN for instant notifications
                cur.execute("LISTEN new_job;")
                logger.info("Worker %s: listening for jobs", worker_id)

                while not _shutdown_event.is_set():
                    # Try to claim a job via RPC
                    supabase = _get_supabase()
                    resp = supabase.rpc("claim_next_job", {"p_worker_id": worker_id}).execute()

                    job = resp.data
                    if job:
                        episode_id = job["id"]
                        user_id = job["user_id"]
                        job_input = job["job_input"]

                        logger.info("Worker %s claimed job: episode_id=%s", worker_id, episode_id)
                        _process_job(episode_id, user_id, job_input)

                        # Immediately loop to check for more jobs
                        continue

                    # No job available — wait for pg_notify or poll timeout
                    if select.select([conn], [], [], 5.0) != ([], [], []):
                        conn.poll()
                        # Drain all notifications
                        while conn.notifies:
                            conn.notifies.pop(0)
                        # Loop back to claim
                    # else: 5s timeout, loop back to poll

        except Exception:
            if _shutdown_event.is_set():
                break
            logger.exception("Worker %s: connection error, reconnecting in 5s", worker_id)
            time.sleep(5)

    logger.info("Worker %s stopped", worker_id)


def _stale_job_monitor():
    """Periodically reset stale processing jobs back to queued."""
    logger.info("Stale job monitor started")

    while not _shutdown_event.is_set():
        try:
            supabase = _get_supabase()
            resp = supabase.rpc("reset_stale_jobs", {"p_timeout_minutes": 15}).execute()
            reset_count = resp.data
            if reset_count and reset_count > 0:
                logger.warning("Reset %d stale job(s) back to queued", reset_count)
        except Exception:
            logger.exception("Stale job monitor error")

        # Sleep 60s in 1s increments so we can respond to shutdown
        for _ in range(60):
            if _shutdown_event.is_set():
                break
            time.sleep(1)

    logger.info("Stale job monitor stopped")


# ---------------------------------------------------------------------------
# Startup / Shutdown
# ---------------------------------------------------------------------------

@app.on_event("startup")
def startup():
    if not DATABASE_URL:
        logger.warning("DATABASE_URL not set — workers will not start")
        return

    hostname = platform.node() or "worker"

    for i in range(MAX_WORKERS):
        worker_id = f"{hostname}-{i}"
        t = threading.Thread(target=_worker_loop, args=(worker_id,), daemon=True, name=f"worker-{i}")
        t.start()
        _worker_threads.append(t)

    # Stale job monitor thread
    monitor = threading.Thread(target=_stale_job_monitor, daemon=True, name="stale-monitor")
    monitor.start()
    _worker_threads.append(monitor)

    logger.info("Started %d worker(s) + stale job monitor", MAX_WORKERS)


@app.on_event("shutdown")
def shutdown():
    logger.info("Shutting down workers...")
    _shutdown_event.set()
    for t in _worker_threads:
        t.join(timeout=10)
    logger.info("All workers stopped")
