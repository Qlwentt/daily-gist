"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Instrument_Serif, DM_Sans } from "next/font/google";

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

const BAR_COUNT = 60;
const BAR_HEIGHTS = Array.from({ length: BAR_COUNT }, (_, i) => {
  return 15 + ((i * 37 + 13) % 71);
});

const DEMO_URL =
  "https://ysnulqtmdfphmpzrzelg.supabase.co/storage/v1/object/public/podcasts/47215626-1b26-47ad-a1f0-15fb2480b6f9/2026-03-04.mp3";

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function Home() {
  const router = useRouter();
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [handlingAuth, setHandlingAuth] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressBarRef = useRef<HTMLDivElement | null>(null);
  const revealRefs = useRef<HTMLElement[]>([]);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Detect auth hash fragments before paint. The blocking <script> in layout.tsx
  // hides the page via visibility:hidden; we restore it once React takes over.
  useLayoutEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("access_token") || hash.includes("error=")) {
      setHandlingAuth(true);
    } else {
      document.getElementById("__auth_hide")?.remove();
    }
  }, []);

  // Handle magic link redirect: Supabase redirects here with #access_token=...
  // or #error=... on failure. The SDK won't auto-detect hash fragments because
  // @supabase/ssr forces PKCE mode, so we handle them manually.
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;
    const params = new URLSearchParams(hash.replace("#", ""));

    if (params.get("access_token")) {
      const accessToken = params.get("access_token")!;
      const refreshToken = params.get("refresh_token")!;
      const supabase = createClient();
      supabase.auth
        .setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(() => router.replace("/dashboard"));
    } else if (params.get("error")) {
      // Expired/invalid magic link — send to login with error context
      const errorCode = params.get("error_code") || params.get("error") || "";
      router.replace(`/login?error=${encodeURIComponent(errorCode)}`);
    }
  }, [router]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).style.opacity = "1";
            (entry.target as HTMLElement).style.transform = "translateY(0)";
          }
        });
      },
      { threshold: 0.15 },
    );
    observerRef.current = observer;

    revealRefs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const audio = new Audio(DEMO_URL);
    audio.preload = "metadata";
    audioRef.current = audio;

    const onLoadedMetadata = () => setDuration(audio.duration);
    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      if (audio.duration) setProgress(audio.currentTime / audio.duration);
    };
    const onEnded = () => {
      setPlaying(false);
      setProgress(0);
      setCurrentTime(0);
    };

    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", onEnded);
      audio.pause();
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      audio.play();
    }
    setPlaying(!playing);
  };

  const seekAudio = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    const bar = progressBarRef.current;
    if (!audio || !bar || !audio.duration) return;
    const rect = bar.getBoundingClientRect();
    const fraction = Math.max(
      0,
      Math.min(1, (e.clientX - rect.left) / rect.width),
    );
    audio.currentTime = fraction * audio.duration;
  };

  const revealRef = useCallback((el: HTMLElement | null) => {
    if (el && !revealRefs.current.includes(el)) {
      el.style.opacity = "0";
      el.style.transform = "translateY(30px)";
      el.style.transition = "opacity 0.7s ease, transform 0.7s ease";
      revealRefs.current.push(el);
      observerRef.current?.observe(el);
    }
  }, []);

  if (handlingAuth) {
    // Restore visibility (hidden by the blocking script in layout.tsx)
    if (typeof document !== "undefined") {
      document.getElementById("__auth_hide")?.remove();
    }
    return (
      <div
        className={`${instrumentSerif.variable} ${dmSans.variable} min-h-screen flex items-center justify-center`}
        style={{
          fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
          background: "#faf7f2",
          color: "#1a0e2e",
        }}
      >
        <p className="text-sm" style={{ color: "#5a4d6b" }}>
          Signing you in...
        </p>
      </div>
    );
  }

  return (
    <div
      className={`${instrumentSerif.variable} ${dmSans.variable} min-h-screen overflow-x-hidden`}
      style={{
        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
        background: "#faf7f2",
        color: "#1a0e2e",
      }}
    >
      {/* NAV */}
      <nav
        className="fixed top-0 left-0 right-0 z-50 flex justify-between items-center px-8 py-5 backdrop-blur-xl"
        style={{
          background: "rgba(250, 247, 242, 0.85)",
          borderBottom: "1px solid rgba(45, 27, 78, 0.06)",
        }}
      >
        <Link
          href="#"
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
          <a
            href="#how-it-works"
            className="text-sm font-medium no-underline hidden md:inline hover:!text-[#1a0e2e]"
            style={{ color: "#5a4d6b" }}
          >
            How it works
          </a>
          <a
            href="#features"
            className="text-sm font-medium no-underline hidden md:inline hover:!text-[#1a0e2e]"
            style={{ color: "#5a4d6b" }}
          >
            Features
          </a>
          <a
            href="#pricing"
            className="text-sm font-medium no-underline hidden md:inline hover:!text-[#1a0e2e]"
            style={{ color: "#5a4d6b" }}
          >
            Pricing
          </a>
          <Link
            href="/explore"
            className="text-sm font-medium no-underline hidden md:inline hover:!text-[#1a0e2e]"
            style={{ color: "#5a4d6b" }}
          >
            Explore
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

      {/* HERO */}
      <section className="flex items-center px-8 pt-28 pb-10 relative overflow-hidden">
        <div
          className="absolute pointer-events-none rounded-full"
          style={{
            top: "-40%",
            right: "-20%",
            width: "70vw",
            height: "70vw",
            background:
              "radial-gradient(circle, rgba(157, 124, 216, 0.08) 0%, transparent 70%)",
          }}
        />
        <div
          className="absolute pointer-events-none rounded-full"
          style={{
            bottom: "-10%",
            left: "-10%",
            width: "40vw",
            height: "40vw",
            background:
              "radial-gradient(circle, rgba(232, 164, 74, 0.06) 0%, transparent 70%)",
          }}
        />

        <div className="max-w-[1200px] mx-auto grid grid-cols-1 md:grid-cols-[1.1fr_0.9fr] gap-16 items-center relative z-10">
          <div>
            <div
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium mb-6"
              style={{
                background: "rgba(45, 27, 78, 0.06)",
                border: "1px solid rgba(45, 27, 78, 0.1)",
                color: "#6b4c9a",
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full animate-pulse"
                style={{ background: "#4a9d6b" }}
              />
              Free for a limited time — early access now open
            </div>

            <h1
              className="mb-6"
              style={{
                fontFamily:
                  "var(--font-instrument-serif), 'Instrument Serif', serif",
                fontSize: "clamp(3rem, 5.5vw, 4.5rem)",
                lineHeight: 1.05,
                letterSpacing: "-0.03em",
                color: "#1a0e2e",
              }}
            >
              Your newsletters,
              <br />
              as a{" "}
              <em style={{ fontStyle: "italic", color: "#6b4c9a" }}>
                daily podcast
              </em>
            </h1>

            <p
              className="max-w-[480px] mb-8"
              style={{ fontSize: "1.2rem", lineHeight: 1.6, color: "#5a4d6b" }}
            >
              Hit play. Stay informed. Daily Gist turns your email newsletters
              into a conversational podcast you can enjoy on your morning
              commute.
            </p>

            <div className="flex items-center gap-4 flex-wrap">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl font-semibold no-underline transition-all hover:-translate-y-0.5"
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
              <a
                href="#how-it-works"
                className="px-6 py-3.5 rounded-xl font-medium no-underline hover:!text-[#1a0e2e]"
                style={{ color: "#5a4d6b" }}
              >
                See how it works
              </a>
            </div>
            <p className="mt-4 text-xs" style={{ color: "#8a7f96" }}>
              Currently supports Gmail only. More providers coming soon.
            </p>
          </div>

          {/* PLAYER */}
          <div>
            <div className="flex items-center gap-3 justify-center mb-5">
              <div
                className="h-px flex-1"
                style={{ background: "rgba(45, 27, 78, 0.12)" }}
              />
              <span
                className="flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold uppercase"
                style={{
                  letterSpacing: "0.1em",
                  color: "#6b4c9a",
                  background: "rgba(107, 76, 154, 0.08)",
                  border: "1px solid rgba(107, 76, 154, 0.15)",
                }}
              >
                <span
                  className="w-2 h-2 rounded-full animate-pulse"
                  style={{ background: "#6b4c9a" }}
                />
                Listen to a real episode
              </span>
              <div
                className="h-px flex-1"
                style={{ background: "rgba(45, 27, 78, 0.12)" }}
              />
            </div>
            <div
              className="rounded-2xl p-8 relative overflow-hidden"
              style={{
                background: "#1a0e2e",
                color: "#faf7f2",
                boxShadow: "0 24px 60px rgba(26, 14, 46, 0.25)",
              }}
            >
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    "radial-gradient(circle at 20% 20%, rgba(157, 124, 216, 0.15) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(232, 164, 74, 0.1) 0%, transparent 50%)",
                }}
              />

              <div className="flex items-center gap-4 mb-6 relative">
                <div
                  className="w-14 h-14 rounded-xl flex items-center justify-center text-lg font-bold flex-shrink-0"
                  style={{
                    fontFamily:
                      "var(--font-instrument-serif), 'Instrument Serif', serif",
                    background: "linear-gradient(135deg, #6b4c9a, #e8a44a)",
                  }}
                >
                  DG
                </div>
                <div>
                  <h3 className="text-base font-semibold mb-0.5">
                    Your Daily Gist
                  </h3>
                  <p
                    className="text-xs"
                    style={{ color: "rgba(250, 247, 242, 0.6)" }}
                  >
                    Mar 4, 2026 &middot; 10 min
                  </p>
                </div>
              </div>

              <div className="flex items-end gap-[2px] h-12 mb-4 relative px-1">
                {BAR_HEIGHTS.map((height, i) => {
                  const activeCount = Math.max(
                    1,
                    Math.floor(BAR_COUNT * progress),
                  );
                  const isActive = i < activeCount;
                  return (
                    <div
                      key={i}
                      className="flex-1 rounded-sm min-w-[2px]"
                      style={{
                        height: `${height * (isActive ? 1 : 0.5)}%`,
                        background: isActive
                          ? "#9d7cd8"
                          : "rgba(157, 124, 216, 0.3)",
                        animationName:
                          playing && isActive ? "waveAnim" : "none",
                        animationDuration: "0.8s",
                        animationTimingFunction: "ease-in-out",
                        animationIterationCount: "infinite",
                        animationDirection: "alternate",
                        animationDelay: `${(i * 0.03) % 0.5}s`,
                      }}
                    />
                  );
                })}
              </div>

              <div className="flex items-center gap-4 relative">
                <button
                  onClick={togglePlay}
                  className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 border-none cursor-pointer transition-transform hover:scale-110"
                  style={{ background: "#faf7f2" }}
                >
                  {playing ? (
                    <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]">
                      <rect x="6" y="4" width="4" height="16" fill="#1a0e2e" />
                      <rect x="14" y="4" width="4" height="16" fill="#1a0e2e" />
                    </svg>
                  ) : (
                    <svg
                      viewBox="0 0 24 24"
                      className="w-[18px] h-[18px] ml-0.5"
                    >
                      <polygon points="6,4 20,12 6,20" fill="#1a0e2e" />
                    </svg>
                  )}
                </button>
                <div
                  ref={progressBarRef}
                  onClick={seekAudio}
                  className="flex-1 h-[3px] rounded-sm relative overflow-hidden cursor-pointer"
                  style={{ background: "rgba(250, 247, 242, 0.15)" }}
                >
                  <div
                    className="absolute left-0 top-0 bottom-0 rounded-sm transition-[width] duration-200"
                    style={{
                      width: `${progress * 100}%`,
                      background: "#9d7cd8",
                    }}
                  />
                </div>
                <div
                  className="flex gap-4 text-xs"
                  style={{
                    color: "rgba(250, 247, 242, 0.5)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  <span>{formatTime(currentTime)}</span>
                  <span>{duration ? formatTime(duration) : "--:--"}</span>
                </div>
              </div>

              <div
                className="mt-6 pt-5 relative"
                style={{ borderTop: "1px solid rgba(250, 247, 242, 0.08)" }}
              >
                <div
                  className="text-[0.7rem] uppercase tracking-widest mb-3"
                  style={{ color: "rgba(250, 247, 242, 0.4)" }}
                >
                  Sources
                </div>
                <div className="flex flex-wrap gap-1">
                  {[
                    "TLDR",
                    "TLDR AI",
                    "Crunchbase Daily",
                    "Market Briefs",
                  ].map((topic) => (
                    <span
                      key={topic}
                      className="px-1.5 py-0.5 rounded-md text-[0.65rem] whitespace-nowrap"
                      style={{
                        background: "rgba(250, 247, 242, 0.08)",
                        color: "rgba(250, 247, 242, 0.7)",
                        border: "1px solid rgba(250, 247, 242, 0.06)",
                      }}
                    >
                      {topic}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SOCIAL PROOF */}
      <section className="py-6 px-8 text-center">
        <div
          className="flex items-center justify-center gap-8 flex-wrap text-sm"
          style={{ color: "#8a7f96" }}
        >
          {[
            { strong: "5+", text: "newsletters synthesized daily" },
            { strong: "10 min", text: "average episode" },
            { strong: "Most", text: "podcast apps" },
          ].map((item) => (
            <div key={item.strong} className="flex items-center gap-2">
              <strong className="font-semibold" style={{ color: "#1a0e2e" }}>
                {item.strong}
              </strong>
              {item.text}
            </div>
          ))}
        </div>
      </section>

      {/* EXPLORE CTA */}
      <section ref={revealRef} className="py-6 px-8 text-center">
        <div className="max-w-[600px] mx-auto">
          <p
            className="text-sm font-medium mb-4"
            style={{ color: "#5a4d6b" }}
          >
            Not sure yet? Hear it for yourself.
          </p>
          <Link
            href="/explore"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold no-underline transition-all hover:-translate-y-0.5"
            style={{
              background: "rgba(45, 27, 78, 0.06)",
              color: "#1a0e2e",
              border: "1px solid rgba(45, 27, 78, 0.1)",
            }}
          >
            Browse sample episodes
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
      </section>

      {/* HOW IT WORKS */}
      <section
        ref={revealRef}
        id="how-it-works"
        className="py-24 px-8 relative"
      >
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-4/5 h-px"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(45, 27, 78, 0.1), transparent)",
          }}
        />
        <div className="max-w-[1100px] mx-auto">
          <div
            className="text-xs uppercase font-semibold mb-3"
            style={{ letterSpacing: "0.15em", color: "#6b4c9a" }}
          >
            How it works
          </div>
          <h2
            className="mb-4"
            style={{
              fontFamily:
                "var(--font-instrument-serif), 'Instrument Serif', serif",
              fontSize: "clamp(2rem, 4vw, 3rem)",
              letterSpacing: "-0.02em",
              color: "#1a0e2e",
              lineHeight: 1.1,
            }}
          >
            Three steps. Then it&apos;s automatic.
          </h2>
          <p
            className="max-w-[540px] mb-14"
            style={{ fontSize: "1.1rem", color: "#5a4d6b", lineHeight: 1.6 }}
          >
            Set up once, wake up to a fresh podcast every morning. No apps to
            open, no links to click.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            <div
              className="hidden md:block absolute h-[2px] opacity-20"
              style={{
                top: "40px",
                left: "calc(16.66% + 1rem)",
                right: "calc(16.66% + 1rem)",
                background: "linear-gradient(90deg, #9d7cd8, #e8a44a)",
              }}
            />
            {[
              {
                num: "1",
                icon: "✉️",
                title: "Forward your newsletters",
                desc: "Set up a Gmail filter to auto-forward your newsletters to your unique Daily Gist address. Takes two minutes.",
                numBg:
                  "linear-gradient(135deg, rgba(45, 27, 78, 0.08), rgba(107, 76, 154, 0.12))",
                numColor: "#2d1b4e",
              },
              {
                num: "2",
                icon: "🎙️",
                title: "AI creates your podcast",
                desc: "Every morning, AI reads your newsletters, synthesizes the key stories, and generates a two-host conversational podcast.",
                numBg:
                  "linear-gradient(135deg, rgba(107, 76, 154, 0.1), rgba(157, 124, 216, 0.15))",
                numColor: "#6b4c9a",
              },
              {
                num: "3",
                icon: "🎧",
                title: "Listen in your podcast app",
                desc: "Subscribe with your private RSS feed. Episodes appear alongside your other shows — Apple Podcasts, Overcast, Pocket Casts, and more. Note: Spotify does not support private RSS feeds.",
                numBg:
                  "linear-gradient(135deg, rgba(232, 164, 74, 0.1), rgba(245, 204, 127, 0.15))",
                numColor: "#e8a44a",
              },
            ].map((step) => (
              <div key={step.num} className="text-center relative">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5 relative z-10 text-xl"
                  style={{
                    fontFamily:
                      "var(--font-instrument-serif), 'Instrument Serif', serif",
                    background: step.numBg,
                    color: step.numColor,
                  }}
                >
                  {step.num}
                </div>
                <div className="text-3xl mb-4">{step.icon}</div>
                <h3
                  className="text-lg font-semibold mb-2"
                  style={{ color: "#1a0e2e" }}
                >
                  {step.title}
                </h3>
                <p
                  className="text-sm max-w-[280px] mx-auto"
                  style={{ color: "#5a4d6b", lineHeight: 1.6 }}
                >
                  {step.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section
        ref={revealRef}
        id="features"
        className="py-24 px-8 relative overflow-hidden"
        style={{ background: "#1a0e2e", color: "#faf7f2" }}
      >
        <div
          className="absolute pointer-events-none"
          style={{
            top: "-200px",
            right: "-200px",
            width: "500px",
            height: "500px",
            background:
              "radial-gradient(circle, rgba(157, 124, 216, 0.1) 0%, transparent 70%)",
          }}
        />
        <div className="max-w-[1100px] mx-auto relative">
          <div
            className="text-xs uppercase font-semibold mb-3"
            style={{ letterSpacing: "0.15em", color: "#9d7cd8" }}
          >
            Why Daily Gist
          </div>
          <h2
            className="mb-4"
            style={{
              fontFamily:
                "var(--font-instrument-serif), 'Instrument Serif', serif",
              fontSize: "clamp(2rem, 4vw, 3rem)",
              letterSpacing: "-0.02em",
              color: "#faf7f2",
              lineHeight: 1.1,
            }}
          >
            Not just a summary.
            <br />A conversation.
          </h2>
          <p
            className="max-w-[540px] mb-14"
            style={{
              fontSize: "1.1rem",
              color: "rgba(250, 247, 242, 0.6)",
              lineHeight: 1.6,
            }}
          >
            Two AI hosts discuss, debate, and connect the dots across all your
            newsletters — so you don&apos;t have to.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              {
                icon: "🔗",
                title: "Cross-source synthesis",
                desc: "When multiple newsletters cover the same story, Daily Gist merges them into one deeper discussion instead of repeating.",
              },
              {
                icon: "⏰",
                title: "Ready when you are",
                desc: "Choose your generation time. Your podcast is waiting in your feed before your alarm goes off.",
              },
              {
                icon: "🎯",
                title: "Your newsletters, your podcast",
                desc: "Every episode is unique to you, built from the newsletters you actually subscribe to. Not a generic news recap.",
              },
              {
                icon: "📱",
                title: "Works with most podcast apps",
                desc: "Standard RSS feed. No proprietary app required. Compatible with Apple Podcasts, Overcast, Pocket Casts, and more. Spotify does not support private RSS feeds.",
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="rounded-2xl p-7 transition-colors"
                style={{
                  background: "rgba(250, 247, 242, 0.04)",
                  border: "1px solid rgba(250, 247, 242, 0.06)",
                }}
              >
                <div className="text-2xl mb-3">{feature.icon}</div>
                <h3 className="text-base font-semibold mb-1.5">
                  {feature.title}
                </h3>
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: "rgba(250, 247, 242, 0.55)" }}
                >
                  {feature.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section ref={revealRef} id="pricing" className="py-24 px-8 relative">
        <div className="max-w-[1100px] mx-auto text-center">
          <div
            className="text-xs uppercase font-semibold mb-3"
            style={{ letterSpacing: "0.15em", color: "#6b4c9a" }}
          >
            Pricing
          </div>
          <h2
            className="mb-4"
            style={{
              fontFamily:
                "var(--font-instrument-serif), 'Instrument Serif', serif",
              fontSize: "clamp(2rem, 4vw, 3rem)",
              letterSpacing: "-0.02em",
              color: "#1a0e2e",
              lineHeight: 1.1,
            }}
          >
            Simple plans, no surprises
          </h2>
          <p
            className="max-w-[540px] mx-auto mb-12"
            style={{ fontSize: "1.1rem", color: "#5a4d6b", lineHeight: 1.6 }}
          >
            Free during early access. Paid plans starting soon.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-[1050px] mx-auto items-start">
            {/* Free Edition */}
            <div
              className="bg-white rounded-2xl p-8 relative text-left transition-all hover:-translate-y-1"
              style={{ border: "1px solid rgba(45, 27, 78, 0.08)" }}
            >
              <div
                className="font-semibold text-lg mb-2"
                style={{ color: "#1a0e2e" }}
              >
                Free Edition
              </div>
              <div
                className="mb-1"
                style={{
                  fontFamily:
                    "var(--font-instrument-serif), 'Instrument Serif', serif",
                  fontSize: "3rem",
                  color: "#1a0e2e",
                  letterSpacing: "-0.03em",
                  lineHeight: 1,
                }}
              >
                $0
              </div>
              <p
                className="text-sm mb-6"
                style={{ color: "#5a4d6b", lineHeight: 1.5 }}
              >
                Listen to curated podcasts from popular newsletter categories.
              </p>
              <ul className="list-none mb-8 space-y-2 p-0">
                {[
                  "Pick a newsletter category",
                  "Daily podcast generation",
                  "Private RSS feed",
                  "Works with most podcast apps",
                ].map((f) => (
                  <li
                    key={f}
                    className="flex items-center gap-2.5 text-sm"
                    style={{ color: "#5a4d6b" }}
                  >
                    <span
                      className="font-bold text-sm"
                      style={{ color: "#4a9d6b" }}
                    >
                      ✓
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/login"
                className="block w-full py-3.5 rounded-xl text-center no-underline font-semibold transition-all hover:bg-[rgba(45,27,78,0.1)]"
                style={{
                  background: "rgba(45, 27, 78, 0.06)",
                  color: "#1a0e2e",
                  fontSize: "0.95rem",
                }}
              >
                Get started
              </Link>
            </div>

            {/* Basic Edition */}
            <div
              className="bg-white rounded-2xl p-8 relative text-left transition-all hover:-translate-y-1"
              style={{ border: "1px solid rgba(45, 27, 78, 0.08)" }}
            >
              <div
                className="font-semibold text-lg mb-2"
                style={{ color: "#1a0e2e" }}
              >
                Basic Edition
              </div>
              <div
                className="mb-1"
                style={{
                  fontFamily:
                    "var(--font-instrument-serif), 'Instrument Serif', serif",
                  fontSize: "3rem",
                  color: "#1a0e2e",
                  letterSpacing: "-0.03em",
                  lineHeight: 1,
                }}
              >
                $15
                <span
                  className="text-base"
                  style={{
                    fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
                    color: "#8a7f96",
                  }}
                >
                  /mo
                </span>
              </div>
              <p
                className="text-sm mb-6"
                style={{ color: "#5a4d6b", lineHeight: 1.5 }}
              >
                Your own newsletters, turned into a daily podcast.
              </p>
              <ul className="list-none mb-8 space-y-2 p-0">
                {[
                  "Made with your own newsletters",
                  "Daily podcast generation",
                  "Choose your delivery time",
                  "Private RSS feed",
                ].map((f) => (
                  <li
                    key={f}
                    className="flex items-center gap-2.5 text-sm"
                    style={{ color: "#5a4d6b" }}
                  >
                    <span
                      className="font-bold text-sm"
                      style={{ color: "#4a9d6b" }}
                    >
                      ✓
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/login"
                className="block w-full py-3.5 rounded-xl text-center no-underline font-semibold transition-all hover:bg-[rgba(45,27,78,0.1)]"
                style={{
                  background: "rgba(45, 27, 78, 0.06)",
                  color: "#1a0e2e",
                  fontSize: "0.95rem",
                }}
              >
                Start listening free
              </Link>
            </div>

            {/* Special Edition */}
            <div
              className="bg-white rounded-2xl p-8 relative text-left transition-all hover:-translate-y-1"
              style={{
                border: "1px solid #6b4c9a",
                boxShadow: "0 8px 32px rgba(107, 76, 154, 0.12)",
              }}
            >
              <div
                className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-[0.7rem] font-semibold uppercase"
                style={{
                  background: "linear-gradient(135deg, #2d1b4e, #6b4c9a)",
                  color: "#faf7f2",
                  letterSpacing: "0.05em",
                }}
              >
                Most Popular
              </div>
              <div
                className="font-semibold text-lg mb-2"
                style={{ color: "#1a0e2e" }}
              >
                Special Edition
              </div>
              <div
                className="mb-1"
                style={{
                  fontFamily:
                    "var(--font-instrument-serif), 'Instrument Serif', serif",
                  fontSize: "3rem",
                  color: "#1a0e2e",
                  letterSpacing: "-0.03em",
                  lineHeight: 1,
                }}
              >
                $25
                <span
                  className="text-base"
                  style={{
                    fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
                    color: "#8a7f96",
                  }}
                >
                  /mo
                </span>
              </div>
              <p
                className="text-sm mb-6"
                style={{ color: "#5a4d6b", lineHeight: 1.5 }}
              >
                Make it truly yours.
              </p>
              <ul className="list-none mb-8 space-y-2 p-0">
                {[
                  "Everything in Basic",
                  "Choose your podcast voices",
                  "Personalized name greeting",
                  "Intro music",
                  "Up to 7 podcast collections",
                ].map((f) => (
                  <li
                    key={f}
                    className="flex items-center gap-2.5 text-sm"
                    style={{ color: "#5a4d6b" }}
                  >
                    <span
                      className="font-bold text-sm"
                      style={{ color: "#4a9d6b" }}
                    >
                      ✓
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/login"
                className="block w-full py-3.5 rounded-xl text-center no-underline font-semibold transition-all hover:-translate-y-px"
                style={{
                  background: "#1a0e2e",
                  color: "#faf7f2",
                  fontSize: "0.95rem",
                }}
              >
                Start listening free
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section ref={revealRef} id="faq" className="py-24 px-8 relative">
        <div className="max-w-[680px] mx-auto">
          <div className="text-center mb-12">
            <div
              className="text-xs uppercase font-semibold mb-3"
              style={{ letterSpacing: "0.15em", color: "#6b4c9a" }}
            >
              FAQ
            </div>
            <h2
              style={{
                fontFamily:
                  "var(--font-instrument-serif), 'Instrument Serif', serif",
                fontSize: "clamp(2rem, 4vw, 3rem)",
                letterSpacing: "-0.02em",
                color: "#1a0e2e",
                lineHeight: 1.1,
              }}
            >
              Questions? Answered.
            </h2>
          </div>

          <div
            className="space-y-3"
          >
            {[
              {
                q: "What is Daily Gist?",
                a: "Daily Gist turns your email newsletters into a short, conversational podcast you can listen to on the go. Instead of reading through a pile of newsletters, just hit play during your commute or workout.",
              },
              {
                q: "How does it work?",
                a: "Forward your newsletters to your unique Daily Gist email address. Each day, we synthesize everything into a natural two-host conversation and deliver it to your podcast app via a private RSS feed.",
              },
              {
                q: "Which podcast apps does it work with?",
                a: "Any app that supports RSS feeds \u2014 Apple Podcasts, Overcast, Pocket Casts, Castro, and more. Spotify does not currently support private RSS feeds, so it won\u2019t work there.",
              },
              {
                q: "What\u2019s the difference between the plans?",
                a: "The Free Edition lets you listen to curated podcasts from popular newsletter categories. Basic Edition uses your own forwarded newsletters. Special Edition adds custom voices, personalized name greetings, intro music, and up to 7 separate podcast collections.",
              },
              {
                q: "Can I try it before paying?",
                a: "Every new account starts with a 7-day free trial of the Special Edition, so you can experience the full feature set before deciding. After that, you can continue with a paid plan or switch to the Free Edition.",
              },
              {
                q: "How long are the episodes?",
                a: "About 10 minutes. The AI distills your newsletters into a concise, two-host conversation \u2014 long enough to cover the highlights, short enough for a commute.",
              },
              {
                q: "What if I don\u2019t get any newsletters one day?",
                a: "No newsletters, no episode \u2014 simple as that. You\u2019ll only get a podcast when there\u2019s something to talk about.",
              },
            ].map(({ q, a }) => (
              <details
                key={q}
                className="group bg-white rounded-2xl transition-all"
                style={{ border: "1px solid rgba(45, 27, 78, 0.08)" }}
              >
                <summary
                  className="flex items-center justify-between cursor-pointer px-6 py-5 text-left font-medium select-none list-none [&::-webkit-details-marker]:hidden"
                  style={{ color: "#1a0e2e" }}
                >
                  {q}
                  <svg
                    className="flex-shrink-0 ml-4 transition-transform group-open:rotate-45"
                    width="20"
                    height="20"
                    viewBox="0 0 20 20"
                    fill="none"
                  >
                    <path
                      d="M10 4v12m-6-6h12"
                      stroke="#6b4c9a"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </summary>
                <div
                  className="px-6 pb-5 text-sm leading-relaxed"
                  style={{ color: "#5a4d6b" }}
                >
                  {a}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section ref={revealRef} className="py-24 px-8 text-center relative">
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-4/5 h-px"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(45, 27, 78, 0.1), transparent)",
          }}
        />
        <h2
          className="mb-4"
          style={{
            fontFamily:
              "var(--font-instrument-serif), 'Instrument Serif', serif",
            fontSize: "clamp(2rem, 4vw, 3rem)",
            color: "#1a0e2e",
            letterSpacing: "-0.02em",
          }}
        >
          Hit play. Stay informed.
        </h2>
        <p
          className="max-w-[480px] mx-auto mb-8"
          style={{ fontSize: "1.1rem", color: "#5a4d6b", lineHeight: 1.6 }}
        >
          Your newsletters are piling up. Let Daily Gist turn them into your
          favorite new podcast.
        </p>
        <Link
          href="/login"
          className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl font-semibold no-underline transition-all hover:-translate-y-0.5"
          style={{ background: "#1a0e2e", color: "#faf7f2" }}
        >
          Get started — it&apos;s free
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
      </section>

      {/* FOOTER */}
      <footer
        className="py-12 px-8 text-center text-sm"
        style={{ color: "#8a7f96" }}
      >
        <p>&copy; 2026 Daily Gist</p>
      </footer>

      <style>{`
        @keyframes waveAnim {
          from { transform: scaleY(0.4); }
          to { transform: scaleY(1); }
        }
      `}</style>
    </div>
  );
}
