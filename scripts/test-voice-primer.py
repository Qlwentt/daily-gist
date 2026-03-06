"""Quick test for voice primer trimming — runs only the TTS, no transcript generation.

Usage:
    cd daily-gist
    set -a && source .env.local && set +a
    python scripts/test-voice-primer.py [host_voice] [guest_voice]
    # Outputs: /tmp/primer-test.mp3
"""

import os
import sys
import wave
import tempfile
import concurrent.futures

from google import genai
from google.genai import types
from pydub import AudioSegment

# First 4 turns from the transcript — enough to check the first Guest turn
TEST_TURNS = [
    {"speaker": "Host", "text": "Welcome to Daily Jist — your newsletters, distilled into conversation! Imagine gutting a nine billion dollar company's core product in seven days for the price of a used laptop."},
    {"speaker": "Guest", "text": "It sounds like a heist movie, but Cloudflare just proved that if you have eleven hundred dollars in tokens and an engineer with a grudge, you can build a tunnel right under a competitor's front gate."},
    {"speaker": "Host", "text": "The gate in this case is Next.js, the framework that basically owns the React ecosystem."},
    {"speaker": "Guest", "text": "Cloudflare didn't just pick the lock; they replaced the entire ignition system with Vite, which is the industry standard anyway."},
]

_TTS_TIMEOUT_S = 180
_PREAMBLE = "TTS the following conversation between Host and Guest:\n"
_VOICE_PRIMER = "Host: Hello.\nGuest: Hello.\n"
_PRIMER_TRIM_BUFFER_MS = 500


def _build_voice_config(host_voice, guest_voice):
    return types.SpeechConfig(
        multi_speaker_voice_config=types.MultiSpeakerVoiceConfig(
            speaker_voice_configs=[
                types.SpeakerVoiceConfig(
                    speaker="Host",
                    voice_config=types.VoiceConfig(
                        prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=host_voice)
                    ),
                ),
                types.SpeakerVoiceConfig(
                    speaker="Guest",
                    voice_config=types.VoiceConfig(
                        prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=guest_voice)
                    ),
                ),
            ]
        )
    )


def _tts_generate(client, prompt, voice_config):
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(
            client.models.generate_content,
            model="gemini-2.5-flash-preview-tts",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_modalities=["AUDIO"],
                speech_config=voice_config,
            ),
        )
        response = future.result(timeout=_TTS_TIMEOUT_S)
    return response.candidates[0].content.parts[0].inline_data.data


def _save_wav(path, pcm_data):
    with wave.open(path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(24000)
        wf.writeframes(pcm_data)


def main():
    host_voice = sys.argv[1] if len(sys.argv) > 1 else "Sadachbia"
    guest_voice = sys.argv[2] if len(sys.argv) > 2 else "Vindemiatrix"
    print(f"Testing: Host={host_voice}, Guest={guest_voice}")

    client = genai.Client(
        api_key=os.environ["GEMINI_API_KEY"],
        http_options=types.HttpOptions(timeout=_TTS_TIMEOUT_S * 1000),
    )
    voice_config = _build_voice_config(host_voice, guest_voice)

    with tempfile.TemporaryDirectory() as tmp:
        # 1) Calibration: measure primer duration
        print("Generating primer calibration...")
        primer_pcm = _tts_generate(client, _PREAMBLE + _VOICE_PRIMER, voice_config)
        primer_wav = os.path.join(tmp, "primer.wav")
        _save_wav(primer_wav, primer_pcm)
        primer_seg = AudioSegment.from_wav(primer_wav)
        primer_ms = len(primer_seg)
        print(f"Primer duration: {primer_ms}ms")

        # 2) Generate with primer prepended
        prompt = _PREAMBLE + _VOICE_PRIMER + "\n".join(f"{t['speaker']}: {t['text']}" for t in TEST_TURNS)
        print("Generating primed TTS...")
        primed_pcm = _tts_generate(client, prompt, voice_config)
        primed_wav = os.path.join(tmp, "primed.wav")
        _save_wav(primed_wav, primed_pcm)
        primed_seg = AudioSegment.from_wav(primed_wav)
        print(f"Primed audio: {len(primed_seg)}ms")

        # 3) Trim primer using silence detection
        from pydub.silence import detect_silence
        silences = detect_silence(primed_seg, min_silence_len=100, silence_thresh=-35)
        best_trim = primer_ms  # fallback
        best_dist = float("inf")
        for start, end in silences:
            dist = abs(start - primer_ms)
            if dist < best_dist and dist < 500:
                best_dist = dist
                best_trim = end
        trimmed = primed_seg[best_trim:]
        print(f"Silence gaps near primer: {[(s,e) for s,e in silences if abs(s - primer_ms) < 1000]}")
        print(f"Trimmed {best_trim}ms (calibration={primer_ms}ms, nearest silence end={best_trim}ms)")
        print(f"Final audio: {len(trimmed)}ms")

        # 4) Also generate WITHOUT primer for comparison
        prompt_no_primer = _PREAMBLE + "\n".join(f"{t['speaker']}: {t['text']}" for t in TEST_TURNS)
        print("Generating unprimed TTS (for comparison)...")
        raw_pcm = _tts_generate(client, prompt_no_primer, voice_config)
        raw_wav = os.path.join(tmp, "raw.wav")
        _save_wav(raw_wav, raw_pcm)
        raw_seg = AudioSegment.from_wav(raw_wav)

        # Export both
        trimmed.export("/tmp/primer-test-primed.mp3", format="mp3", parameters=["-q:a", "2"])
        raw_seg.export("/tmp/primer-test-raw.mp3", format="mp3", parameters=["-q:a", "2"])
        print(f"\nOutputs:")
        print(f"  /tmp/primer-test-primed.mp3  — with primer (trimmed)")
        print(f"  /tmp/primer-test-raw.mp3     — without primer (original bug)")
        print(f"\nCompare them to check if the primer fixes the first Guest turn voice.")


if __name__ == "__main__":
    main()
