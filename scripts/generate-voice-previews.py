"""Generate voice preview MP3 files for all 30 Gemini TTS voices.

Usage:
    cd daily-gist
    set -a && source .env.local && set +a
    python scripts/generate-voice-previews.py
"""

import os
import subprocess
import sys
import tempfile
import time
import wave

from google import genai
from google.genai import types

VOICES = [
    "Achernar", "Achird", "Algenib", "Algieba",
    "Aoede", "Autonoe", "Callirrhoe", "Charon", "Despina",
    "Enceladus", "Erinome", "Fenrir", "Gacrux", "Iapetus",
    "Kore", "Laomedeia", "Leda", "Orus", "Puck",
    "Pulcherrima", "Rasalgethi", "Sadachbia", "Sadaltager", "Schedar",
    "Sulafat", "Umbriel", "Vindemiatrix", "Zephyr", "Zubenelgenubi",
]

SAMPLE_TEXT = "Here's your Daily Gist for today. Let me tell you what's happening in the world."

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "voice-previews")

MAX_RETRIES = 3
RETRY_DELAYS = [5, 15, 30]


DUMMY_VOICE = "Puck"


def generate_preview(client: genai.Client, voice_name: str, output_path: str) -> None:
    # Use multi-speaker mode so the voice sounds the same as in actual episodes.
    # Requires exactly 2 speaker configs — use a dummy for the silent Guest slot.
    # No preamble mentioning Guest, so the model won't generate a Guest turn.
    speech_config = types.SpeechConfig(
        multi_speaker_voice_config=types.MultiSpeakerVoiceConfig(
            speaker_voice_configs=[
                types.SpeakerVoiceConfig(
                    speaker="Speaker1",
                    voice_config=types.VoiceConfig(
                        prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=voice_name)
                    ),
                ),
                types.SpeakerVoiceConfig(
                    speaker="Speaker2",
                    voice_config=types.VoiceConfig(
                        prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=DUMMY_VOICE)
                    ),
                ),
            ]
        )
    )

    prompt = f"Speaker1: {SAMPLE_TEXT}"

    for attempt in range(MAX_RETRIES):
        try:
            response = client.models.generate_content(
                model="gemini-2.5-flash-preview-tts",
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_modalities=["AUDIO"],
                    speech_config=speech_config,
                ),
            )
            pcm_data = response.candidates[0].content.parts[0].inline_data.data
            break
        except Exception as e:
            err_str = str(e).lower()
            is_retryable = any(s in err_str for s in ("429", "500", "503", "rate", "overloaded", "timeout"))
            if not is_retryable or attempt == MAX_RETRIES - 1:
                raise
            delay = RETRY_DELAYS[attempt]
            print(f"  Retry {attempt + 1}/{MAX_RETRIES} for {voice_name} in {delay}s ({type(e).__name__})")
            time.sleep(delay)

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        wav_path = tmp.name

    try:
        with wave.open(wav_path, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(24000)
            wf.writeframes(pcm_data)

        subprocess.run(
            ["ffmpeg", "-y", "-i", wav_path, "-c:a", "libmp3lame", "-q:a", "2", output_path],
            check=True,
            capture_output=True,
        )
    finally:
        os.unlink(wav_path)


def main():
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("Error: GEMINI_API_KEY not set")
        sys.exit(1)

    client = genai.Client(api_key=api_key)
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    print(f"Generating {len(VOICES)} voice previews...")
    print(f"Output: {os.path.abspath(OUTPUT_DIR)}\n")

    for i, voice in enumerate(VOICES, 1):
        output_path = os.path.join(OUTPUT_DIR, f"{voice}.mp3")
        if os.path.exists(output_path):
            print(f"[{i}/{len(VOICES)}] {voice} — already exists, skipping")
            continue

        print(f"[{i}/{len(VOICES)}] {voice}...", end=" ", flush=True)
        try:
            generate_preview(client, voice, output_path)
            size_kb = os.path.getsize(output_path) / 1024
            print(f"OK ({size_kb:.0f} KB)")
        except Exception as e:
            print(f"FAILED: {e}")

        # Brief pause between calls to avoid rate limits
        if i < len(VOICES):
            time.sleep(1)

    # Summary
    generated = [v for v in VOICES if os.path.exists(os.path.join(OUTPUT_DIR, f"{v}.mp3"))]
    missing = [v for v in VOICES if not os.path.exists(os.path.join(OUTPUT_DIR, f"{v}.mp3"))]
    total_kb = sum(os.path.getsize(os.path.join(OUTPUT_DIR, f"{v}.mp3")) for v in generated) / 1024

    print(f"\nDone: {len(generated)}/{len(VOICES)} voices generated ({total_kb:.0f} KB total)")
    if missing:
        print(f"Missing: {', '.join(missing)}")


if __name__ == "__main__":
    main()
