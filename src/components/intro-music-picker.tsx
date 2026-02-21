"use client";

import { useState, useRef } from "react";

const TRACKS = [
  "Daily_Gist_Country_1.mp3",
  "Daily_Gist_Country_2.mp3",
  "Daily_Gist_Gospel_1.mp3",
  "Daily_Gist_Gospel_2.mp3",
  "Daily_Gist_Hip_Hop_Female.mp3",
  "Daily_Gist_Hip_Hop_Male.mp3",
  "Daily_Gist_Jazz.mp3",
  "Daily_Gist_K-Pop.mp3",
  "Daily_Gist_Latin.mp3",
  "Daily_Gist_Metal_1.mp3",
  "Daily_Gist_Metal_2.mp3",
  "Daily_Gist_Newsroom_1.mp3",
  "Daily_Gist_Newsroom_2.mp3",
  "Daily_Gist_Pop_Female.mp3",
  "Daily_Gist_Pop_Male_1.mp3",
  "Daily_Gist_Pop_Male_2.mp3",
  "Daily_Gist_Raggae.mp3",
  "Daily_Gist_RnB_Female.mp3",
  "Daily_Gist_RnB_Male.mp3",
  "Daily_Gist_Rock.mp3",
  "Daily_Gist_Trap_Rap.mp3",
];

function formatLabel(filename: string): string {
  return filename
    .replace("Daily_Gist_", "")
    .replace(".mp3", "")
    .replace(/_/g, " ");
}

export function IntroMusicPicker({
  currentTrack,
  isPower,
}: {
  currentTrack: string | null;
  isPower: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(currentTrack);
  const [playing, setPlaying] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const dirty = selected !== currentTrack;

  function togglePlay(track: string) {
    if (playing === track) {
      audioRef.current?.pause();
      setPlaying(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
    }

    const audio = new Audio(`/intro-music/${track}`);
    audio.onended = () => setPlaying(null);
    audio.play();
    audioRef.current = audio;
    setPlaying(track);
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/account/intro-music", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ track: selected }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
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
            Intro Music
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
          Choose a music intro for your daily podcast episodes.
        </p>

        <div className="flex gap-3">
          <select
            value={selected ?? ""}
            onChange={(e) => setSelected(e.target.value || null)}
            className="flex-1 px-3 py-2 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
            style={{
              background: "rgba(255, 255, 255, 0.1)",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              color: "#ffffff",
            }}
          >
            <option value="" style={{ color: "#1a0e2e" }}>None</option>
            {TRACKS.map((track) => (
              <option key={track} value={track} style={{ color: "#1a0e2e" }}>
                {formatLabel(track)}
              </option>
            ))}
          </select>
          {selected && (
            <button
              type="button"
              onClick={() => togglePlay(selected)}
              className="px-3 py-2 rounded-xl text-sm font-medium transition-colors"
              style={{
                background: playing === selected
                  ? "rgba(192, 132, 252, 0.35)"
                  : "rgba(192, 132, 252, 0.2)",
                color: "#e0ccff",
                border: "1px solid rgba(192, 132, 252, 0.4)",
              }}
            >
              {playing === selected ? "Stop" : "Preview"}
            </button>
          )}
          {isPower && (
            <button
              onClick={save}
              disabled={!dirty || saving}
              className="px-4 py-2 rounded-xl text-sm font-medium text-white transition-opacity"
              style={{
                background: "linear-gradient(135deg, #7c3aed, #6366f1)",
                opacity: !dirty || saving ? 0.5 : 1,
              }}
            >
              {saving ? "Saving..." : saved ? "Saved!" : "Save"}
            </button>
          )}
        </div>
        {!isPower && (
          <p className="mt-3 text-sm" style={{ color: "rgba(255, 255, 255, 0.5)" }}>
            Intro music is available on the Power plan.{" "}
            <a
              href="/dashboard/settings#upgrade"
              className="underline"
              style={{ color: "#c084fc" }}
            >
              Upgrade to add your vibe
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
