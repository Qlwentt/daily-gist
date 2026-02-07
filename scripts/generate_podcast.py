#!/usr/bin/env python3
"""
Daily Gist Podcast Generator

Pipeline:
1. Podcastfy + Gemini 2.0 Flash → generates conversation transcript
2. Gemini 2.5 Flash TTS API → synthesizes multi-speaker audio

This replaces the Google Cloud TTS (Chirp 3 HD) approach with the native
Gemini TTS API, which is ~3x cheaper and has built-in multi-speaker support.

Cost comparison:
- Cloud TTS Chirp 3 HD: $30/1M characters (~$0.54/episode)
- Gemini 2.5 Flash TTS: $0.50/1M input + $10/1M output tokens (~$0.20/episode)
"""

import argparse
import json
import logging
import os
import re
import sys
import wave
import tempfile
import subprocess

from google import genai
from google.genai import types

from podcastfy.client import generate_podcast as podcastfy_generate

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Step 1: Generate transcript using Podcastfy + Gemini
# ---------------------------------------------------------------------------

def generate_transcript(newsletter_text: str) -> str:
    """Use Podcastfy to generate a two-person conversation transcript."""

    conversation_config = {
        "word_count": 3000,
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
    }

    # Generate transcript only (no TTS) — pass raw text directly
    # transcript_only=True returns a file path, not the content
    transcript_path = podcastfy_generate(
        text=newsletter_text,
        conversation_config=conversation_config,
        llm_model_name="gemini-2.0-flash",
        api_key_label="GEMINI_API_KEY",
        transcript_only=True,
    )

    if not transcript_path or not os.path.exists(transcript_path):
        raise RuntimeError("Transcript generation failed — no file produced")

    with open(transcript_path, "r") as f:
        return f.read()


# ---------------------------------------------------------------------------
# Step 2: Parse transcript into speaker turns
# ---------------------------------------------------------------------------

def parse_transcript(transcript: str) -> list[dict]:
    """Parse Podcastfy's <Person1>/<Person2> format into speaker turns."""
    turns = []
    # Match <Person1>text</Person1> and <Person2>text</Person2>
    pattern = r"<(Person[12])>(.*?)</\1>"
    matches = re.findall(pattern, transcript, re.DOTALL)

    speaker_map = {
        "Person1": "Host",   # Main summarizer
        "Person2": "Guest",  # Curious questioner
    }

    for person_tag, text in matches:
        clean_text = text.strip()
        # Phonetic spelling so TTS pronounces "Gist" with a soft G
        clean_text = re.sub(r"\bGist\b", "Jist", clean_text)
        if clean_text:
            turns.append({
                "speaker": speaker_map[person_tag],
                "text": clean_text,
            })

    logger.info(f"Parsed {len(turns)} speaker turns from transcript")
    return turns


# ---------------------------------------------------------------------------
# Step 3: Synthesize audio using Gemini 2.5 Flash TTS
# ---------------------------------------------------------------------------

def synthesize_audio(turns: list[dict], output_path: str) -> str:
    """Use Gemini 2.5 Flash TTS for multi-speaker audio generation."""

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY environment variable is required")

    client = genai.Client(api_key=api_key)

    # Build the conversation prompt for TTS
    # Format: "Speaker: text" for each turn
    tts_prompt_lines = []
    for turn in turns:
        tts_prompt_lines.append(f"{turn['speaker']}: {turn['text']}")

    full_prompt = "\n".join(tts_prompt_lines)

    # Gemini TTS has a 32k token context limit
    # Estimate: ~4 chars per token, so ~128k chars max
    # If transcript is too long, we need to chunk
    MAX_CHARS = 100_000  # Leave headroom
    if len(full_prompt) > MAX_CHARS:
        logger.warning(f"Transcript is {len(full_prompt)} chars, chunking required")
        return _synthesize_chunked(client, turns, output_path)

    logger.info(f"Sending {len(full_prompt)} chars to Gemini TTS ({len(turns)} turns)")

    response = client.models.generate_content(
        model="gemini-2.5-flash-preview-tts",
        contents=full_prompt,
        config=types.GenerateContentConfig(
            response_modalities=["AUDIO"],
            speech_config=types.SpeechConfig(
                multi_speaker_voice_config=types.MultiSpeakerVoiceConfig(
                    speaker_voice_configs=[
                        types.SpeakerVoiceConfig(
                            speaker="Host",
                            voice_config=types.VoiceConfig(
                                prebuilt_voice_config=types.PrebuiltVoiceConfig(
                                    voice_name="Charon",
                                )
                            ),
                        ),
                        types.SpeakerVoiceConfig(
                            speaker="Guest",
                            voice_config=types.VoiceConfig(
                                prebuilt_voice_config=types.PrebuiltVoiceConfig(
                                    voice_name="Leda",
                                )
                            ),
                        ),
                    ]
                )
            ),
        ),
    )

    # Extract audio data
    audio_data = response.candidates[0].content.parts[0].inline_data.data

    # Save as WAV first
    wav_path = output_path.replace(".mp3", ".wav")
    _save_wav(wav_path, audio_data)

    # Convert to MP3 using ffmpeg
    _convert_to_mp3(wav_path, output_path)

    # Clean up WAV
    if os.path.exists(wav_path) and wav_path != output_path:
        os.unlink(wav_path)

    logger.info(f"Audio saved to {output_path}")
    return output_path


def _synthesize_chunked(client, turns: list[dict], output_path: str) -> str:
    """Handle long transcripts by chunking and concatenating."""
    # Split turns into chunks of ~20 turns each
    chunk_size = 20
    chunks = [turns[i:i + chunk_size] for i in range(0, len(turns), chunk_size)]
    wav_files = []

    for i, chunk in enumerate(chunks):
        logger.info(f"Synthesizing chunk {i+1}/{len(chunks)} ({len(chunk)} turns)")

        prompt_lines = [f"{t['speaker']}: {t['text']}" for t in chunk]
        prompt = "\n".join(prompt_lines)

        response = client.models.generate_content(
            model="gemini-2.5-flash-preview-tts",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_modalities=["AUDIO"],
                speech_config=types.SpeechConfig(
                    multi_speaker_voice_config=types.MultiSpeakerVoiceConfig(
                        speaker_voice_configs=[
                            types.SpeakerVoiceConfig(
                                speaker="Host",
                                voice_config=types.VoiceConfig(
                                    prebuilt_voice_config=types.PrebuiltVoiceConfig(
                                        voice_name="Charon",
                                    )
                                ),
                            ),
                            types.SpeakerVoiceConfig(
                                speaker="Guest",
                                voice_config=types.VoiceConfig(
                                    prebuilt_voice_config=types.PrebuiltVoiceConfig(
                                        voice_name="Leda",
                                    )
                                ),
                            ),
                        ]
                    )
                ),
            ),
        )

        audio_data = response.candidates[0].content.parts[0].inline_data.data
        chunk_wav = output_path.replace(".mp3", f"_chunk{i}.wav")
        _save_wav(chunk_wav, audio_data)
        wav_files.append(chunk_wav)

    # Concatenate all chunks using ffmpeg
    concat_list = output_path.replace(".mp3", "_concat.txt")
    with open(concat_list, "w") as f:
        for wav_file in wav_files:
            f.write(f"file '{wav_file}'\n")

    subprocess.run(
        ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", concat_list, "-c:a", "libmp3lame", "-q:a", "2", output_path],
        check=True,
        capture_output=True,
    )

    # Clean up temp files
    for wav_file in wav_files:
        os.unlink(wav_file)
    os.unlink(concat_list)

    logger.info(f"Concatenated {len(chunks)} chunks → {output_path}")
    return output_path


def _save_wav(filename: str, pcm_data: bytes, channels: int = 1, rate: int = 24000, sample_width: int = 2):
    """Save raw PCM audio data as a WAV file."""
    with wave.open(filename, "wb") as wf:
        wf.setnchannels(channels)
        wf.setsampwidth(sample_width)
        wf.setframerate(rate)
        wf.writeframes(pcm_data)


def _convert_to_mp3(wav_path: str, mp3_path: str):
    """Convert WAV to MP3 using ffmpeg."""
    subprocess.run(
        ["ffmpeg", "-y", "-i", wav_path, "-c:a", "libmp3lame", "-q:a", "2", mp3_path],
        check=True,
        capture_output=True,
    )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Generate Daily Gist podcast episode")
    parser.add_argument("--input", required=True, help="Path to newsletter text file or raw text")
    parser.add_argument("--output", default="episode.mp3", help="Output MP3 path")
    parser.add_argument("--result-file", required=True, help="Path to write JSON result")
    parser.add_argument("--transcript-only", action="store_true", help="Only generate transcript, skip TTS")
    args = parser.parse_args()

    # Read input
    if os.path.isfile(args.input):
        with open(args.input, "r") as f:
            newsletter_text = f.read()
    else:
        newsletter_text = args.input

    if not newsletter_text.strip():
        with open(args.result_file, "w") as rf:
            json.dump({"error": "Empty input content"}, rf)
        sys.exit(1)

    logger.info(f"Input: {len(newsletter_text)} characters")

    # Step 1: Generate transcript
    logger.info("Step 1: Generating transcript with Podcastfy + Gemini...")
    transcript = generate_transcript(newsletter_text)
    logger.info(f"Transcript generated: {len(transcript)} characters")

    if args.transcript_only:
        with open(args.result_file, "w") as rf:
            json.dump({"transcript": transcript}, rf)
        return

    # Step 2: Parse transcript
    logger.info("Step 2: Parsing transcript into speaker turns...")
    turns = parse_transcript(transcript)
    if not turns:
        with open(args.result_file, "w") as rf:
            json.dump({"error": "Transcript produced no dialogue turns"}, rf)
        sys.exit(1)

    # Step 3: Synthesize audio
    logger.info("Step 3: Synthesizing audio with Gemini 2.5 Flash TTS...")
    output_path = synthesize_audio(turns, args.output)

    # Write result for the Node.js caller
    with open(args.result_file, "w") as rf:
        json.dump({
            "audio_path": output_path,
            "transcript": transcript,
        }, rf)


if __name__ == "__main__":
    main()
