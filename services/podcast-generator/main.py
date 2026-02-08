"""
Daily Gist Podcast Generator — FastAPI Service

POST /generate  — generates a podcast from newsletter text
GET  /health    — health check for Railway
"""

import base64
import logging
import os

from fastapi import Depends, FastAPI, HTTPException, Request
from pydantic import BaseModel

from pipeline import generate_podcast

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Daily Gist Podcast Generator")

GENERATOR_API_KEY = os.environ.get("GENERATOR_API_KEY")


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
        mp3_bytes, transcript = generate_podcast(body.newsletter_text)
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

    return GenerateResponse(audio_base64=audio_base64, transcript=transcript)
