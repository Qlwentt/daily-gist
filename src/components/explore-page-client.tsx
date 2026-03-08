"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import { Instrument_Serif, DM_Sans } from "next/font/google";
import { getVoiceAlias } from "@/lib/voices";
import type { ExploreEpisode } from "@/app/explore/page";

const instrumentSerif = Instrument_Serif({
  weight: "400",
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
});

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  return `${m} min`;
}

function formatIntroMusic(intro: string): string {
  // "Daily_Gist_Jazz.mp3" → "Jazz"
  return intro
    .replace(/^Daily_Gist_/i, "")
    .replace(/\.\w+$/, "")
    .replace(/_/g, " ");
}

export function ExplorePageClient({
  episodes,
  categories,
}: {
  episodes: ExploreEpisode[];
  categories: string[];
}) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playingIdRef = useRef<string | null>(null);

  const filtered = activeCategory
    ? episodes.filter((e) => e.category === activeCategory)
    : episodes;

  const togglePlay = useCallback(
    (episode: ExploreEpisode) => {
      // If clicking the same episode, toggle pause/play
      if (playingIdRef.current === episode.id && audioRef.current) {
        if (audioRef.current.paused) {
          audioRef.current.play();
          setPlayingId(episode.id);
        } else {
          audioRef.current.pause();
          setPlayingId(null);
        }
        return;
      }

      // Stop any currently playing audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeEventListener("timeupdate", handleTimeUpdate);
        audioRef.current.removeEventListener("ended", handleEnded);
      }

      const audio = new Audio(episode.audio_url);
      audio.preload = "metadata";

      function handleTimeUpdate() {
        if (audio.duration) {
          setProgress((prev) => ({
            ...prev,
            [episode.id]: audio.currentTime / audio.duration,
          }));
        }
      }

      function handleEnded() {
        setPlayingId(null);
        playingIdRef.current = null;
        setProgress((prev) => ({ ...prev, [episode.id]: 0 }));
      }

      audio.addEventListener("timeupdate", handleTimeUpdate);
      audio.addEventListener("ended", handleEnded);
      audio.play();

      audioRef.current = audio;
      playingIdRef.current = episode.id;
      setPlayingId(episode.id);
    },
    []
  );

  return (
    <div
      className={`${instrumentSerif.variable} ${dmSans.variable} min-h-screen`}
      style={{
        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
        background: "#faf7f2",
        color: "#1a0e2e",
      }}
    >
      {/* Nav */}
      <nav
        className="fixed top-0 left-0 right-0 z-50 flex justify-between items-center px-8 py-5 backdrop-blur-xl"
        style={{
          background: "rgba(250, 247, 242, 0.85)",
          borderBottom: "1px solid rgba(45, 27, 78, 0.06)",
        }}
      >
        <Link
          href="/"
          className="text-2xl no-underline"
          style={{
            fontFamily:
              "var(--font-instrument-serif), 'Instrument Serif', serif",
            color: "#1a0e2e",
            letterSpacing: "-0.02em",
          }}
        >
          Daily Gist
        </Link>
        <div className="flex items-center gap-8">
          <Link
            href="/"
            className="text-sm font-medium no-underline hidden md:inline"
            style={{ color: "#1a0e2e" }}
          >
            Home
          </Link>
          <Link
            href="/login"
            className="text-sm font-medium no-underline px-5 py-2.5 rounded-lg transition-all hover:-translate-y-px"
            style={{ background: "#1a0e2e", color: "#faf7f2" }}
          >
            Start listening
          </Link>
        </div>
      </nav>

      {/* Header */}
      <div className="pt-32 pb-8 px-8">
        <div className="max-w-[1200px] mx-auto">
          <div
            className="text-xs uppercase font-semibold mb-3"
            style={{ letterSpacing: "0.15em", color: "#6b4c9a" }}
          >
            Explore
          </div>
          <h1
            className="mb-3"
            style={{
              fontFamily:
                "var(--font-instrument-serif), 'Instrument Serif', serif",
              fontSize: "clamp(2rem, 4vw, 3rem)",
              letterSpacing: "-0.02em",
              color: "#1a0e2e",
              lineHeight: 1.1,
            }}
          >
            Listen before you sign up
          </h1>
          <p
            className="max-w-[540px] mb-8"
            style={{ fontSize: "1.1rem", color: "#5a4d6b", lineHeight: 1.6 }}
          >
            Sample episodes inspired by popular newsletters. Pick a topic you
            care about and hit play.
          </p>

          {/* Category pills */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setActiveCategory(null)}
              className="px-4 py-2 rounded-full text-sm font-medium transition-all border-none cursor-pointer"
              style={{
                background: activeCategory === null ? "#1a0e2e" : "white",
                color: activeCategory === null ? "#faf7f2" : "#5a4d6b",
                border:
                  activeCategory === null
                    ? "1px solid #1a0e2e"
                    : "1px solid rgba(45, 27, 78, 0.12)",
              }}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() =>
                  setActiveCategory(activeCategory === cat ? null : cat)
                }
                className="px-4 py-2 rounded-full text-sm font-medium transition-all border-none cursor-pointer"
                style={{
                  background: activeCategory === cat ? "#1a0e2e" : "white",
                  color: activeCategory === cat ? "#faf7f2" : "#5a4d6b",
                  border:
                    activeCategory === cat
                      ? "1px solid #1a0e2e"
                      : "1px solid rgba(45, 27, 78, 0.12)",
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Episode grid */}
      <div className="px-8 pb-16">
        <div className="max-w-[1200px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((episode) => (
            <EpisodeCard
              key={episode.id}
              episode={episode}
              isPlaying={playingId === episode.id}
              progress={progress[episode.id] ?? 0}
              onTogglePlay={() => togglePlay(episode)}
              onSeek={(fraction) => {
                if (audioRef.current && playingIdRef.current === episode.id && audioRef.current.duration) {
                  audioRef.current.currentTime = fraction * audioRef.current.duration;
                }
              }}
            />
          ))}

          {/* CTA card */}
          <div
            className="rounded-2xl p-8 flex flex-col items-center justify-center text-center"
            style={{
              background: "white",
              border: "1px solid rgba(45, 27, 78, 0.08)",
              minHeight: "280px",
            }}
          >
            <div
              className="w-14 h-14 rounded-xl flex items-center justify-center text-lg font-bold mb-4"
              style={{
                fontFamily:
                  "var(--font-instrument-serif), 'Instrument Serif', serif",
                background: "linear-gradient(135deg, #6b4c9a, #e8a44a)",
                color: "#faf7f2",
              }}
            >
              DG
            </div>
            <h3
              className="text-xl mb-2"
              style={{
                fontFamily:
                  "var(--font-instrument-serif), 'Instrument Serif', serif",
                color: "#1a0e2e",
                letterSpacing: "-0.02em",
              }}
            >
              Get your own podcast
            </h3>
            <p
              className="text-sm mb-5"
              style={{ color: "#5a4d6b", lineHeight: 1.6 }}
            >
              Forward your newsletters and get a personalized daily episode.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold no-underline transition-all hover:-translate-y-0.5 text-sm"
              style={{ background: "#1a0e2e", color: "#faf7f2" }}
            >
              Start listening free
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M3 8h10m0 0L9 4m4 4L9 12"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer
        className="py-12 px-8 text-center text-sm"
        style={{ color: "#8a7f96" }}
      >
        <p>&copy; 2026 Daily Gist</p>
      </footer>
    </div>
  );
}

function EpisodeCard({
  episode,
  isPlaying,
  progress,
  onTogglePlay,
  onSeek,
}: {
  episode: ExploreEpisode;
  isPlaying: boolean;
  progress: number;
  onTogglePlay: () => void;
  onSeek: (fraction: number) => void;
}) {
  const hostAlias = episode.host_voice
    ? getVoiceAlias(episode.host_voice)
    : null;
  const guestAlias = episode.guest_voice
    ? getVoiceAlias(episode.guest_voice)
    : null;
  const introLabel = episode.intro_music
    ? formatIntroMusic(episode.intro_music)
    : null;

  const voiceLine =
    hostAlias && guestAlias ? `Hosted by ${hostAlias} & ${guestAlias}` : null;
  const metaLine = [voiceLine, introLabel ? `${introLabel} intro` : null]
    .filter(Boolean)
    .join(" \u00B7 ");

  return (
    <div
      className="rounded-2xl overflow-hidden flex flex-row"
      style={{
        background: "white",
        border: "1px solid rgba(45, 27, 78, 0.08)",
      }}
    >
      {/* Square thumbnail */}
      {episode.cover_image_url && (
        <div className="relative flex-shrink-0 w-32 md:w-36">
          <img
            src={episode.cover_image_url}
            alt={episode.title}
            className="w-full h-full object-cover"
          />
          {/* Category badge */}
          <span
            className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[0.6rem] font-medium"
            style={{
              background: "rgba(26, 14, 46, 0.75)",
              color: "#faf7f2",
              backdropFilter: "blur(8px)",
            }}
          >
            {episode.category}
          </span>
        </div>
      )}

      {/* Content */}
      <div className="p-4 flex-1 flex flex-col min-w-0">
        {/* Category badge (if no cover image) */}
        {!episode.cover_image_url && (
          <span
            className="self-start px-2.5 py-1 rounded-full text-xs font-medium mb-2"
            style={{
              background: "rgba(107, 76, 154, 0.1)",
              color: "#6b4c9a",
            }}
          >
            {episode.category}
          </span>
        )}

        <h3
          className="text-base mb-1"
          style={{
            fontFamily:
              "var(--font-instrument-serif), 'Instrument Serif', serif",
            color: "#1a0e2e",
            letterSpacing: "-0.01em",
            lineHeight: 1.2,
          }}
        >
          {episode.title}
        </h3>

        <p
          className="text-xs mb-2"
          style={{
            color: "#5a4d6b",
            lineHeight: 1.5,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {episode.description}
        </p>

        {/* Duration + source pills */}
        <div className="flex items-center gap-1.5 flex-wrap mb-2">
          {episode.duration_seconds && (
            <span className="text-[0.65rem]" style={{ color: "#8a7f96" }}>
              {formatDuration(episode.duration_seconds)}
            </span>
          )}
          {episode.source_newsletters &&
            episode.source_newsletters.length > 0 && (
              <>
                {episode.duration_seconds && (
                  <span
                    className="text-[0.65rem]"
                    style={{ color: "rgba(45, 27, 78, 0.2)" }}
                  >
                    &middot;
                  </span>
                )}
                {episode.source_newsletters.map((source) => (
                  <span
                    key={source}
                    className="px-1.5 py-0.5 rounded-md text-[0.6rem]"
                    style={{
                      background: "rgba(45, 27, 78, 0.05)",
                      color: "#8a7f96",
                      border: "1px solid rgba(45, 27, 78, 0.06)",
                    }}
                  >
                    {source}
                  </span>
                ))}
              </>
            )}
        </div>

        {/* Voice/intro meta */}
        {metaLine && (
          <p className="text-[0.65rem] mb-2" style={{ color: "#8a7f96" }}>
            {metaLine}
          </p>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Inline player */}
        <div className="flex items-center gap-2">
          <button
            onClick={onTogglePlay}
            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border-none cursor-pointer transition-transform hover:scale-105"
            style={{
              background: isPlaying ? "#6b4c9a" : "#1a0e2e",
            }}
          >
            {isPlaying ? (
              <svg viewBox="0 0 24 24" className="w-3 h-3">
                <rect x="6" y="4" width="4" height="16" fill="#faf7f2" />
                <rect x="14" y="4" width="4" height="16" fill="#faf7f2" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="w-3 h-3 ml-0.5">
                <polygon points="6,4 20,12 6,20" fill="#faf7f2" />
              </svg>
            )}
          </button>
          <div
            className="flex-1 h-1 rounded-full overflow-hidden cursor-pointer"
            style={{ background: "rgba(45, 27, 78, 0.08)" }}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              onSeek(fraction);
            }}
          >
            <div
              className="h-full rounded-full transition-[width] duration-200"
              style={{
                width: `${progress * 100}%`,
                background: "#6b4c9a",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
