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

import concurrent.futures
import json
import logging
import os
import re
import subprocess
import tempfile
import threading
import time
import wave


from google import genai
from google.genai import types
from pydub import AudioSegment

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

_DEFAULT_LENGTH_MINUTES = 10
_WORDS_PER_MINUTE = 170  # typical spoken pace


def generate_podcast(
    newsletter_text: str,
    user_email: str | None = None,
    on_progress: "callable | None" = None,
    target_length_minutes: int = _DEFAULT_LENGTH_MINUTES,
    intro_music: str | None = None,
) -> tuple[bytes, str, list[str]]:
    """Generate a podcast episode from newsletter text.

    Returns (mp3_bytes, transcript, source_newsletters).
    on_progress is called with a stage name string at each pipeline step.
    target_length_minutes controls how long the episode should be (~10-25 min).
    """
    if not newsletter_text.strip():
        raise ValueError("Empty newsletter text")

    # Calculate per-section word target from desired episode length
    total_words = target_length_minutes * _WORDS_PER_MINUTE
    words_per_section = total_words // 2
    logger.info(
        "Target: %d min episode → %d total words, %d per section",
        target_length_minutes, total_words, words_per_section,
    )

    def _report(stage: str):
        if on_progress:
            try:
                on_progress(stage)
            except Exception:
                logger.warning("on_progress callback failed for stage=%s", stage, exc_info=True)

    logger.info("Script model: %s", _SCRIPT_MODEL)

    # Extract known newsletter names from the input headers
    known_sources = re.findall(r"^--- Newsletter: (.+?) ---$", newsletter_text, re.MULTILINE)
    known_sources = list(dict.fromkeys(known_sources))  # dedupe, preserve order
    logger.info("Known newsletter sources: %s", known_sources)

    _report("outline")
    logger.info("Step 1/4: Generating outline...")

    outline = _generate_outline_gemini(newsletter_text, _SCRIPT_MODEL, known_sources=known_sources)

    logger.info("Step 1/4 complete: outline has %d segments", len(outline.get("segments", [])))

    if user_email:
        _filter_user_from_sources(outline, user_email)

    _report("first_half")
    logger.info("Step 2/4: Generating first half...")

    first_half = _generate_section_gemini(outline, newsletter_text, "first", _SCRIPT_MODEL, words_per_section=words_per_section)

    logger.info("Step 2/4 complete: first half %d chars", len(first_half))

    _report("second_half")
    logger.info("Step 3/4: Generating second half...")

    second_half = _generate_section_gemini(outline, newsletter_text, "second", _SCRIPT_MODEL, previous_turns=first_half, words_per_section=words_per_section)

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

    _report("audio")
    logger.info("Synthesizing audio with Gemini TTS (%d turns)...", len(turns))
    mp3_bytes = _synthesize_audio(turns, intro_music=intro_music, on_progress=on_progress)
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
# Step 1: Generate transcript using 3-call Gemini pipeline
# ---------------------------------------------------------------------------

_SCRIPT_MODEL = "gemini-3-flash-preview"

_DIALOGUE_RULES = """\
- Person1 is the main summarizer. Person2 is the curious questioner.
-Each host should have a distinct rhetorical style. One host tends toward vivid \
metaphors and narrative. The other is more data-driven and blunt. \
-Neither relies on formulaic sentence patterns.\
- Vary conversational style: sometimes debate, sometimes one explains while the other \
reacts, sometimes they build on each other's ideas.

DISAGREEMENT — The hosts should NOT disagree on every topic. Disagreement is a tool, not \
a structure. Use it sparingly — only when the material genuinely supports two reasonable \
interpretations or when one host has distinct expertise that leads them to a different conclusion.
Most of the time, the hosts should:
  - Build on each other's points
  - Ask genuine questions to draw out more detail
  - Agree and move forward when there's no real tension
  - Share enthusiasm together when something is genuinely interesting
When they do disagree, it should feel earned — rooted in the actual content, not manufactured \
for drama. Avoid reflexive contrarianism where Person2 simply takes the opposite stance of \
whatever Person1 just said.
A natural conversation has rhythm: agreement, elaboration, curiosity, occasional disagreement, \
shared jokes. Not a debate club format where every statement must be challenged.

PERSON2 FILLER BAN — Person2 must NEVER open a turn with a generic reaction phrase. \
BANNED openers: "That's a chilling thought", "That's an astronomical figure", \
"That's a head-scratcher", "That's a rare sight", "That's a stark term", \
"That really hits home", "I can only imagine", any variation of "That's a [adjective] [noun]". \
Instead, Person2 should respond with a SPECIFIC follow-up thought, a challenge, a \
counterexample, or a question that pushes the conversation forward. Person2's first words \
should add substance, not validate.
  Bad: generic validation ("That's an astronomical figure. It really underscores...")
  Good: a specific follow-up that challenges, contextualizes, or questions the claim.

- Draw unexpected connections between seemingly unrelated stories — discover them in \
conversation rather than stating them explicitly.
- Include at least one hot take that challenges conventional wisdom.
- TRANSITIONS: Each segment must connect to the previous one thematically. Find the tension, \
irony, or surprising link between adjacent topics. Never use generic transitions — let one \
topic's implications lead naturally into the next.

BANNED PHRASES AND PATTERNS — these sound AI-generated, never use them:
  "great point", "exactly!" (as standalone), "that's so true", "you're not kidding", \
  "absolutely!" (as standalone), "I'm buzzing", "I'm so excited", "what a day", \
  "a fair point", "it's genuinely X", \
  "I don't know if it's X or Y, probably both", "and speaking of..." (as a transition), \
  "that raises huge questions about...", "it really underscores...", \
  "it's a fascinating [noun]", "speaking of which", "let's shift gears".
  Do NOT start consecutive Person2 turns with "So...".
  Vary sentence openings. Vary rhetorical structures. If you catch yourself falling into \
  a pattern, break it.

- Balance coverage — no single source > 30% of the conversation.
- NEVER restate the same insight, stat, or example — even in different words. If a point was \
made once, it's done. Listeners notice repetition immediately and it kills momentum.
- Avoid overusing filler words like 'genuinely', 'essentially', 'literally', 'incredibly'. \
Each should appear at most once per episode.
- Avoid redefining concepts through negation-then-correction patterns (e.g. 'this isn't X, \
it's Y'). Instead, make direct assertions.
- Hosts should never refer to themselves or each other by name, speaker label, or tag. \
No "I'm Person1" or "as Person2 said" — they are unnamed co-hosts.
- Skip sponsored content, ads, and promotional/referral sections.
- Weave cross-source connections into the dialogue naturally — let them emerge through \
conversation rather than listing them.
- Use engagement techniques: rhetorical questions, analogies, real-world examples, humor, \
surprising facts.

MEMORABLE ONE-LINERS — Each half needs at least 2 lines that are genuinely quotable — the \
kind of line someone would screenshot and share. Techniques:
  - Unexpected metaphors with concrete specifics — avoid cliches like "house of cards" \
and instead invent original comparisons drawn from the story's details
  - Crystallize a complex situation into one sharp, original sentence
  - Reframe what something actually means in a way that reveals the absurdity or irony
  Generic observations like "that raises ethical questions" are NOT one-liners.

- Person1 MUST deliver the final outro/sign-off. Person1 is the anchor of the show and should \
always open and close the episode."""

_DIALOGUE_SYSTEM_PROMPT = f"""\
You are writing dialogue for Daily Gist, a two-host podcast that summarizes newsletters.

Rules:
- Output ONLY a JSON array of dialogue turns. Each turn has "speaker" and "text".
- No scratchpad, thinking blocks, stage directions, or meta-commentary.
{_DIALOGUE_RULES}"""


_GEMINI_TEXT_MAX_RETRIES = 3
_GEMINI_TEXT_RETRY_DELAYS = [5, 15, 30]


def _get_gemini_text_client() -> genai.Client:
    """Create a Gemini client for text generation via AI Studio."""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY environment variable is required")
    return genai.Client(api_key=api_key)


def _gemini_create_with_retry(
    client: genai.Client, model: str, system: str, prompt: str,
    max_tokens: int = 8192, response_schema: dict | None = None,
) -> str:
    """Call Gemini text generation with retry on server errors. Returns text."""
    for attempt in range(_GEMINI_TEXT_MAX_RETRIES):
        try:
            config = types.GenerateContentConfig(
                system_instruction=system,
                max_output_tokens=max_tokens,
                temperature=1.0,
            )
            if response_schema is not None:
                config.response_mime_type = "application/json"
                config.response_schema = response_schema
            response = client.models.generate_content(
                model=model,
                contents=prompt,
                config=config,
            )
            return response.text.strip()
        except Exception as e:
            err_str = str(e).lower()
            is_retryable = any(s in err_str for s in ("429", "500", "503", "internal", "timeout", "rate", "disconnected"))
            if not is_retryable or attempt == _GEMINI_TEXT_MAX_RETRIES - 1:
                raise
            delay = _GEMINI_TEXT_RETRY_DELAYS[attempt]
            logger.warning(
                "Gemini %s attempt %d/%d failed (%s), retrying in %ds",
                model, attempt + 1, _GEMINI_TEXT_MAX_RETRIES, type(e).__name__, delay,
            )
            time.sleep(delay)
    raise RuntimeError("Unreachable")


_OUTLINE_SYSTEM_PROMPT = "You are a podcast producer planning an episode of Daily Gist, a two-host podcast that summarizes newsletters."


def _fix_gemini_json(text: str) -> str:
    """Best-effort fixups for common Gemini JSON issues.

    Handles: trailing commas, JS-style comments, single-quoted strings.
    """
    # Remove single-line JS comments (// ...)
    text = re.sub(r"//[^\n]*", "", text)
    # Remove multi-line JS comments (/* ... */)
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.DOTALL)
    # Trailing commas before } and ]
    text = re.sub(r",\s*([}\]])", r"\1", text)
    # Single-quoted strings → double-quoted (only outside existing double quotes)
    # This is a rough heuristic: replace ' with " when it looks like a JSON string boundary
    text = re.sub(r"(?<=[\[,{:\s])'((?:[^'\\]|\\.)*?)'(?=\s*[,\]}:])", r'"\1"', text)
    return text


_OUTLINE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "intro_hook": {"type": "STRING"},
        "segments": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "title": {"type": "STRING"},
                    "sources": {"type": "ARRAY", "items": {"type": "STRING"}},
                    "key_points": {"type": "ARRAY", "items": {"type": "STRING"}},
                    "estimated_turns": {"type": "INTEGER"},
                },
                "required": ["title", "sources", "key_points", "estimated_turns"],
            },
        },
        "cross_source_connections": {"type": "ARRAY", "items": {"type": "STRING"}},
        "provocative_angles": {"type": "ARRAY", "items": {"type": "STRING"}},
        "outro_theme": {"type": "STRING"},
    },
    "required": ["intro_hook", "segments", "cross_source_connections", "provocative_angles", "outro_theme"],
}


def _generate_outline_gemini(newsletter_text: str, model_id: str, known_sources: list[str] | None = None) -> dict:
    """Call 1 (Gemini): Generate a structured outline from newsletter content."""
    client = _get_gemini_text_client()

    source_constraint = ""
    if known_sources:
        source_list = ", ".join(f'"{s}"' for s in known_sources)
        source_constraint = (
            f"\n- IMPORTANT: The only valid source names are: [{source_list}]. "
            f"Use ONLY these exact names in the \"sources\" arrays. Do not invent, "
            f"abbreviate, or guess newsletter names."
        )

    prompt = f"""\
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
- Ensure every source newsletter gets at least a mention, but weight coverage by story impact and broad relevance{source_constraint}"""

    raw = _gemini_create_with_retry(
        client, model_id, _OUTLINE_SYSTEM_PROMPT, prompt,
        max_tokens=8192, response_schema=_OUTLINE_SCHEMA,
    )

    try:
        outline = json.loads(raw)
    except json.JSONDecodeError:
        logger.error("Gemini outline JSON parse failed. Raw response:\n%s", raw)
        raise

    segment_count = len(outline.get("segments", []))
    total_turns = sum(s.get("estimated_turns", 0) for s in outline.get("segments", []))
    logger.info(
        "Outline generated (%s): %d segments, %d estimated turns",
        model_id, segment_count, total_turns,
    )

    return outline


_DIALOGUE_TURN_SCHEMA = {
    "type": "ARRAY",
    "items": {
        "type": "OBJECT",
        "properties": {
            "speaker": {"type": "STRING", "enum": ["Person1", "Person2"]},
            "text": {"type": "STRING"},
        },
        "required": ["speaker", "text"],
    },
}


def _turns_json_to_xml(turns: list[dict]) -> str:
    """Convert JSON dialogue turns to XML-tagged transcript string."""
    parts = []
    for turn in turns:
        speaker = turn["speaker"]
        text = turn["text"].strip()
        if text:
            parts.append(f"<{speaker}>{text}</{speaker}>")
    return "\n".join(parts)


def _xml_to_json_str(xml_text: str) -> str:
    """Convert XML-tagged dialogue back to a JSON array string.

    Used to pass the first half to Gemini's second-half call in the same
    JSON format that Gemini outputs, avoiding XML/JSON format confusion.
    """
    turns = []
    for match in re.finditer(r"<(Person[12])>(.*?)</\1>", xml_text, re.DOTALL):
        turns.append({"speaker": match.group(1), "text": match.group(2).strip()})
    return json.dumps(turns, indent=2)


def _generate_section_gemini(
    outline: dict,
    newsletter_text: str,
    section: str,
    model_id: str,
    previous_turns: str | None = None,
    words_per_section: int = 1250,
) -> str:
    """Call 2 or 3 (Gemini): Generate dialogue for the first or second half."""
    client = _get_gemini_text_client()

    segments = outline.get("segments", [])
    midpoint = len(segments) // 2

    if section == "first":
        segment_slice = segments[:midpoint]
        section_instruction = (
            f"Write dialogue covering the INTRO and these segments:\n"
            f"{json.dumps(segment_slice, indent=2)}\n\n"
            f"INTRO FORMAT (strict):\n"
            f"- Person1's first turn: Welcome line + ONE short teaser sentence (40 words max total).\n"
            f"- Person2's first turn: Immediate reaction or question.\n"
            f"- Then they unpack the hook together.\n"
            f"Person1's turn MUST begin with: \"Welcome to Daily Gist — your newsletters, distilled "
            f"into conversation!\"\n"
            f"Hook to weave in: \"{outline.get('intro_hook', '')}\"\n"
            f"Do NOT write an outro or sign-off. End mid-conversation, ready to continue."
        )
    else:
        segment_slice = segments[midpoint:]
        continuity_context = ""
        if previous_turns:
            # Convert XML to JSON format so Gemini sees the same format it outputs
            previous_as_json = _xml_to_json_str(previous_turns)
            previous_turns_list = json.loads(previous_as_json)
            last_turn = previous_turns_list[-1] if previous_turns_list else None

            # Determine who should speak first in the second half
            if last_turn:
                next_speaker = "Person2" if last_turn["speaker"] == "Person1" else "Person1"
                handoff = (
                    f"\nThe first half ENDS with this turn:\n"
                    f"  {last_turn['speaker']}: \"{last_turn['text']}\"\n\n"
                    f"Your FIRST turn must be {next_speaker} responding to this — "
                    f"do NOT repeat, rephrase, or echo any part of {last_turn['speaker']}'s last line above.\n\n"
                )
            else:
                handoff = ""

            continuity_context = (
                "Here is the FULL first half of the episode that has already been recorded "
                "(as a JSON array of dialogue turns):\n"
                + previous_as_json
                + "\n\n"
                "CRITICAL — DO NOT REPEAT THE FIRST HALF:\n"
                "- Your output must contain ONLY NEW dialogue. Do NOT include any turns from above.\n"
                "- Do NOT start with a welcome, intro, or greeting — the episode is already underway.\n"
                "- Do NOT re-introduce topics, re-state stats, or re-explain stories from the first half.\n"
                "- Brief callbacks are fine (e.g. \"going back to what we said about...\") but "
                "only to connect to genuinely new material.\n"
                "- Listeners have already heard the first half. Treat it as recorded and aired.\n"
                + handoff
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

        source_names = ', '.join(dict.fromkeys(s for seg in segments for s in seg.get('sources', [])))
        section_instruction = (
            f"{continuity_context}"
            f"{connections_context}"
            f"Write dialogue covering these remaining segments:\n"
            f"{json.dumps(segment_slice, indent=2)}\n\n"
            f"Continue naturally from where the first half left off. Do NOT start with a welcome or intro.\n"
            f"Tie stories together rather than covering remaining segments in isolation.\n\n"
            f"PACING: Give remaining stories proportional depth. Do NOT speed-run through stories "
            f"as a rapid-fire list. Every story that made it into the outline deserves at least 2-3 "
            f"exchanges of real discussion, not a single mention-and-move-on. If there are too many "
            f"remaining stories to cover with depth, CUT the least important ones entirely rather than "
            f"giving all of them shallow treatment. Depth over breadth. Quality over completeness.\n\n"
            f"CRITICAL — OUTRO REQUIREMENT:\n"
            f"The VERY LAST turn in your output MUST be Person1 signing off. This is non-negotiable.\n"
            f"The sign-off turn must include:\n"
            f"- A brief thematic wrap-up (theme: \"{outline.get('outro_theme', '')}\")\n"
            f"- That's your Daily Gist for today \n"
            f"- Credit the sources naturally: {source_names}\n"
            f"- A friendly farewell\n"
            f"In the closing attribution, list ONLY the newsletter names that appear in the source "
            f"material provided. Do not invent or assume additional sources. If you cannot identify "
            f"a newsletter's name from the email, omit it from the attribution rather than guessing.\n"
            f"If you do not end with Person1's sign-off, the episode will be broken."
        )

    prompt = f"""\
Here is the episode outline:
{json.dumps(outline, indent=2)}

Here are the source newsletters:
<newsletters>
{newsletter_text}
</newsletters>

{section_instruction}

Target: {words_per_section} words of dialogue.
Return a JSON array of dialogue turns. Each turn has "speaker" (Person1 or Person2) and "text"."""

    result = _gemini_create_with_retry(
        client, model_id, _DIALOGUE_SYSTEM_PROMPT, prompt,
        max_tokens=16384, response_schema=_DIALOGUE_TURN_SCHEMA,
    )

    # Parse JSON turns and convert to XML string for downstream compatibility
    try:
        turns = json.loads(result)
    except json.JSONDecodeError:
        logger.error("Gemini section JSON parse failed. Raw response:\n%s", result)
        raise

    xml_result = _turns_json_to_xml(turns)
    word_count = len(xml_result.split())
    logger.info("Section '%s' generated (%s): %d turns, %d words", section, model_id, len(turns), word_count)

    return xml_result


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


def _fix_unclosed_tags(text: str) -> str:
    """Close unclosed <Person1>/<Person2> tags.

    Some models (e.g. Gemini Flash Lite) output tags without closing them:
      <Person1>\ntext\n<Person2>\ntext
    This converts them to proper:
      <Person1>text</Person1>\n<Person2>text</Person2>
    """
    # Check if there are already properly closed tags — if so, skip
    if re.search(r"</Person[12]>", text):
        return text

    # Pattern: <PersonN> followed by text until next <PersonN> or end
    parts = re.split(r"(<Person[12]>)", text)
    result = []
    current_tag = None
    for part in parts:
        tag_match = re.match(r"<(Person[12])>", part)
        if tag_match:
            if current_tag:
                result.append(f"</{current_tag}>")
            result.append(part)
            current_tag = tag_match.group(1)
        else:
            result.append(part)
    if current_tag:
        result.append(f"</{current_tag}>")

    fixed = "".join(result)
    logger.info("Fixed unclosed Person tags in transcript")
    return fixed


def _clean_transcript(raw: str) -> str:
    """Remove LLM artifacts from a Podcastfy transcript."""
    text = raw

    # Fix unclosed tags (Gemini models may omit closing tags)
    text = _fix_unclosed_tags(text)

    # Fix mismatched closing tags: <Person1>...</Person2> → <Person1>...</Person1>
    # Gemini Flash sometimes closes with the wrong speaker tag. The parser uses
    # a backreference so mismatched tags get silently dropped, losing turns.
    mismatched = len(re.findall(r"<(Person[12])>.*?</Person(?!\1)[12]>", text, re.DOTALL))
    if mismatched:
        text = re.sub(r"<(Person[12])>(.*?)</Person[12]>", r"<\1>\2</\1>", text, flags=re.DOTALL)
        logger.info("Fixed %d mismatched Person closing tags", mismatched)

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

    # Deduplicate overlapping turns at stitch boundary
    # When the second half echoes the last turn of the first half, we get
    # consecutive same-speaker turns with overlapping text.
    all_turns = list(re.finditer(r"<(Person[12])>(.*?)</\1>", text, re.DOTALL))
    for i in range(len(all_turns) - 1):
        curr = all_turns[i]
        nxt = all_turns[i + 1]
        if curr.group(1) != nxt.group(1):
            continue  # different speakers
        curr_text = curr.group(2).strip()
        next_text = nxt.group(2).strip()
        # Find longest suffix of curr_text that's a prefix of next_text
        _MIN_OVERLAP = 50
        max_check = min(len(curr_text), len(next_text))
        overlap = 0
        for length in range(max_check, _MIN_OVERLAP - 1, -1):
            if curr_text[-length:] == next_text[:length]:
                overlap = length
                break
        if overlap >= _MIN_OVERLAP:
            trimmed = next_text[overlap:].lstrip()
            if trimmed:
                old = nxt.group(0)
                new = f"<{nxt.group(1)}>{trimmed}</{nxt.group(1)}>"
                text = text.replace(old, new, 1)
                logger.info("Trimmed %d chars of stitch overlap from consecutive %s turns", overlap, nxt.group(1))
            else:
                text = text.replace(nxt.group(0), "", 1)
                logger.info("Removed fully duplicate %s turn at stitch boundary", nxt.group(1))
            break  # only fix one boundary

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


def _get_tts_client() -> genai.Client:
    """Create a Gemini client for TTS via AI Studio."""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY environment variable is required")
    return genai.Client(
        api_key=api_key,
        http_options=types.HttpOptions(timeout=_TTS_TIMEOUT_MS),
    )


_TTS_TIMEOUT_MS = 180_000  # 3 minutes — typical chunk takes ~1.5 min, some take longer


_TTS_HARD_TIMEOUT_S = _TTS_TIMEOUT_MS // 1000  # hard Python-level kill


def _tts_generate(client: genai.Client, prompt: str, label: str = "TTS") -> bytes:
    """Call Gemini TTS via Vertex AI with retries on server/connection errors. Returns raw PCM bytes."""
    for attempt in range(_TTS_MAX_RETRIES):
        try:
            # Hard Python-level timeout — the HTTP-level timeout on the client
            # doesn't always fire when Vertex AI hangs mid-stream.
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                future = pool.submit(
                    client.models.generate_content,
                    model="gemini-2.5-flash-preview-tts",
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        response_modalities=["AUDIO"],
                        speech_config=_TTS_VOICE_CONFIG,
                    ),
                )
                response = future.result(timeout=_TTS_HARD_TIMEOUT_S)
            return response.candidates[0].content.parts[0].inline_data.data
        except concurrent.futures.TimeoutError:
            logger.warning(
                "%s attempt %d/%d hard-timed out after %ds",
                label, attempt + 1, _TTS_MAX_RETRIES, _TTS_HARD_TIMEOUT_S,
            )
            if attempt == _TTS_MAX_RETRIES - 1:
                raise TimeoutError(f"{label} timed out after {_TTS_MAX_RETRIES} attempts")
            delay = _TTS_RETRY_DELAYS[attempt]
            logger.info("Retrying in %ds...", delay)
            time.sleep(delay)
        except Exception as e:
            err_str = str(e).lower()
            is_retryable = (
                "429" in err_str
                or "500" in err_str
                or "503" in err_str
                or "internal" in err_str
                or "rate" in err_str
                or "resource_exhausted" in err_str
                or "disconnected" in err_str
                or "timeout" in err_str
                or "timed out" in err_str
            )
            if not is_retryable or attempt == _TTS_MAX_RETRIES - 1:
                raise
            delay = _TTS_RETRY_DELAYS[attempt]
            logger.warning(
                "%s attempt %d/%d failed (%s), retrying in %ds",
                label, attempt + 1, _TTS_MAX_RETRIES, type(e).__name__, delay,
            )
            time.sleep(delay)
    raise RuntimeError("Unreachable")


def _synthesize_audio(turns: list[dict], intro_music: str | None = None, on_progress: "callable | None" = None) -> bytes:
    """Synthesize multi-speaker audio, returning MP3 bytes."""
    client = _get_tts_client()

    total_chars = sum(len(t["text"]) for t in turns)
    CHUNK_THRESHOLD = 10  # Always chunk if more than this many turns

    with tempfile.TemporaryDirectory() as tmp_dir:
        mp3_path = os.path.join(tmp_dir, "episode.mp3")

        logger.info(
            "TTS input: %d turns, %d chars total",
            len(turns), total_chars,
        )

        if len(turns) > CHUNK_THRESHOLD:
            logger.info(
                "Chunking required — %d chars, %d turns (threshold: %d turns)",
                total_chars, len(turns), CHUNK_THRESHOLD,
            )
            _synthesize_chunked(client, turns, tmp_dir, mp3_path, on_progress=on_progress)
        else:
            prompt = "\n".join(f"{t['speaker']}: {t['text']}" for t in turns)
            logger.info("Single-shot TTS: %d chars, %d turns", len(prompt), len(turns))
            audio_data = _tts_generate(client, prompt, label="Single-shot TTS")
            logger.info("Single-shot TTS returned %d bytes of audio", len(audio_data))
            wav_path = os.path.join(tmp_dir, "episode.wav")
            _save_wav(wav_path, audio_data)
            _convert_to_mp3(wav_path, mp3_path)

        # Prepend intro music if selected
        if intro_music:
            mp3_path = _prepend_intro(mp3_path, intro_music, tmp_dir)

        mp3_size = os.path.getsize(mp3_path)
        logger.info("Final MP3: %d bytes (%.1f MB)", mp3_size, mp3_size / 1_048_576)

        with open(mp3_path, "rb") as f:
            return f.read()


_INTRO_SILENCE_MS = 500  # milliseconds of silence between intro music and episode
_INTRO_FADE_OUT_MS = 2500  # fade out the tail of the intro music


def _prepend_intro(mp3_path: str, intro_music: str, tmp_dir: str) -> str:
    """Prepend an intro music track + silence gap to the episode MP3."""
    from pathlib import Path

    intro_path = Path(__file__).parent / "intro-music" / intro_music
    if not intro_path.exists():
        logger.warning("Intro music file not found: %s — skipping", intro_path)
        return mp3_path

    logger.info("Prepending intro music: %s", intro_music)
    intro_seg = AudioSegment.from_mp3(str(intro_path)).fade_out(_INTRO_FADE_OUT_MS)
    episode_seg = AudioSegment.from_mp3(mp3_path)
    silence = AudioSegment.silent(duration=_INTRO_SILENCE_MS)

    combined = intro_seg + silence + episode_seg + AudioSegment.silent(duration=1000)
    final_path = os.path.join(tmp_dir, "episode_with_intro.mp3")
    combined.export(final_path, format="mp3", parameters=["-q:a", "2"])
    logger.info("Intro prepended: %dms intro + %dms silence + %dms episode",
                len(intro_seg), _INTRO_SILENCE_MS, len(episode_seg))
    return final_path


_CHUNK_GAP_MS = 300  # milliseconds of silence between chunks


def _synthesize_chunked(client: genai.Client, turns: list[dict], tmp_dir: str, mp3_path: str, on_progress: "callable | None" = None) -> None:
    target_chunk_size = 15
    num_chunks = max(1, round(len(turns) / target_chunk_size))
    base = len(turns) // num_chunks
    remainder = len(turns) % num_chunks

    # Distribute turns evenly: first 'remainder' chunks get base+1, rest get base
    chunks = []
    offset = 0
    for i in range(num_chunks):
        size = base + (1 if i < remainder else 0)
        chunks.append(turns[offset : offset + size])
        offset += size

    # Split chunks that contain very long turns — TTS silently truncates audio
    # when a chunk has too much text, dropping the end. If any turn in a chunk
    # exceeds the threshold, split the chunk so that turn starts a new one.
    _LONG_TURN_CHARS = 500
    split_chunks = []
    for chunk in chunks:
        split_at = None
        for j, turn in enumerate(chunk):
            if len(turn["text"]) > _LONG_TURN_CHARS and j > 0:
                split_at = j
                break
        if split_at is not None and len(chunk[:split_at]) > 0:
            split_chunks.append(chunk[:split_at])
            split_chunks.append(chunk[split_at:])
            logger.info(
                "Split chunk due to long turn (%d chars at position %d) → [%d, %d] turns",
                len(chunk[split_at]["text"]), split_at,
                len(chunk[:split_at]), len(chunk[split_at:]),
            )
        else:
            split_chunks.append(chunk)
    chunks = split_chunks
    total_chunks = len(chunks)

    logger.info(
        "Splitting %d turns into %d chunks (target=%d, sizes=%s)",
        len(turns), total_chunks, target_chunk_size,
        [len(c) for c in chunks],
    )

    # Build prompts for each chunk
    _PREAMBLE = "TTS the following conversation between Host and Guest:\n"
    prompts = []
    for i, chunk in enumerate(chunks):
        prompt = _PREAMBLE + "\n".join(f"{t['speaker']}: {t['text']}" for t in chunk)
        prompts.append(prompt)
        logger.info(
            "Chunk %d/%d: %d turns, %d chars",
            i + 1, total_chunks, len(chunk), len(prompt),
        )

    # Fire all TTS calls in parallel
    _LOOP_DURATION_THRESHOLD = 1.25  # flag chunk if bytes/char is >25% above median
    _LOOP_MAX_RETRIES = 2

    completed = 0
    completed_lock = threading.Lock()
    raw_audio = [None] * total_chunks  # raw PCM bytes per chunk
    results = [None] * total_chunks    # AudioSegment per chunk
    chunk_chars = [len(prompts[i]) for i in range(total_chunks)]

    def _tts_chunk(index: int) -> None:
        nonlocal completed
        audio_data = _tts_generate(client, prompts[index], label=f"Chunk {index + 1}/{total_chunks}")
        logger.info("Chunk %d/%d: received %d bytes of audio", index + 1, total_chunks, len(audio_data))

        raw_audio[index] = audio_data
        chunk_wav = os.path.join(tmp_dir, f"chunk{index}.wav")
        _save_wav(chunk_wav, audio_data)
        results[index] = AudioSegment.from_wav(chunk_wav)

        with completed_lock:
            completed += 1
            if on_progress:
                try:
                    on_progress("audio", {"chunk": completed, "total": total_chunks})
                except Exception:
                    logger.warning("on_progress callback failed for audio chunk %d/%d", completed, total_chunks, exc_info=True)

    with concurrent.futures.ThreadPoolExecutor(max_workers=total_chunks) as executor:
        futures = {executor.submit(_tts_chunk, i): i for i in range(total_chunks)}
        for future in concurrent.futures.as_completed(futures):
            idx = futures[future]
            future.result()  # re-raises any exception from the thread

    # Duration-based loop detection: compare bytes/char across chunks
    # If any chunk is >40% above the median, it likely looped — retry it
    if total_chunks >= 2:
        ratios = [len(raw_audio[i]) / max(chunk_chars[i], 1) for i in range(total_chunks)]
        sorted_ratios = sorted(ratios)
        median_ratio = sorted_ratios[len(sorted_ratios) // 2]
        threshold = median_ratio * _LOOP_DURATION_THRESHOLD

        for i in range(total_chunks):
            if ratios[i] <= threshold:
                continue
            label = f"Chunk {i + 1}/{total_chunks}"
            logger.warning(
                "%s: possible loop detected (bytes/char=%.0f, median=%.0f, threshold=%.0f). Retrying...",
                label, ratios[i], median_ratio, threshold,
            )
            for retry in range(_LOOP_MAX_RETRIES):
                audio_data = _tts_generate(client, prompts[i], label=f"{label} retry {retry + 1}")
                new_ratio = len(audio_data) / max(chunk_chars[i], 1)
                logger.info("%s retry %d: bytes/char=%.0f", label, retry + 1, new_ratio)
                if new_ratio <= threshold:
                    raw_audio[i] = audio_data
                    chunk_wav = os.path.join(tmp_dir, f"chunk{i}.wav")
                    _save_wav(chunk_wav, audio_data)
                    results[i] = AudioSegment.from_wav(chunk_wav)
                    logger.info("%s retry %d: clean audio, keeping", label, retry + 1)
                    break
            else:
                # All retries still looped — split chunk in half
                logger.warning("%s: still looping after %d retries, splitting chunk", label, _LOOP_MAX_RETRIES)
                chunk_turns = chunks[i]
                mid = len(chunk_turns) // 2
                prompt_a = "\n".join(f"{t['speaker']}: {t['text']}" for t in chunk_turns[:mid])
                prompt_b = "\n".join(f"{t['speaker']}: {t['text']}" for t in chunk_turns[mid:])
                pcm_a = _tts_generate(client, prompt_a, label=f"{label}a")
                pcm_b = _tts_generate(client, prompt_b, label=f"{label}b")
                wav_a = os.path.join(tmp_dir, f"chunk{i}a.wav")
                wav_b = os.path.join(tmp_dir, f"chunk{i}b.wav")
                _save_wav(wav_a, pcm_a)
                _save_wav(wav_b, pcm_b)
                seg_a = AudioSegment.from_wav(wav_a)
                seg_b = AudioSegment.from_wav(wav_b)
                results[i] = seg_a + AudioSegment.silent(duration=_CHUNK_GAP_MS) + seg_b
                logger.info("%s: split into two halves (%d + %d bytes)", label, len(pcm_a), len(pcm_b))

    audio_segments = results
    logger.info("All %d chunks synthesized in parallel, joining with %dms silence gaps...", total_chunks, _CHUNK_GAP_MS)

    # Join chunks with brief silence gaps (natural conversational pause)
    silence = AudioSegment.silent(duration=_CHUNK_GAP_MS)
    combined = audio_segments[0]
    for i, seg in enumerate(audio_segments[1:], start=1):
        combined = combined + silence + seg
        logger.info("Joined chunk %d/%d (%dms gap)", i + 1, total_chunks, _CHUNK_GAP_MS)

    # Pad end with 1s silence to prevent MP3 encoder truncation
    combined = combined + AudioSegment.silent(duration=1000)
    combined.export(mp3_path, format="mp3", parameters=["-q:a", "2"])
    logger.info("Exported MP3 with silence gaps (%d chunks)", total_chunks)


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
