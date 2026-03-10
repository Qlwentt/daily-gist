"use client";

import { useState, useRef } from "react";
import { VOICES, getVoiceGender } from "@/lib/voices";

const MALE_VOICES = VOICES.filter((v) => v.gender === "M");
const FEMALE_VOICES = VOICES.filter((v) => v.gender === "F");

export function VoicePicker({
  currentHostVoice,
  currentGuestVoice,
  isPower,
}: {
  currentHostVoice: string;
  currentGuestVoice: string;
  isPower: boolean;
}) {
  // Derive initial state from current host/guest voices
  // Handle legacy same-gender pairs by falling back to defaults
  const currentHostGender = getVoiceGender(currentHostVoice);
  const currentGuestGender = getVoiceGender(currentGuestVoice);
  const bothMale = currentHostGender === "M" && currentGuestGender === "M";
  const bothFemale = currentHostGender === "F" && currentGuestGender === "F";

  const initMale = bothFemale ? MALE_VOICES[0].name
    : currentHostGender === "M" ? currentHostVoice : currentGuestVoice;
  const initFemale = bothMale ? FEMALE_VOICES[0].name
    : currentHostGender === "F" ? currentHostVoice : currentGuestVoice;
  const initLead = currentHostGender;

  const [maleVoice, setMaleVoice] = useState(initMale);
  const [femaleVoice, setFemaleVoice] = useState(initFemale);
  const [leadGender, setLeadGender] = useState<"M" | "F">(initLead);
  const [committedMale, setCommittedMale] = useState(initMale);
  const [committedFemale, setCommittedFemale] = useState(initFemale);
  const [committedLead, setCommittedLead] = useState(initLead);
  const [playing, setPlaying] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const hostVoice = leadGender === "M" ? maleVoice : femaleVoice;
  const guestVoice = leadGender === "M" ? femaleVoice : maleVoice;
  const maleLabel = VOICES.find((v) => v.name === maleVoice)?.label ?? maleVoice;
  const femaleLabel = VOICES.find((v) => v.name === femaleVoice)?.label ?? femaleVoice;

  const dirty =
    maleVoice !== committedMale ||
    femaleVoice !== committedFemale ||
    leadGender !== committedLead;

  function togglePlay(voice: string) {
    if (playing === voice) {
      audioRef.current?.pause();
      setPlaying(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
    }

    const audio = new Audio(`/voice-previews/${voice}.mp3`);
    audio.onended = () => setPlaying(null);
    audio.play();
    audioRef.current = audio;
    setPlaying(voice);
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/account/voices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host_voice: hostVoice, guest_voice: guestVoice }),
      });
      if (res.ok) {
        setCommittedMale(maleVoice);
        setCommittedFemale(femaleVoice);
        setCommittedLead(leadGender);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
    <style>{`@keyframes pulse-save-voice { 0%, 100% { box-shadow: 0 0 0 0 rgba(124, 58, 237, 0.5); } 50% { box-shadow: 0 0 0 6px rgba(124, 58, 237, 0); } }`}</style>
    <div
      className="relative overflow-hidden rounded-2xl p-6"
      style={{
        background: "linear-gradient(135deg, #1a0e2e 0%, #2d1b4e 50%, #4a2d7a 100%)",
        border: "1px solid rgba(107, 76, 154, 0.3)",
      }}
    >
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 50%, white 1px, transparent 1px), " +
            "radial-gradient(circle at 80% 20%, white 1px, transparent 1px), " +
            "radial-gradient(circle at 60% 80%, white 1px, transparent 1px)",
          backgroundSize: "60px 60px, 80px 80px, 70px 70px",
        }}
      />
      <div className="relative">
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-lg font-semibold" style={{ color: "#ffffff" }}>
            Voices
          </h2>
          <span
            className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
            style={{
              background: "linear-gradient(135deg, #c084fc, #818cf8)",
              color: "#ffffff",
              letterSpacing: "0.1em",
            }}
          >
            Power
          </span>
        </div>
        <p className="text-sm mb-4" style={{ color: "rgba(255, 255, 255, 0.6)" }}>
          Pick a male and female voice for your podcast. Different genders make it
          easy to tell speakers apart.
        </p>

        <div className="space-y-3">
          {/* Male voice */}
          <div>
            <label className="text-xs font-medium uppercase mb-1 block" style={{ color: "rgba(255, 255, 255, 0.5)", letterSpacing: "0.05em" }}>
              Male voice
            </label>
            <div className="flex gap-3">
              <select
                value={maleVoice}
                onChange={(e) => setMaleVoice(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
                style={{
                  background: "rgba(255, 255, 255, 0.1)",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  color: "#ffffff",
                }}
              >
                {MALE_VOICES.map((v) => (
                  <option key={v.name} value={v.name} style={{ color: "#1a0e2e" }}>
                    {v.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => togglePlay(maleVoice)}
                className="px-3 py-2 rounded-xl text-sm font-medium transition-colors"
                style={{
                  background: playing === maleVoice
                    ? "rgba(192, 132, 252, 0.35)"
                    : "rgba(192, 132, 252, 0.2)",
                  color: "#e0ccff",
                  border: "1px solid rgba(192, 132, 252, 0.4)",
                }}
              >
                {playing === maleVoice ? "Stop" : "Preview"}
              </button>
            </div>
          </div>

          {/* Female voice */}
          <div>
            <label className="text-xs font-medium uppercase mb-1 block" style={{ color: "rgba(255, 255, 255, 0.5)", letterSpacing: "0.05em" }}>
              Female voice
            </label>
            <div className="flex gap-3">
              <select
                value={femaleVoice}
                onChange={(e) => setFemaleVoice(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
                style={{
                  background: "rgba(255, 255, 255, 0.1)",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  color: "#ffffff",
                }}
              >
                {FEMALE_VOICES.map((v) => (
                  <option key={v.name} value={v.name} style={{ color: "#1a0e2e" }}>
                    {v.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => togglePlay(femaleVoice)}
                className="px-3 py-2 rounded-xl text-sm font-medium transition-colors"
                style={{
                  background: playing === femaleVoice
                    ? "rgba(192, 132, 252, 0.35)"
                    : "rgba(192, 132, 252, 0.2)",
                  color: "#e0ccff",
                  border: "1px solid rgba(192, 132, 252, 0.4)",
                }}
              >
                {playing === femaleVoice ? "Stop" : "Preview"}
              </button>
            </div>
          </div>

          {/* Lead host toggle */}
          <div>
            <label className="text-xs font-medium uppercase mb-2 block" style={{ color: "rgba(255, 255, 255, 0.5)", letterSpacing: "0.05em" }}>
              Lead host
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setLeadGender("M")}
                className="flex-1 px-3 py-2 rounded-xl text-sm font-medium transition-colors"
                style={{
                  background: leadGender === "M"
                    ? "rgba(192, 132, 252, 0.3)"
                    : "rgba(255, 255, 255, 0.05)",
                  border: leadGender === "M"
                    ? "1px solid rgba(192, 132, 252, 0.6)"
                    : "1px solid rgba(255, 255, 255, 0.15)",
                  color: leadGender === "M" ? "#e0ccff" : "rgba(255, 255, 255, 0.5)",
                }}
              >
                {maleLabel}
              </button>
              <button
                type="button"
                onClick={() => setLeadGender("F")}
                className="flex-1 px-3 py-2 rounded-xl text-sm font-medium transition-colors"
                style={{
                  background: leadGender === "F"
                    ? "rgba(192, 132, 252, 0.3)"
                    : "rgba(255, 255, 255, 0.05)",
                  border: leadGender === "F"
                    ? "1px solid rgba(192, 132, 252, 0.6)"
                    : "1px solid rgba(255, 255, 255, 0.15)",
                  color: leadGender === "F" ? "#e0ccff" : "rgba(255, 255, 255, 0.5)",
                }}
              >
                {femaleLabel}
              </button>
            </div>
          </div>
        </div>

        {isPower && (
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={save}
              disabled={!dirty || saving}
              className="px-4 py-2 rounded-xl text-sm font-medium text-white transition-opacity"
              style={{
                background: "linear-gradient(135deg, #7c3aed, #6366f1)",
                opacity: !dirty || saving ? 0.5 : 1,
                animation: dirty && !saving ? "pulse-save-voice 1.5s ease-in-out infinite" : "none",
              }}
            >
              {saving ? "Saving..." : saved ? "Saved!" : "Save"}
            </button>
            {dirty && (
              <p className="text-xs" style={{ color: "#c084fc" }}>
                Don&apos;t forget to save your selection!
              </p>
            )}
          </div>
        )}
        {!isPower && (
          <p className="mt-3 text-sm" style={{ color: "rgba(255, 255, 255, 0.5)" }}>
            Custom voices are available on the Power plan.{" "}
            <a
              href="/dashboard/settings#upgrade"
              className="underline"
              style={{ color: "#c084fc" }}
            >
              Upgrade to pick your hosts
            </a>
          </p>
        )}
      </div>
    </div>
    </>
  );
}
