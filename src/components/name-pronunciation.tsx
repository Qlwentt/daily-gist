"use client";

import { useState, useRef } from "react";

export function NamePronunciation({
  currentDisplayName,
  currentPhonetic,
}: {
  currentDisplayName: string | null;
  currentPhonetic: string | null;
}) {
  const [displayName, setDisplayName] = useState(currentDisplayName ?? "");
  const [phonetic, setPhonetic] = useState(currentPhonetic ?? "");
  const [committedName, setCommittedName] = useState(currentDisplayName ?? "");
  const [committedPhonetic, setCommittedPhonetic] = useState(currentPhonetic ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const dirty = displayName !== committedName || phonetic !== committedPhonetic;
  const previewName = phonetic.trim() || displayName.trim();
  const previewBusy = loading || playing;

  async function preview() {
    if (!previewName) return;

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    setLoading(true);
    setPlaying(false);
    try {
      const res = await fetch("/api/account/name-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phonetic_name: previewName,
        }),
      });

      if (!res.ok) {
        console.error("Preview failed:", res.status);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      setLoading(false);
      setPlaying(true);
      audio.onended = () => {
        setPlaying(false);
        URL.revokeObjectURL(url);
      };
      audio.play();
      audioRef.current = audio;
    } catch (err) {
      console.error("Preview error:", err);
    } finally {
      setLoading(false);
      if (!audioRef.current) setPlaying(false);
    }
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/account/name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: displayName,
          display_name_phonetic: phonetic,
        }),
      });
      if (res.ok) {
        setCommittedName(displayName);
        setCommittedPhonetic(phonetic);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <style>{`@keyframes pulse-save-name { 0%, 100% { box-shadow: 0 0 0 0 rgba(124, 58, 237, 0.5); } 50% { box-shadow: 0 0 0 6px rgba(124, 58, 237, 0); } }`}</style>
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
              Personalized Greeting
            </h2>
            <span
              className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
              style={{
                background: "linear-gradient(135deg, #c084fc, #818cf8)",
                color: "#ffffff",
                letterSpacing: "0.1em",
              }}
            >
              Special Edition
            </span>
          </div>
          <p className="text-sm mb-4" style={{ color: "rgba(255, 255, 255, 0.6)" }}>
            Hear your name in the podcast intro and outro. Add a phonetic spelling
            if the default pronunciation isn&apos;t right.
          </p>

          <div className="space-y-3">
            <div>
              <label
                className="text-xs font-medium uppercase mb-1 block"
                style={{ color: "rgba(255, 255, 255, 0.5)", letterSpacing: "0.05em" }}
              >
                Your name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Quai"
                maxLength={50}
                className="w-full px-3 py-2 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
                style={{
                  background: "rgba(255, 255, 255, 0.1)",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  color: "#ffffff",
                }}
              />
            </div>

            <div>
              <label
                className="text-xs font-medium uppercase mb-1 block"
                style={{ color: "rgba(255, 255, 255, 0.5)", letterSpacing: "0.05em" }}
              >
                Phonetic spelling
                <span className="normal-case font-normal ml-1" style={{ color: "rgba(255, 255, 255, 0.35)" }}>
                  — how it sounds
                </span>
              </label>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={phonetic}
                  onChange={(e) => setPhonetic(e.target.value)}
                  placeholder="e.g. Kwai"
                  maxLength={50}
                  className="flex-1 px-3 py-2 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
                  style={{
                    background: "rgba(255, 255, 255, 0.1)",
                    border: "1px solid rgba(255, 255, 255, 0.2)",
                    color: "#ffffff",
                  }}
                />
                <button
                  type="button"
                  onClick={preview}
                  disabled={!previewName || previewBusy}
                  className="px-3 py-2 rounded-xl text-sm font-medium transition-colors"
                  style={{
                    background: previewBusy
                      ? "rgba(192, 132, 252, 0.35)"
                      : "rgba(192, 132, 252, 0.2)",
                    color: "#e0ccff",
                    border: "1px solid rgba(192, 132, 252, 0.4)",
                    opacity: !previewName || previewBusy ? 0.5 : 1,
                  }}
                >
                  {loading ? "Generating..." : playing ? "Playing..." : "Preview"}
                </button>
              </div>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={save}
              disabled={!dirty || saving}
              className="px-4 py-2 rounded-xl text-sm font-medium text-white transition-opacity"
              style={{
                background: "linear-gradient(135deg, #7c3aed, #6366f1)",
                opacity: !dirty || saving ? 0.5 : 1,
                animation: dirty && !saving ? "pulse-save-name 1.5s ease-in-out infinite" : "none",
              }}
            >
              {saving ? "Saving..." : saved ? "Saved!" : "Save"}
            </button>
            {dirty && (
              <p className="text-xs" style={{ color: "#c084fc" }}>
                Don&apos;t forget to save!
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
