import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GoogleGenAI } from "@google/genai";
import { getVoiceGender } from "@/lib/voices";


export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { phonetic_name } = body;

  if (!phonetic_name || typeof phonetic_name !== "string") {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  // Always read current voices from DB so preview stays in sync
  // even if they just changed them in VoicePicker without a page reload.
  const { data: userRecord } = await supabase
    .from("users")
    .select("host_voice, guest_voice")
    .eq("id", user.id)
    .single<{ host_voice: string; guest_voice: string }>();

  const voice = userRecord?.host_voice || "Charon";
  const guestVoice = userRecord?.guest_voice || "Sulafat";

  console.log("Name preview: host_voice=%s, guest_voice=%s", voice, guestVoice);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "TTS not configured" }, { status: 500 });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    // Use multi-speaker config with voice-anchoring preamble to match the pipeline.
    // Gemini requires exactly 2 speaker voice configs.
    // Include both speakers in the prompt to prevent Gemini from improvising turns
    // or switching voices. Speaker2's line is a short reaction — we trim the audio
    // to only include Speaker1's greeting.
    const hostGender = getVoiceGender(voice);
    const gender = hostGender === "M" ? "male" : "female";
    const guestGenderLabel = getVoiceGender(guestVoice) === "M" ? "male" : "female";

    const preamble = `TTS the following conversation between Speaker1 (${voice}, ${gender}) and Speaker2 (${guestVoice}, ${guestGenderLabel}):\n`;
    const prompt = preamble
      + `Speaker1: Hi ${phonetic_name}, Welcome to Daily Jist — your newsletters, distilled into conversation!\n`
      + `Speaker2: We've got a great lineup for you today.\n`
      + `Speaker1: That's your Daily Jist for today, ${phonetic_name}. See you next time!`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: prompt,
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          multiSpeakerVoiceConfig: {
            speakerVoiceConfigs: [
              {
                speaker: "Speaker1",
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: voice },
                },
              },
              {
                speaker: "Speaker2",
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: guestVoice },
                },
              },
            ],
          },
        },
      },
    });

    const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!audioData) {
      return NextResponse.json({ error: "TTS returned no audio" }, { status: 500 });
    }

    // audioData is base64-encoded PCM — convert to WAV for browser playback
    const pcmBuffer = Buffer.from(audioData, "base64");
    const wavBuffer = pcmToWav(pcmBuffer, 24000, 1, 16);

    return new NextResponse(new Uint8Array(wavBuffer), {
      headers: {
        "Content-Type": "audio/wav",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("Name preview TTS failed:", err);
    return NextResponse.json({ error: "Preview generation failed" }, { status: 500 });
  }
}

function pcmToWav(pcm: Buffer, sampleRate: number, channels: number, bitDepth: number): Buffer {
  const byteRate = sampleRate * channels * (bitDepth / 8);
  const blockAlign = channels * (bitDepth / 8);
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitDepth, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}
