"""
Daily Gist Podcast Generator — Pipeline

Pipeline:
1. Claude Sonnet (3 calls: Outline → First Half → Second Half) → transcript
2. Gemini 2.5 Flash TTS → multi-speaker audio
3. ffmpeg → WAV-to-MP3 encoding

Cost per episode:
- Claude Sonnet (transcript): ~$0.05
- Gemini 2.5 Flash TTS (audio): ~$0.20
- Total: ~$0.25/episode

Entry point: generate_podcast(newsletter_text, user_email=None) -> (mp3_bytes, transcript, source_newsletters)
"""

import json
import logging
import os
import re
import subprocess
import tempfile
import time
import wave

import anthropic
from google import genai
from google.genai import types

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def generate_podcast(newsletter_text: str, user_email: str | None = None) -> tuple[bytes, str, list[str]]:
    """Generate a podcast episode from newsletter text.

    Returns (mp3_bytes, transcript, source_newsletters).
    """
    if not newsletter_text.strip():
        raise ValueError("Empty newsletter text")

    logger.info("Step 1/4: Generating outline...")
    outline = _generate_outline(newsletter_text)
    logger.info("Step 1/4 complete: outline has %d segments", len(outline.get("segments", [])))

    if user_email:
        _filter_user_from_sources(outline, user_email)

    logger.info("Step 2/4: Generating first half...")
    first_half = _generate_section(outline, newsletter_text, "first")
    logger.info("Step 2/4 complete: first half %d chars", len(first_half))

    logger.info("Step 3/4: Generating second half...")
    second_half = _generate_section(outline, newsletter_text, "second", previous_turns=first_half)
    logger.info("Step 3/4 complete: second half %d chars", len(second_half))

    logger.info("Step 4/4: Stitching transcript...")
    transcript = _stitch_transcript(first_half, second_half)
    logger.info("Step 4/4 complete: stitched transcript %d chars", len(transcript))

    logger.info("Cleaning transcript...")
    transcript = _clean_transcript(transcript)
    logger.info("Cleaning complete: %d chars", len(transcript))

    logger.info("Parsing transcript into speaker turns...")
    turns = _parse_transcript(transcript)
    if not turns:
        raise RuntimeError("Transcript produced no dialogue turns — cleaned transcript may be empty")
    logger.info("Parsing complete: %d turns", len(turns))

    logger.info("Synthesizing audio with Gemini TTS (%d turns)...", len(turns))
    mp3_bytes = _synthesize_audio(turns)
    logger.info("Synthesis complete: %d bytes MP3", len(mp3_bytes))

    # Extract unique source newsletter names from the outline
    sources = []
    for seg in outline.get("segments", []):
        sources.extend(seg.get("sources", []))
    source_newsletters = list(dict.fromkeys(sources))  # dedupe, preserve order
    logger.info("Source newsletters: %s", source_newsletters)

    return mp3_bytes, transcript, source_newsletters


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _filter_user_from_sources(outline: dict, user_email: str) -> None:
    """Remove the user's own name/email from segment sources in-place.

    Gmail forwarding replaces the From field with the forwarder's name, so
    Claude's outline may list the user as a "source newsletter".  We strip
    those entries so the outro and returned source list are accurate.
    """
    user_name = user_email.lower().split("@")[0]
    user_name_normalized = re.sub(r"[.\-_]", "", user_name)
    email_lower = user_email.lower()

    for seg in outline.get("segments", []):
        seg["sources"] = [
            s for s in seg.get("sources", [])
            if email_lower not in s.lower()
            and re.sub(r"[.\-_\s]", "", s.lower()) != user_name_normalized
        ]

    logger.info("Filtered user '%s' from outline sources", user_email)


# ---------------------------------------------------------------------------
# Step 1: Generate transcript using 3-call Claude pipeline
# ---------------------------------------------------------------------------

_CLAUDE_MODEL = "claude-sonnet-4-20250514"

_DIALOGUE_SYSTEM_PROMPT = """\
You are writing dialogue for Daily Gist, a two-host podcast that summarizes newsletters.

Rules:
- Output ONLY dialogue in <Person1> and <Person2> tags. Nothing else.
- No scratchpad, thinking blocks, stage directions, or meta-commentary.
- Person1 is the main summarizer. Person2 is the curious questioner.
- Vary conversational style: sometimes debate, sometimes one explains while the other \
reacts, sometimes they build on each other's ideas.
- Hosts should occasionally disagree or push back on each other's takes, not just agree. \
Real conversations have friction.
- Draw unexpected connections between seemingly unrelated stories — discover them in \
conversation rather than stating them explicitly.
- Include at least one hot take that challenges conventional wisdom.
- Avoid repetitive transitions like "Speaking of which" or "Let's shift gears."
- BANNED phrases (never use these): "great point", "exactly!", "that's so true", \
"you're not kidding", "absolutely!", "I'm buzzing", "I'm so excited", "what a day"
- Balance coverage — no single source > 30% of the conversation.
- NEVER restate the same insight, stat, or example — even in different words. If a point was \
made once, it's done. Listeners notice repetition immediately and it kills momentum.
- Skip sponsored content, ads, and promotional/referral sections.
- Weave cross-source connections into the dialogue naturally — let them emerge through \
conversation rather than listing them.
- Use engagement techniques: rhetorical questions, analogies, real-world examples, humor, \
surprising facts."""


_CLAUDE_MAX_RETRIES = 3
_CLAUDE_RETRY_DELAY = 15  # seconds — Tier 2 rate limits are more generous


def _get_claude_client() -> anthropic.Anthropic:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY environment variable is required")
    return anthropic.Anthropic(api_key=api_key, max_retries=0)  # we handle retries ourselves


def _claude_create_with_retry(client: anthropic.Anthropic, **kwargs) -> anthropic.types.Message:
    """Call client.messages.create with retry on 429 rate limit errors."""
    for attempt in range(_CLAUDE_MAX_RETRIES):
        try:
            return client.messages.create(**kwargs)
        except anthropic.RateLimitError:
            if attempt == _CLAUDE_MAX_RETRIES - 1:
                raise
            logger.warning(
                "Claude 429 rate limit hit, waiting %ds before retry %d/%d",
                _CLAUDE_RETRY_DELAY, attempt + 1, _CLAUDE_MAX_RETRIES,
            )
            time.sleep(_CLAUDE_RETRY_DELAY)
    raise RuntimeError("Unreachable")


def _generate_outline(newsletter_text: str) -> dict:
    """Call 1: Generate a structured outline from newsletter content."""
    client = _get_claude_client()

    response = _claude_create_with_retry(
        client,
        model=_CLAUDE_MODEL,
        max_tokens=2048,
        system="You are a podcast producer planning an episode of Daily Gist, a two-host podcast that summarizes newsletters.",
        messages=[
            {
                "role": "user",
                "content": f"""\
Analyze these newsletters and produce a JSON outline for a podcast episode.

<newsletters>
{newsletter_text}
</newsletters>

Requirements:
- 6-8 segments, ordered by importance/interest
- Merge overlapping stories across newsletters into single segments
- Target 35-45 total estimated turns across all segments
- Skip ads, sponsor mentions, and referral/promotional content
- Each segment should have enough substance for a meaningful discussion
- Prioritize stories with unique insights or provocative angles over stories that are just big numbers or straightforward announcements
- Ensure every source newsletter gets at least a mention, but weight coverage by story impact and broad relevance

Return ONLY valid JSON (no markdown fencing) in this exact format:
{{
  "intro_hook": "One compelling sentence to open the show",
  "segments": [
    {{
      "title": "Segment title",
      "sources": ["Newsletter names that cover this topic"],
      "key_points": ["Point 1", "Point 2", "Point 3"],
      "estimated_turns": 6
    }}
  ],
  "cross_source_connections": [
    "Tension, contradiction, or surprising link between stories from different newsletters"
  ],
  "provocative_angles": [
    "Hot take or counterintuitive observation the hosts could explore"
  ],
  "outro_theme": "Brief thematic thread connecting today's stories"
}}""",
            }
        ],
    )

    raw = response.content[0].text.strip()
    # Strip markdown fencing if present
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)

    outline = json.loads(raw)

    segment_count = len(outline.get("segments", []))
    total_turns = sum(s.get("estimated_turns", 0) for s in outline.get("segments", []))
    logger.info(
        "Outline generated: %d segments, %d estimated turns",
        segment_count, total_turns,
    )

    return outline


def _generate_section(
    outline: dict,
    newsletter_text: str,
    section: str,
    previous_turns: str | None = None,
) -> str:
    """Call 2 or 3: Generate dialogue for the first or second half."""
    client = _get_claude_client()

    segments = outline.get("segments", [])
    midpoint = len(segments) // 2

    if section == "first":
        segment_slice = segments[:midpoint]
        section_instruction = (
            f"Write dialogue covering the INTRO and these segments:\n"
            f"{json.dumps(segment_slice, indent=2)}\n\n"
            f"Person1's first line MUST begin with exactly: \"Welcome to Daily Gist — your "
            f"newsletters, distilled into conversation!\" then flow naturally into the episode's "
            f"hook. Example: 'Welcome to Daily Gist — your newsletters, distilled into "
            f"conversation! Today we're diving into...' "
            f"Hook to weave in: \"{outline.get('intro_hook', '')}\"\n"
            f"Do NOT write an outro or sign-off. End mid-conversation, ready to continue."
        )
    else:
        segment_slice = segments[midpoint:]
        continuity_context = ""
        if previous_turns:
            # Extract last 3-4 turns for tone continuity
            tags = re.findall(r"<Person[12]>.*?</Person[12]>", previous_turns, re.DOTALL)
            last_turns = tags[-4:] if len(tags) >= 4 else tags
            continuity_context = (
                "Here are the last few turns from the first half — continue naturally from this tone:\n"
                + "\n".join(last_turns)
                + "\n\n"
            )
        connections = outline.get("cross_source_connections", [])
        connections_context = ""
        if connections:
            connections_context = (
                "Cross-source connections to weave into the dialogue naturally "
                "(don't list these — let them emerge through conversation):\n"
                + json.dumps(connections, indent=2)
                + "\n\n"
            )

        section_instruction = (
            f"{continuity_context}"
            f"{connections_context}"
            f"Write dialogue covering these remaining segments:\n"
            f"{json.dumps(segment_slice, indent=2)}\n\n"
            f"Continue naturally from where the first half left off.\n"
            f"Tie stories together rather than covering remaining segments in isolation.\n"
            f"IMPORTANT: Do NOT repeat any insight, stat, or example that was already covered "
            f"in the first half. If a point was made, move on — find a new angle or skip it.\n"
            f"You MUST end with a complete outro in this exact order:\n"
            f"1. Person2 credits the sources conversationally: \"Today's episode was brought to "
            f"you by {', '.join(dict.fromkeys(s for seg in segments for s in seg.get('sources', [])))}.\"\n"
            f"2. Then Person1 signs off with something like: \"That's your Daily Gist for today\" and a friendly farewell.\n"
            f"Thematic thread for the outro: \"{outline.get('outro_theme', '')}\""
        )

    response = _claude_create_with_retry(
        client,
        model=_CLAUDE_MODEL,
        max_tokens=16384,
        system=_DIALOGUE_SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": f"""\
Here is the episode outline:
{json.dumps(outline, indent=2)}

Here are the source newsletters:
<newsletters>
{newsletter_text}
</newsletters>

{section_instruction}

Target: 2000-2500 words of dialogue. Output ONLY <Person1> and <Person2> tagged dialogue.""",
            }
        ],
    )

    result = response.content[0].text.strip()
    word_count = len(result.split())
    logger.info("Section '%s' generated: %d words", section, word_count)

    return result


def _stitch_transcript(first_half: str, second_half: str) -> str:
    """Combine the two halves into a single transcript."""
    transcript = first_half.rstrip() + "\n\n" + second_half.lstrip()
    word_count = len(transcript.split())
    logger.info("Stitched transcript: %d words total", word_count)

    # Safety net: detect truncation
    stripped = transcript.rstrip()
    if not stripped.endswith("</Person1>") and not stripped.endswith("</Person2>"):
        logger.error(
            "TRANSCRIPT TRUNCATED — does not end with a closing Person tag. "
            "Last 200 chars: %s",
            stripped[-200:],
        )

    return transcript


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


_TTS_MAX_RETRIES = 3
_TTS_RETRY_DELAYS = [5, 15, 30]  # seconds


def _tts_generate(client, prompt: str, label: str = "TTS") -> bytes:
    """Call Gemini TTS with retries on server errors. Returns raw PCM bytes."""
    for attempt in range(_TTS_MAX_RETRIES):
        try:
            response = client.models.generate_content(
                model="gemini-2.5-flash-preview-tts",
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_modalities=["AUDIO"],
                    speech_config=_TTS_VOICE_CONFIG,
                ),
            )
            return response.candidates[0].content.parts[0].inline_data.data
        except Exception as e:
            is_server_error = "500" in str(e) or "INTERNAL" in str(e) or "503" in str(e)
            if not is_server_error or attempt == _TTS_MAX_RETRIES - 1:
                raise
            delay = _TTS_RETRY_DELAYS[attempt]
            logger.warning(
                "%s attempt %d/%d failed (server error), retrying in %ds: %s",
                label, attempt + 1, _TTS_MAX_RETRIES, delay, e,
            )
            time.sleep(delay)
    raise RuntimeError("Unreachable")  # satisfies type checker


def _synthesize_audio(turns: list[dict]) -> bytes:
    """Synthesize multi-speaker audio, returning MP3 bytes."""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY environment variable is required")

    client = genai.Client(api_key=api_key)

    tts_prompt_lines = [f"{t['speaker']}: {t['text']}" for t in turns]
    full_prompt = "\n".join(tts_prompt_lines)

    MAX_CHARS = 100_000
    CHUNK_THRESHOLD = 10  # Always chunk if more than this many turns

    with tempfile.TemporaryDirectory() as tmp_dir:
        mp3_path = os.path.join(tmp_dir, "episode.mp3")

        logger.info(
            "TTS input: %d turns, %d chars total",
            len(turns), len(full_prompt),
        )

        if len(full_prompt) > MAX_CHARS or len(turns) > CHUNK_THRESHOLD:
            logger.info(
                "Chunking required — %d chars, %d turns (thresholds: %d chars, %d turns)",
                len(full_prompt), len(turns), MAX_CHARS, CHUNK_THRESHOLD,
            )
            _synthesize_chunked(client, turns, tmp_dir, mp3_path)
        else:
            logger.info("Single-shot TTS: %d chars, %d turns", len(full_prompt), len(turns))
            audio_data = _tts_generate(client, full_prompt, label="Single-shot TTS")
            logger.info("Single-shot TTS returned %d bytes of audio", len(audio_data))
            wav_path = os.path.join(tmp_dir, "episode.wav")
            _save_wav(wav_path, audio_data)
            _convert_to_mp3(wav_path, mp3_path)

        mp3_size = os.path.getsize(mp3_path)
        logger.info("Final MP3: %d bytes (%.1f MB)", mp3_size, mp3_size / 1_048_576)

        with open(mp3_path, "rb") as f:
            return f.read()


def _synthesize_chunked(client, turns: list[dict], tmp_dir: str, mp3_path: str) -> None:
    chunk_size = 20
    chunks = [turns[i : i + chunk_size] for i in range(0, len(turns), chunk_size)]
    wav_files = []

    logger.info("Splitting %d turns into %d chunks (chunk_size=%d)", len(turns), len(chunks), chunk_size)

    for i, chunk in enumerate(chunks):
        prompt = "\n".join(f"{t['speaker']}: {t['text']}" for t in chunk)
        logger.info(
            "Synthesizing chunk %d/%d: %d turns, %d chars",
            i + 1, len(chunks), len(chunk), len(prompt),
        )

        audio_data = _tts_generate(client, prompt, label=f"Chunk {i + 1}/{len(chunks)}")
        logger.info("Chunk %d/%d: received %d bytes of audio", i + 1, len(chunks), len(audio_data))
        chunk_wav = os.path.join(tmp_dir, f"chunk{i}.wav")
        _save_wav(chunk_wav, audio_data)
        wav_files.append(chunk_wav)

    logger.info("All %d chunks synthesized, concatenating into MP3...", len(wav_files))

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
