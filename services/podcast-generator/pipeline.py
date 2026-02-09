"""
Daily Gist Podcast Generator — Pipeline

Pipeline:
1. Podcastfy + Claude Sonnet → conversation transcript
2. Gemini 2.5 Flash TTS → multi-speaker audio
3. ffmpeg → WAV-to-MP3 encoding

Cost per episode:
- Claude Sonnet (transcript): ~$0.03-0.05
- Gemini 2.5 Flash TTS (audio): ~$0.20
- Total: ~$0.23-0.25/episode

Entry point: generate_podcast(newsletter_text) -> (mp3_bytes, transcript)
"""

import logging
import os
import re
import subprocess
import tempfile
import wave

from google import genai
from google.genai import types
from podcastfy.client import generate_podcast as podcastfy_generate

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def generate_podcast(newsletter_text: str) -> tuple[bytes, str]:
    """Generate a podcast episode from newsletter text.

    Returns (mp3_bytes, transcript).
    """
    if not newsletter_text.strip():
        raise ValueError("Empty newsletter text")

    logger.info("Step 1: Generating transcript with Podcastfy + Claude...")
    transcript = _generate_transcript(newsletter_text)
    logger.info("Transcript generated: %d characters", len(transcript))

    logger.info("Step 1.5: Cleaning transcript...")
    transcript = _clean_transcript(transcript)
    logger.info("Transcript after cleaning: %d characters", len(transcript))

    logger.info("Step 2: Parsing transcript into speaker turns...")
    turns = _parse_transcript(transcript)
    if not turns:
        raise RuntimeError("Transcript produced no dialogue turns")

    logger.info("Step 3: Synthesizing audio with Gemini 2.5 Flash TTS...")
    mp3_bytes = _synthesize_audio(turns)

    return mp3_bytes, transcript


# ---------------------------------------------------------------------------
# Step 1: Generate transcript using Podcastfy
# ---------------------------------------------------------------------------

def _generate_transcript(newsletter_text: str) -> str:
    conversation_config = {
        "word_count": 5000,
        "conversation_style": [
            "engaging",
            "fast-paced",
            "enthusiastic",
            "informative",
        ],
        "roles_person1": "main summarizer",
        "roles_person2": "curious questioner",
        "dialogue_structure": [
            "Topic Introduction",
            "Deep Dive",
            "Key Takeaways",
            "Casual Banter",
            "Wrap-up",
        ],
        "podcast_name": "Daily Gist",
        "podcast_tagline": "Your newsletters, distilled into conversation",
        "engagement_techniques": [
            "rhetorical questions",
            "analogies",
            "real-world examples",
            "expressing genuine curiosity",
            "anecdotes",
            "humor",
            "surprising facts",
        ],
        "creativity": 0.8,
        "output_language": "English",
        "user_instructions": (
            "Output ONLY dialogue in <Person1> and <Person2> tags. "
            "Do NOT include any scratchpad, thinking blocks, stage directions, "
            "meta-commentary, or prompt instructions in your output. "
            "Start with a single greeting and never repeat it later in the conversation. "
            "Cover ALL major topics from the source material — do not skip or omit any."
        ),
    }

    transcript_path = podcastfy_generate(
        text=newsletter_text,
        conversation_config=conversation_config,
        llm_model_name="claude-sonnet-4-20250514",
        api_key_label="ANTHROPIC_API_KEY",
        transcript_only=True,
    )

    if not transcript_path or not os.path.exists(transcript_path):
        raise RuntimeError("Transcript generation failed — no file produced")

    with open(transcript_path, "r") as f:
        return f.read()


# ---------------------------------------------------------------------------
# Step 1.5: Clean transcript
# ---------------------------------------------------------------------------

_GREETING_RE = re.compile(
    r"^(hey |hi |hello |good morning|welcome |what'?s up|greetings)",
    re.IGNORECASE,
)


def _clean_transcript(raw: str) -> str:
    """Remove LLM artifacts from a Podcastfy transcript."""
    text = raw

    # Remove <scratchpad>/<thinking> blocks
    text = re.sub(r"<scratchpad>.*?</scratchpad>", "", text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<thinking>.*?</thinking>", "", text, flags=re.DOTALL | re.IGNORECASE)

    # Remove triple-backtick fenced blocks
    text = re.sub(r"```.*?```", "", text, flags=re.DOTALL)

    # Remove [bracketed instructions]
    text = re.sub(r"\[.*?\]", "", text)

    # Keep only <Person1>/<Person2> segments
    person_tags = re.findall(r"(<Person[12]>.*?</Person[12]>)", text, re.DOTALL)
    if person_tags:
        text = "\n".join(person_tags)

    # Strip **bold** markdown
    text = re.sub(r"\*\*(.*?)\*\*", r"\1", text)

    # Remove instruction-like lines
    text = re.sub(
        r"(?m)^\s*(Note|Instructions?|Reminder|TODO|NB|IMPORTANT):.*$",
        "",
        text,
        flags=re.IGNORECASE,
    )

    # Deduplicate opener greeting
    p1_matches = list(re.finditer(r"<Person1>(.*?)</Person1>", text, re.DOTALL))
    if len(p1_matches) >= 2:
        first_text = p1_matches[0].group(1).strip()
        second_text = p1_matches[1].group(1).strip()
        if _GREETING_RE.match(first_text) and _GREETING_RE.match(second_text):
            text = text[: p1_matches[0].start()] + text[p1_matches[0].end() :]
            logger.info("Removed duplicate opener greeting from transcript")

    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


# ---------------------------------------------------------------------------
# Step 2: Parse transcript into speaker turns
# ---------------------------------------------------------------------------

def _parse_transcript(transcript: str) -> list[dict]:
    turns = []
    pattern = r"<(Person[12])>(.*?)</\1>"
    matches = re.findall(pattern, transcript, re.DOTALL)

    speaker_map = {
        "Person1": "Host",
        "Person2": "Guest",
    }

    for person_tag, text in matches:
        clean_text = text.strip()
        # Phonetic spelling so TTS pronounces "Gist" with a soft G
        clean_text = re.sub(r"\bGist\b", "Jist", clean_text)
        if clean_text:
            turns.append({"speaker": speaker_map[person_tag], "text": clean_text})

    logger.info("Parsed %d speaker turns from transcript", len(turns))
    return turns


# ---------------------------------------------------------------------------
# Step 3: Synthesize audio using Gemini 2.5 Flash TTS
# ---------------------------------------------------------------------------

_TTS_VOICE_CONFIG = types.SpeechConfig(
    multi_speaker_voice_config=types.MultiSpeakerVoiceConfig(
        speaker_voice_configs=[
            types.SpeakerVoiceConfig(
                speaker="Host",
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Charon")
                ),
            ),
            types.SpeakerVoiceConfig(
                speaker="Guest",
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Leda")
                ),
            ),
        ]
    )
)


def _synthesize_audio(turns: list[dict]) -> bytes:
    """Synthesize multi-speaker audio, returning MP3 bytes."""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY environment variable is required")

    client = genai.Client(api_key=api_key)

    tts_prompt_lines = [f"{t['speaker']}: {t['text']}" for t in turns]
    full_prompt = "\n".join(tts_prompt_lines)

    MAX_CHARS = 100_000
    with tempfile.TemporaryDirectory() as tmp_dir:
        mp3_path = os.path.join(tmp_dir, "episode.mp3")

        if len(full_prompt) > MAX_CHARS:
            logger.warning("Transcript is %d chars, chunking required", len(full_prompt))
            _synthesize_chunked(client, turns, tmp_dir, mp3_path)
        else:
            logger.info("Sending %d chars to Gemini TTS (%d turns)", len(full_prompt), len(turns))
            response = client.models.generate_content(
                model="gemini-2.5-flash-preview-tts",
                contents=full_prompt,
                config=types.GenerateContentConfig(
                    response_modalities=["AUDIO"],
                    speech_config=_TTS_VOICE_CONFIG,
                ),
            )
            audio_data = response.candidates[0].content.parts[0].inline_data.data
            wav_path = os.path.join(tmp_dir, "episode.wav")
            _save_wav(wav_path, audio_data)
            _convert_to_mp3(wav_path, mp3_path)

        with open(mp3_path, "rb") as f:
            return f.read()


def _synthesize_chunked(client, turns: list[dict], tmp_dir: str, mp3_path: str) -> None:
    chunk_size = 20
    chunks = [turns[i : i + chunk_size] for i in range(0, len(turns), chunk_size)]
    wav_files = []

    for i, chunk in enumerate(chunks):
        logger.info("Synthesizing chunk %d/%d (%d turns)", i + 1, len(chunks), len(chunk))

        prompt = "\n".join(f"{t['speaker']}: {t['text']}" for t in chunk)
        response = client.models.generate_content(
            model="gemini-2.5-flash-preview-tts",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_modalities=["AUDIO"],
                speech_config=_TTS_VOICE_CONFIG,
            ),
        )

        audio_data = response.candidates[0].content.parts[0].inline_data.data
        chunk_wav = os.path.join(tmp_dir, f"chunk{i}.wav")
        _save_wav(chunk_wav, audio_data)
        wav_files.append(chunk_wav)

    # Concatenate all chunks via ffmpeg
    concat_list = os.path.join(tmp_dir, "concat.txt")
    with open(concat_list, "w") as f:
        for wav_file in wav_files:
            f.write(f"file '{wav_file}'\n")

    subprocess.run(
        [
            "ffmpeg", "-y", "-f", "concat", "-safe", "0",
            "-i", concat_list, "-c:a", "libmp3lame", "-q:a", "2", mp3_path,
        ],
        check=True,
        capture_output=True,
    )

    logger.info("Concatenated %d chunks into MP3", len(chunks))


def _save_wav(
    filename: str, pcm_data: bytes, channels: int = 1, rate: int = 24000, sample_width: int = 2
) -> None:
    with wave.open(filename, "wb") as wf:
        wf.setnchannels(channels)
        wf.setsampwidth(sample_width)
        wf.setframerate(rate)
        wf.writeframes(pcm_data)


def _convert_to_mp3(wav_path: str, mp3_path: str) -> None:
    subprocess.run(
        ["ffmpeg", "-y", "-i", wav_path, "-c:a", "libmp3lame", "-q:a", "2", mp3_path],
        check=True,
        capture_output=True,
    )
