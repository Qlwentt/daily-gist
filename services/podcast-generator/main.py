"""
Daily Gist Podcast Generator — FastAPI Service

POST /generate            — generates a podcast from newsletter text
POST /generate-and-store  — generates podcast, uploads to Supabase, updates DB
GET  /health              — health check for Railway
"""

import base64
import logging
import os
import threading
import time
from datetime import datetime, timezone

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Request
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

# Limit concurrent podcast generations to avoid API rate limits and memory issues.
# Excess requests queue in-process and run when a slot opens.
MAX_CONCURRENT_GENERATIONS = int(os.environ.get("MAX_CONCURRENT_GENERATIONS", "1"))
_generation_semaphore = threading.Semaphore(MAX_CONCURRENT_GENERATIONS)


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
# Models
# ---------------------------------------------------------------------------

class GenerateRequest(BaseModel):
    user_id: str
    newsletter_text: str


class GenerateResponse(BaseModel):
    audio_base64: str
    transcript: str
    source_newsletters: list[str]


class GenerateAndStoreRequest(BaseModel):
    user_id: str
    newsletter_text: str
    episode_id: str
    email_ids: list[str]
    storage_path: str
    date: str
    user_email: str | None = None
    target_length_minutes: int = 10


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/generate", response_model=GenerateResponse)
def generate(body: GenerateRequest, _auth: None = Depends(verify_token)):
    """Generate a podcast episode from newsletter text.

    This is a sync def so FastAPI runs it in a threadpool, keeping the
    async event loop free during the long-running Podcastfy/TTS calls.
    """
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


def _get_supabase():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise HTTPException(status_code=500, detail="Supabase not configured")
    return create_client(url, key)


def _generate_and_store(body: GenerateAndStoreRequest):
    """Background task: generate podcast, upload to Supabase, update DB."""
    logger.info(
        "generate-and-store: waiting for slot (max %d concurrent), episode_id=%s",
        MAX_CONCURRENT_GENERATIONS,
        body.episode_id,
    )

    with _generation_semaphore:
        _do_generate_and_store(body)


def _do_generate_and_store(body: GenerateAndStoreRequest):
    supabase = _get_supabase()

    try:
        logger.info(
            "generate-and-store: starting for user_id=%s, episode_id=%s",
            body.user_id,
            body.episode_id,
        )

        # Resolve user_email: prefer the value from the request, fall back to DB lookup
        user_email = body.user_email
        if not user_email:
            user_resp = supabase.table("users").select("email").eq("id", body.user_id).single().execute()
            if user_resp.data and user_resp.data.get("email"):
                user_email = user_resp.data["email"]

        def _update_progress(stage: str):
            supabase.table("episodes").update({
                "progress_stage": stage,
            }).eq("id", body.episode_id).execute()

        mp3_bytes, transcript, source_newsletters = generate_podcast(
            body.newsletter_text,
            user_email=user_email,
            on_progress=_update_progress,
            target_length_minutes=body.target_length_minutes,
        )
        logger.info(
            "generate-and-store: pipeline complete for episode_id=%s, %d bytes MP3",
            body.episode_id,
            len(mp3_bytes),
        )

        _update_progress("uploading")
        logger.info(
            "generate-and-store: uploading %d bytes to %s",
            len(mp3_bytes),
            body.storage_path,
        )

        # Upload MP3 to Supabase Storage
        supabase.storage.from_("podcasts").upload(
            body.storage_path,
            mp3_bytes,
            file_options={"content-type": "audio/mpeg", "upsert": "true"},
        )

        # Get public URL
        public_url = supabase.storage.from_("podcasts").get_public_url(body.storage_path)

        # Update episode record
        update_resp = supabase.table("episodes").update({
            "audio_url": public_url,
            "audio_size_bytes": len(mp3_bytes),
            "transcript": transcript or None,
            "source_newsletters": source_newsletters,
            "status": "ready",
        }).eq("id", body.episode_id).execute()

        logger.info(
            "generate-and-store: episode update for %s returned %d row(s)",
            body.episode_id,
            len(update_resp.data) if update_resp.data else 0,
        )

        # Verify the episode is visible before inserting segments — guards
        # against transient connection-pooler visibility issues between
        # back-to-back requests.
        for attempt in range(3):
            check = supabase.table("episodes").select("id").eq("id", body.episode_id).execute()
            if check.data:
                break
            logger.warning(
                "generate-and-store: episode %s not visible (attempt %d/3), waiting",
                body.episode_id,
                attempt + 1,
            )
            time.sleep(1)
        else:
            raise RuntimeError(f"Episode {body.episode_id} not visible after 3 attempts")

        # Create episode segment
        supabase.table("episode_segments").insert({
            "episode_id": body.episode_id,
            "segment_type": "deep_dive",
            "title": "Newsletter Digest",
            "summary": f"Digest of {len(body.email_ids)} newsletter(s)",
            "source_email_ids": body.email_ids,
            "sort_order": 0,
        }).execute()

        # Mark emails as processed
        now = datetime.now(timezone.utc).isoformat()
        supabase.table("raw_emails").update({
            "processed_at": now,
        }).in_("id", body.email_ids).execute()

        logger.info(
            "generate-and-store: completed for episode_id=%s",
            body.episode_id,
        )
    except Exception:
        logger.exception(
            "generate-and-store: failed for episode_id=%s",
            body.episode_id,
        )
        try:
            fail_resp = supabase.table("episodes").update({
                "status": "failed",
                "error_message": "Podcast generation failed",
            }).eq("id", body.episode_id).execute()

            if not fail_resp.data:
                logger.warning(
                    "generate-and-store: update to 'failed' matched 0 rows for episode_id=%s, trying upsert",
                    body.episode_id,
                )
                supabase.table("episodes").upsert({
                    "id": body.episode_id,
                    "user_id": body.user_id,
                    "date": body.date,
                    "status": "failed",
                    "error_message": "Podcast generation failed",
                }).execute()
        except Exception:
            logger.exception("Failed to update episode status to failed")


@app.post("/generate-and-store", status_code=202)
def generate_and_store(
    body: GenerateAndStoreRequest,
    background_tasks: BackgroundTasks,
    _auth: None = Depends(verify_token),
):
    """Accept a generation request and process it in the background.

    Returns 202 immediately — the actual work happens asynchronously.
    """
    logger.info(
        "generate-and-store: accepted for user_id=%s, episode_id=%s",
        body.user_id,
        body.episode_id,
    )
    background_tasks.add_task(_generate_and_store, body)
    return {"status": "accepted", "episode_id": body.episode_id}
