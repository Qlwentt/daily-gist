"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { CopyButton } from "@/components/copy-button";
import { IntroMusicPicker } from "@/components/intro-music-picker";

type Email = {
  id: string;
  from_name: string | null;
  from_email: string;
  subject: string | null;
  received_at: string;
};

type EpisodeStatus = {
  id: string;
  status: string;
  audio_url: string | null;
  title: string | null;
  error_message: string | null;
  progress_stage: string | null;
};

type NewsletterSource = {
  id: string;
  sender_email: string;
  sender_name: string | null;
};

const TOTAL_STEPS = 4;

const PROGRESS_STAGES: Record<string, string> = {
  outline: "Planning your episode...",
  first_half: "Writing the first half of the script...",
  second_half: "Writing the second half of the script...",
  audio: "Generating audio (this is the longest step)...",
  uploading: "Uploading your episode...",
};

const URL_REGEX = /(https?:\/\/[^\s]+)/g;

function linkify(text: string): ReactNode[] {
  const parts = text.split(URL_REGEX);
  return parts.map((part, i) =>
    URL_REGEX.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="underline break-all"
      >
        {part}
      </a>
    ) : (
      part
    )
  );
}

export function OnboardingFlow({
  forwardingAddress,
  feedUrl,
  initialStep = 1,
  initialEpisode = null,
  tier = "free",
  currentIntroMusic = null,
}: {
  forwardingAddress: string;
  feedUrl: string;
  initialStep?: 1 | 2 | 3 | 4;
  initialEpisode?: EpisodeStatus | null;
  tier?: string;
  currentIntroMusic?: string | null;
}) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(initialStep);
  const [emails, setEmails] = useState<Email[]>([]);
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [episodeId, setEpisodeId] = useState<string | null>(
    initialEpisode?.id ?? null
  );
  const [episode, setEpisode] = useState<EpisodeStatus | null>(initialEpisode);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const supabase = createClient();

  const toggleExclude = useCallback((id: string) => {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Check for ?filter_created=true on mount (return from GAS)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("filter_created") === "true") {
      setStep(4);
      // Clean up URL
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // Poll for incoming emails (Screen 1)
  useEffect(() => {
    if (step !== 1) return;

    const poll = async () => {
      const { data } = await supabase
        .from("raw_emails")
        .select("id, from_name, from_email, subject, received_at")
        .is("processed_at", null)
        .order("received_at", { ascending: false });

      if (data) setEmails(data);
    };

    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [step, supabase]);

  // Poll for episode status (Screen 2)
  useEffect(() => {
    if (step !== 2 || !episodeId) return;

    const poll = async () => {
      const { data } = await supabase
        .from("episodes")
        .select("id, status, audio_url, title, error_message, progress_stage")
        .eq("id", episodeId)
        .single<EpisodeStatus>();

      if (data) {
        setEpisode(data);
        if (data.status === "ready" && data.audio_url) {
          setStep(3);
        } else if (data.status === "failed") {
          setGenerateError(data.error_message || "Generation failed");
        }
      }
    };

    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [step, episodeId, supabase]);

  const handleGenerate = useCallback(async () => {
    setGenerateError(null);
    setStep(2);

    try {
      // Delete excluded emails before generating
      if (excludedIds.size > 0) {
        const { error: deleteError } = await supabase
          .from("raw_emails")
          .delete()
          .in("id", [...excludedIds]);

        if (deleteError) {
          setGenerateError("Failed to remove excluded emails");
          return;
        }
      }

      const res = await fetch("/api/episodes/generate-now", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setGenerateError(data.error || "Failed to start generation");
        return;
      }

      setEpisodeId(data.episode_id);
    } catch {
      setGenerateError("Failed to connect to server");
    }
  }, [excludedIds, supabase]);

  const handleComplete = useCallback(async () => {
    await fetch("/api/onboarding/complete", { method: "POST" });
    window.location.href = "/dashboard";
  }, []);

  return (
    <div className="max-w-2xl space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors"
              style={{
                background: step >= s
                  ? "linear-gradient(135deg, #6b4c9a, #9d7cd8)"
                  : "rgba(45, 27, 78, 0.08)",
                color: step >= s ? "#faf7f2" : "#8a7f96",
              }}
            >
              {step > s ? (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="2,7 5.5,10.5 12,4" />
                </svg>
              ) : (
                s
              )}
            </div>
            {s < TOTAL_STEPS && (
              <div
                className="w-12 h-0.5 rounded"
                style={{
                  background: step > s
                    ? "#6b4c9a"
                    : "rgba(45, 27, 78, 0.08)",
                }}
              />
            )}
          </div>
        ))}
      </div>

      {step === 1 && (
        <ForwardStep
          forwardingAddress={forwardingAddress}
          emails={emails}
          excludedIds={excludedIds}
          onToggleExclude={toggleExclude}
          onGenerate={handleGenerate}
          tier={tier}
          currentIntroMusic={currentIntroMusic}
        />
      )}

      {step === 2 && (
        <GeneratingStep
          progressStage={episode?.progress_stage ?? null}
          error={generateError}
          onRetry={handleGenerate}
        />
      )}

      {step === 3 && episode && (
        <ReadyStep
          episode={episode}
          feedUrl={feedUrl}
          onNext={() => setStep(4)}
        />
      )}

      {step === 4 && (
        <FilterSetupStep
          forwardingAddress={forwardingAddress}
          onComplete={handleComplete}
        />
      )}
    </div>
  );
}

function ForwardStep({
  forwardingAddress,
  emails,
  excludedIds,
  onToggleExclude,
  onGenerate,
  tier,
  currentIntroMusic,
}: {
  forwardingAddress: string;
  emails: Email[];
  excludedIds: Set<string>;
  onToggleExclude: (id: string) => void;
  onGenerate: () => void;
  tier: string;
  currentIntroMusic: string | null;
}) {
  return (
    <>
      <div>
        <h1
          className="text-2xl"
          style={{
            fontFamily: "var(--font-instrument-serif), serif",
            letterSpacing: "-0.02em",
          }}
        >
          Forward Your Newsletters
        </h1>
        <p className="text-sm mt-1" style={{ color: "#5a4d6b" }}>
          Go to your inbox and forward a few newsletters to this address.
        </p>
      </div>

      {/* Forwarding address */}
      <div
        className="bg-white rounded-2xl p-6"
        style={{ border: "1px solid rgba(45, 27, 78, 0.08)" }}
      >
        <p className="text-sm font-medium mb-3" style={{ color: "#1a0e2e" }}>
          Your forwarding address
        </p>
        <div
          className="flex items-center gap-2 p-3 rounded-xl"
          style={{ background: "rgba(45, 27, 78, 0.04)" }}
        >
          <code
            className="flex-1 text-sm break-all"
            style={{ color: "#1a0e2e" }}
          >
            {forwardingAddress}
          </code>
          <CopyButton text={forwardingAddress} />
        </div>
        <p className="text-xs mt-3" style={{ color: "#8a7f96" }}>
          Forward 3-5 newsletters for the best first episode. You can always add
          more later.
        </p>
      </div>

      {/* Email arrival list */}
      <div
        className="bg-white rounded-2xl p-6"
        style={{ border: "1px solid rgba(45, 27, 78, 0.08)" }}
      >
        <p className="text-sm font-medium mb-3" style={{ color: "#1a0e2e" }}>
          Received newsletters
        </p>
        {emails.length === 0 ? (
          <div
            className="rounded-xl p-6 text-center"
            style={{ background: "rgba(45, 27, 78, 0.03)" }}
          >
            <div
              className="inline-block w-6 h-6 border-2 rounded-full animate-spin mb-2"
              style={{
                borderColor: "rgba(107, 76, 154, 0.2)",
                borderTopColor: "#6b4c9a",
              }}
            />
            <p className="text-sm" style={{ color: "#8a7f96" }}>
              Waiting for newsletters...
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {emails.map((email) => {
              const excluded = excludedIds.has(email.id);
              return (
                <div
                  key={email.id}
                  onClick={() => onToggleExclude(email.id)}
                  className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors"
                  style={{
                    background: excluded
                      ? "rgba(45, 27, 78, 0.03)"
                      : "rgba(74, 157, 107, 0.06)",
                    border: excluded
                      ? "1px solid rgba(45, 27, 78, 0.06)"
                      : "1px solid rgba(74, 157, 107, 0.15)",
                    opacity: excluded ? 0.55 : 1,
                  }}
                >
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{
                      background: excluded
                        ? "rgba(45, 27, 78, 0.08)"
                        : "rgba(74, 157, 107, 0.15)",
                    }}
                  >
                    {excluded ? (
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 10 10"
                        fill="none"
                        stroke="#8a7f96"
                        strokeWidth="2"
                        strokeLinecap="round"
                      >
                        <line x1="2" y1="2" x2="8" y2="8" />
                        <line x1="8" y1="2" x2="2" y2="8" />
                      </svg>
                    ) : (
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 12 12"
                        fill="none"
                        stroke="#4a9d6b"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="2,6 4.5,8.5 10,3" />
                      </svg>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-sm font-medium truncate"
                      style={{ color: excluded ? "#8a7f96" : "#1a0e2e" }}
                    >
                      {email.from_name || email.from_email}
                    </p>
                    <p
                      className="text-xs truncate"
                      style={{ color: "#8a7f96" }}
                    >
                      {email.subject || "(no subject)"}
                    </p>
                  </div>
                </div>
              );
            })}
            {emails.length > 0 && (
              <p className="text-xs text-center pt-1" style={{ color: "#8a7f96" }}>
                Tap to exclude emails you don&apos;t want in your podcast
              </p>
            )}
          </div>
        )}
      </div>

      {/* Intro Music */}
      <IntroMusicPicker
        currentTrack={currentIntroMusic}
        isPower={tier === "power"}
      />

      {/* Generate button */}
      {(() => {
        const includedCount = emails.length - excludedIds.size;
        return (
          <button
            onClick={onGenerate}
            disabled={includedCount === 0}
            className="w-full py-3 rounded-xl text-sm font-medium transition-all"
            style={{
              background: includedCount > 0 ? "#6b4c9a" : "rgba(45, 27, 78, 0.1)",
              color: includedCount > 0 ? "#faf7f2" : "#8a7f96",
              cursor: includedCount > 0 ? "pointer" : "not-allowed",
            }}
          >
            Generate my first episode
            {includedCount > 0 && ` (${includedCount} newsletter${includedCount !== 1 ? "s" : ""})`}
          </button>
        );
      })()}
    </>
  );
}

function GeneratingStep({
  progressStage,
  error,
  onRetry,
}: {
  progressStage: string | null;
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <div
      className="bg-white rounded-2xl p-8 text-center"
      style={{ border: "1px solid rgba(45, 27, 78, 0.08)" }}
    >
      {error ? (
        <>
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ background: "rgba(220, 38, 38, 0.1)" }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#dc2626"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </div>
          <h2
            className="text-xl mb-2"
            style={{
              fontFamily: "var(--font-instrument-serif), serif",
              letterSpacing: "-0.02em",
              color: "#1a0e2e",
            }}
          >
            Something went wrong
          </h2>
          <p className="text-sm mb-4" style={{ color: "#5a4d6b" }}>
            {error}
          </p>
          <button
            onClick={onRetry}
            className="px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
            style={{ background: "#6b4c9a", color: "#faf7f2" }}
          >
            Try again
          </button>
        </>
      ) : (
        <>
          <div className="relative w-12 h-12 mx-auto mb-4">
            <div
              className="absolute inset-0 rounded-full animate-spin"
              style={{
                border: "3px solid rgba(107, 76, 154, 0.15)",
                borderTopColor: "#6b4c9a",
              }}
            />
          </div>
          <h2
            className="text-xl mb-2"
            style={{
              fontFamily: "var(--font-instrument-serif), serif",
              letterSpacing: "-0.02em",
              color: "#1a0e2e",
            }}
          >
            Generating Your Episode
          </h2>
          <p
            className="text-sm transition-opacity duration-500"
            style={{ color: "#5a4d6b" }}
          >
            {progressStage
              ? PROGRESS_STAGES[progressStage] ?? "Processing..."
              : "Starting up..."}
          </p>
          <p className="text-xs mt-4" style={{ color: "#8a7f96" }}>
            This usually takes 10-15 minutes. Feel free to wait here.
          </p>
        </>
      )}
    </div>
  );
}

function ReadyStep({
  episode,
  feedUrl,
  onNext,
}: {
  episode: EpisodeStatus;
  feedUrl: string;
  onNext: () => void;
}) {
  return (
    <>
      <div className="text-center">
        <h1
          className="text-2xl"
          style={{
            fontFamily: "var(--font-instrument-serif), serif",
            letterSpacing: "-0.02em",
          }}
        >
          Your First Episode is Ready!
        </h1>
        <p className="text-sm mt-1" style={{ color: "#5a4d6b" }}>
          Hit play to hear your newsletters as a podcast.
        </p>
      </div>

      {/* Audio player card */}
      <div
        className="rounded-2xl p-5 sm:p-6 relative overflow-hidden"
        style={{
          background: "#1a0e2e",
          color: "#faf7f2",
          boxShadow: "0 8px 32px rgba(26, 14, 46, 0.2)",
        }}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(circle at 20% 20%, rgba(157, 124, 216, 0.12) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(232, 164, 74, 0.08) 0%, transparent 50%)",
          }}
        />
        <div className="relative">
          <div className="flex items-center gap-3 mb-4">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0"
              style={{
                background: "linear-gradient(135deg, #6b4c9a, #e8a44a)",
              }}
            >
              DG
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm truncate">
                {episode.title || "Your Daily Gist"}
              </p>
            </div>
          </div>
          <audio
            controls
            preload="metadata"
            src={episode.audio_url!}
            className="w-full"
            style={{ borderRadius: "8px", height: "44px" }}
          />
        </div>
      </div>

      {/* RSS feed setup */}
      <div
        className="bg-white rounded-2xl p-6"
        style={{ border: "1px solid rgba(45, 27, 78, 0.08)" }}
      >
        <h2
          className="text-lg font-semibold mb-2"
          style={{ color: "#1a0e2e" }}
        >
          Listen in Your Podcast App
        </h2>
        <p className="text-sm mb-4" style={{ color: "#5a4d6b" }}>
          Add this private RSS feed to get episodes automatically:
        </p>
        <div
          className="flex items-center gap-2 p-3 rounded-xl mb-4"
          style={{ background: "rgba(45, 27, 78, 0.04)" }}
        >
          <code
            className="flex-1 text-sm break-all"
            style={{ color: "#1a0e2e" }}
          >
            {feedUrl}
          </code>
          <CopyButton text={feedUrl} />
        </div>

        <div className="space-y-3 text-sm">
          <details className="group">
            <summary
              className="cursor-pointer font-medium"
              style={{ color: "#1a0e2e" }}
            >
              Apple Podcasts
            </summary>
            <div className="mt-2 pl-4 space-y-1" style={{ color: "#5a4d6b" }}>
              <p>1. Open Apple Podcasts on your Mac</p>
              <p>2. Go to File &rarr; Add a Show by URL (or Cmd+Shift+U)</p>
              <p>3. Paste your RSS feed URL and click Follow</p>
              <p>4. The podcast will sync to your iPhone automatically</p>
            </div>
          </details>

          <details className="group">
            <summary
              className="cursor-pointer font-medium"
              style={{ color: "#1a0e2e" }}
            >
              Overcast
            </summary>
            <div className="mt-2 pl-4 space-y-1" style={{ color: "#5a4d6b" }}>
              <p>1. Open Overcast and tap the + button</p>
              <p>2. Tap &quot;Add URL&quot;</p>
              <p>3. Paste your RSS feed URL and tap Add</p>
            </div>
          </details>

          <details className="group">
            <summary
              className="cursor-pointer font-medium"
              style={{ color: "#1a0e2e" }}
            >
              Pocket Casts
            </summary>
            <div className="mt-2 pl-4 space-y-1" style={{ color: "#5a4d6b" }}>
              <p>1. Open Pocket Casts and tap Search</p>
              <p>2. Scroll down and tap &quot;Submit RSS&quot;</p>
              <p>3. Paste your RSS feed URL and tap Find</p>
              <p>4. Tap Subscribe</p>
            </div>
          </details>

          <details className="group">
            <summary
              className="cursor-pointer font-medium"
              style={{ color: "#1a0e2e" }}
            >
              Castro
            </summary>
            <div className="mt-2 pl-4 space-y-1" style={{ color: "#5a4d6b" }}>
              <p>1. Open Castro and go to Library</p>
              <p>2. Tap the + button, then &quot;Add by URL&quot;</p>
              <p>3. Paste your RSS feed URL and tap Add</p>
            </div>
          </details>
        </div>
      </div>

      {/* Next button */}
      <button
        onClick={onNext}
        className="w-full py-3 rounded-xl text-sm font-medium transition-colors"
        style={{ background: "#6b4c9a", color: "#faf7f2" }}
      >
        Next: Set up auto-forwarding
      </button>
    </>
  );
}

function FilterSetupStep({
  forwardingAddress,
  onComplete,
}: {
  forwardingAddress: string;
  onComplete: () => void;
}) {
  const [sources, setSources] = useState<NewsletterSource[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [subState, setSubState] = useState<
    "select-senders" | "setup-guide" | "waiting-for-confirmation" | "done"
  >("select-senders");
  const [confirmationBody, setConfirmationBody] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const supabase = createClient();

  // Fetch newsletter sources
  useEffect(() => {
    const fetchSources = async () => {
      try {
        const res = await fetch("/api/newsletter-sources");
        const data = await res.json();
        if (data.sources) {
          setSources(data.sources);
          setSelected(new Set(data.sources.map((s: NewsletterSource) => s.id)));
        }
      } catch {
        // Silently fail
      } finally {
        setLoading(false);
      }
    };

    fetchSources();
  }, []);

  // Poll for Gmail forwarding confirmation
  useEffect(() => {
    if (subState !== "setup-guide" && subState !== "waiting-for-confirmation") return;

    const poll = async () => {
      const { data } = await supabase
        .from("notifications")
        .select("id, message")
        .eq("type", "gmail_forwarding_confirmation")
        .eq("read", false)
        .order("created_at", { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        setConfirmationBody(data[0].message);
      }
    };

    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [subState, supabase]);

  const toggleSource = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectedSources = sources.filter((s) => selected.has(s.id));
  const filterString = selectedSources.length > 0
    ? selectedSources.map((s) => s.sender_email).join(" OR ")
    : "";

  const copyText = (text: string, field: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    });
  };

  if (subState === "done") {
    return (
      <div
        className="bg-white rounded-2xl p-8 text-center"
        style={{ border: "1px solid rgba(45, 27, 78, 0.08)" }}
      >
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
          style={{ background: "rgba(74, 157, 107, 0.15)" }}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#4a9d6b"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="4,12 9,17 20,6" />
          </svg>
        </div>
        <h2
          className="text-xl mb-2"
          style={{
            fontFamily: "var(--font-instrument-serif), serif",
            letterSpacing: "-0.02em",
            color: "#1a0e2e",
          }}
        >
          You&apos;re All Set!
        </h2>
        <p className="text-sm mb-6" style={{ color: "#5a4d6b" }}>
          Your newsletters will be automatically forwarded. New episodes will appear in your podcast app.
        </p>
        <button
          onClick={async () => {
            await fetch("/api/onboarding/forwarding-complete", { method: "POST" });
            onComplete();
          }}
          className="w-full py-3 rounded-xl text-sm font-medium transition-colors"
          style={{ background: "#1a0e2e", color: "#faf7f2" }}
        >
          Go to Dashboard
        </button>
      </div>
    );
  }

  if (subState === "setup-guide") {
    const stepStyle = {
      background: "rgba(107, 76, 154, 0.15)",
      color: "#6b4c9a",
    };

    const addressCopyBlock = (
      <div
        className="flex items-center gap-2 p-3 rounded-lg"
        style={{ background: "rgba(45, 27, 78, 0.03)" }}
      >
        <code className="text-xs flex-1 break-all" style={{ color: "#1a0e2e" }}>
          {forwardingAddress}
        </code>
        <button
          onClick={() => copyText(forwardingAddress, "address")}
          className="px-3 py-1 rounded-lg text-xs font-medium flex-shrink-0"
          style={{
            background: copiedField === "address" ? "rgba(74, 157, 107, 0.15)" : "rgba(45, 27, 78, 0.08)",
            color: copiedField === "address" ? "#4a9d6b" : "#1a0e2e",
          }}
        >
          {copiedField === "address" ? "Copied!" : "Copy"}
        </button>
      </div>
    );

    return (
      <>
        <div>
          <h1
            className="text-2xl"
            style={{
              fontFamily: "var(--font-instrument-serif), serif",
              letterSpacing: "-0.02em",
            }}
          >
            Set Up Gmail Forwarding
          </h1>
          <p className="text-sm mt-1" style={{ color: "#5a4d6b" }}>
            Follow these steps to auto-forward your newsletters. Takes about 5 minutes.
          </p>
        </div>

        {/* Step 1: Add forwarding address */}
        <div
          className="bg-white rounded-2xl p-6 space-y-4"
          style={{ border: "1px solid rgba(45, 27, 78, 0.08)" }}
        >
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "#8a7f96" }}>
            Step 1 &mdash; Add forwarding address
          </p>

          <p className="text-sm" style={{ color: "#1a0e2e" }}>
            First, register your Daily Gist address with Gmail so it can forward emails there.
          </p>

          <div className="space-y-2 text-sm">
            <details className="group">
              <summary
                className="cursor-pointer font-medium"
                style={{ color: "#1a0e2e" }}
              >
                I don&apos;t have any forwarding addresses in Gmail yet
              </summary>
              <div className="mt-3 pl-4 space-y-3" style={{ color: "#5a4d6b" }}>
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={stepStyle}>1</span>
                  <p>
                    In Gmail, click the <strong>gear icon</strong> &rarr; <strong>&ldquo;See all settings&rdquo;</strong> &rarr; <strong>&ldquo;Forwarding and POP/IMAP&rdquo;</strong> tab
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={stepStyle}>2</span>
                  <p>Click <strong>&ldquo;Add a forwarding address&rdquo;</strong></p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={stepStyle}>3</span>
                  <div className="flex-1 min-w-0">
                    <p className="mb-2">Paste your Daily Gist address:</p>
                    {addressCopyBlock}
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={stepStyle}>4</span>
                  <p>Click <strong>Next &rarr; Proceed &rarr; OK</strong></p>
                </div>
              </div>
            </details>

            <details className="group">
              <summary
                className="cursor-pointer font-medium"
                style={{ color: "#1a0e2e" }}
              >
                I already have a forwarding address in Gmail
              </summary>
              <div className="mt-3 pl-4 space-y-3" style={{ color: "#5a4d6b" }}>
                <p>
                  Gmail hides the &ldquo;Add a forwarding address&rdquo; button once you have one. You&apos;ll add it during filter creation instead:
                </p>
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={stepStyle}>1</span>
                  <p>
                    Open{" "}
                    <a
                      href="https://mail.google.com/mail/u/0/#settings/filters"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline font-medium"
                      style={{ color: "#6b4c9a" }}
                    >
                      Gmail Filters Settings
                    </a>
                    {" "}&rarr; <strong>&ldquo;Create a new filter&rdquo;</strong>
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={stepStyle}>2</span>
                  <p>Type anything in the <strong>From</strong> field and click <strong>&ldquo;Create filter&rdquo;</strong></p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={stepStyle}>3</span>
                  <p>Click <strong>&ldquo;Add forwarding address&rdquo;</strong> next to &ldquo;Forward it to&rdquo;</p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={stepStyle}>4</span>
                  <p>Gmail takes you to the Forwarding settings page. Click <strong>&ldquo;Add a forwarding address&rdquo;</strong> again</p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={stepStyle}>5</span>
                  <div className="flex-1 min-w-0">
                    <p className="mb-2">Paste your Daily Gist address:</p>
                    {addressCopyBlock}
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={stepStyle}>6</span>
                  <p>Click <strong>Next &rarr; Proceed &rarr; OK</strong></p>
                </div>
                <p className="text-xs" style={{ color: "#8a7f96" }}>
                  Note: The filter you started is gone &mdash; that&apos;s OK. You&apos;ll create it in Step 3 below.
                </p>
              </div>
            </details>
          </div>
        </div>

        {/* Step 2: Confirm */}
        <div
          className="bg-white rounded-2xl p-6 space-y-4"
          style={{ border: "1px solid rgba(45, 27, 78, 0.08)" }}
        >
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "#8a7f96" }}>
            Step 2 &mdash; Confirm forwarding
          </p>

          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <p className="text-sm" style={{ color: "#1a0e2e" }}>
                  Gmail sends a confirmation email to your Daily Gist address. We&apos;ll detect it automatically:
                </p>
                <div className="mt-3">
                  {confirmationBody ? (
                    <div
                      className="rounded-xl p-4 text-sm whitespace-pre-line break-words"
                      style={{
                        background: "rgba(74, 157, 107, 0.06)",
                        border: "1px solid rgba(74, 157, 107, 0.2)",
                        color: "#1a0e2e",
                      }}
                    >
                      <p className="text-xs font-medium mb-2" style={{ color: "#4a9d6b" }}>
                        Confirmation received! Click the link below:
                      </p>
                      {linkify(confirmationBody)}
                    </div>
                  ) : (
                    <div
                      className="rounded-xl p-4 text-center"
                      style={{ background: "rgba(45, 27, 78, 0.03)" }}
                    >
                      <div
                        className="inline-block w-5 h-5 border-2 rounded-full animate-spin mb-2"
                        style={{
                          borderColor: "rgba(107, 76, 154, 0.2)",
                          borderTopColor: "#6b4c9a",
                        }}
                      />
                      <p className="text-xs" style={{ color: "#8a7f96" }}>
                        Waiting for confirmation email...
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Step 3: Create filter */}
        <div
          className="bg-white rounded-2xl p-6 space-y-4"
          style={{ border: "1px solid rgba(45, 27, 78, 0.08)" }}
        >
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "#8a7f96" }}>
            Step 3 &mdash; Create filter
          </p>

          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={stepStyle}>1</span>
              <p className="text-sm" style={{ color: "#1a0e2e" }}>
                Open{" "}
                <a
                  href="https://mail.google.com/mail/u/0/#settings/filters"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-medium"
                  style={{ color: "#6b4c9a" }}
                >
                  Gmail Filters Settings
                </a>
                {" "}&rarr; <strong>&ldquo;Create a new filter&rdquo;</strong>
              </p>
            </div>

            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={stepStyle}>2</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm mb-2" style={{ color: "#1a0e2e" }}>
                  In the <strong>From</strong> field, paste this:
                </p>
                <div
                  className="flex items-center gap-2 p-3 rounded-lg"
                  style={{ background: "rgba(45, 27, 78, 0.03)" }}
                >
                  <code className="text-xs flex-1 break-all" style={{ color: "#1a0e2e" }}>
                    {filterString}
                  </code>
                  <button
                    onClick={() => copyText(filterString, "filter")}
                    className="px-3 py-1 rounded-lg text-xs font-medium flex-shrink-0"
                    style={{
                      background: copiedField === "filter" ? "rgba(74, 157, 107, 0.15)" : "rgba(45, 27, 78, 0.08)",
                      color: copiedField === "filter" ? "#4a9d6b" : "#1a0e2e",
                    }}
                  >
                    {copiedField === "filter" ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={stepStyle}>3</span>
              <p className="text-sm" style={{ color: "#1a0e2e" }}>
                Click <strong>&ldquo;Create filter&rdquo;</strong> (bottom right of the search box)
              </p>
            </div>

            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={stepStyle}>4</span>
              <p className="text-sm" style={{ color: "#1a0e2e" }}>
                Check <strong>&ldquo;Forward it to&rdquo;</strong> and select your Daily Gist address
              </p>
            </div>

            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={stepStyle}>5</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm" style={{ color: "#1a0e2e" }}>
                  Check <strong>&ldquo;Skip the Inbox (Archive it)&rdquo;</strong>
                </p>
                <p className="text-xs mt-1" style={{ color: "#8a7f96" }}>
                  Recommended &mdash; newsletters go straight to Daily Gist instead of cluttering your inbox. You can still find them under your label.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={stepStyle}>6</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm" style={{ color: "#1a0e2e" }}>
                  Check <strong>&ldquo;Apply the label&rdquo;</strong> &rarr; <strong>&ldquo;New label...&rdquo;</strong> &rarr; name it <strong>&ldquo;Daily Gist&rdquo;</strong>
                </p>
                <p className="text-xs mt-1" style={{ color: "#8a7f96" }}>
                  This labels the emails so you can still browse them in Gmail anytime &mdash; look for the &ldquo;Daily Gist&rdquo; label in your sidebar.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={stepStyle}>7</span>
              <p className="text-sm" style={{ color: "#1a0e2e" }}>
                Click <strong>&ldquo;Create filter&rdquo;</strong> &mdash; you&apos;re done!
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => setSubState("done")}
          className="w-full py-3 rounded-xl text-sm font-medium transition-colors"
          style={{ background: "#6b4c9a", color: "#faf7f2" }}
        >
          I&apos;ve created my filter
        </button>

        <button
          onClick={() => setSubState("select-senders")}
          className="w-full py-2 text-xs font-medium"
          style={{ color: "#8a7f96", background: "none", border: "none" }}
        >
          &larr; Go back
        </button>
      </>
    );
  }

  // select-senders sub-state
  return (
    <>
      <div>
        <h1
          className="text-2xl"
          style={{
            fontFamily: "var(--font-instrument-serif), serif",
            letterSpacing: "-0.02em",
          }}
        >
          Set Up Auto-Forwarding
        </h1>
        <p className="text-sm mt-1" style={{ color: "#5a4d6b" }}>
          Automatically forward your newsletters so you never miss an episode.
        </p>
      </div>

      {/* Sender selection */}
      <div
        className="bg-white rounded-2xl p-6"
        style={{ border: "1px solid rgba(45, 27, 78, 0.08)" }}
      >
        <p className="text-sm font-medium mb-3" style={{ color: "#1a0e2e" }}>
          Select newsletters to auto-forward
        </p>

        {loading ? (
          <div className="text-center py-4">
            <div
              className="inline-block w-6 h-6 border-2 rounded-full animate-spin mb-2"
              style={{
                borderColor: "rgba(107, 76, 154, 0.2)",
                borderTopColor: "#6b4c9a",
              }}
            />
            <p className="text-sm" style={{ color: "#8a7f96" }}>
              Loading your sources...
            </p>
          </div>
        ) : sources.length === 0 ? (
          <div
            className="rounded-xl p-4 text-center"
            style={{ background: "rgba(45, 27, 78, 0.03)" }}
          >
            <p className="text-sm" style={{ color: "#8a7f96" }}>
              No newsletter sources detected yet. Forward some newsletters first, then come back.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <div
              className="rounded-xl p-3 mb-1"
              style={{
                background: "rgba(232, 164, 74, 0.08)",
                border: "1px solid rgba(232, 164, 74, 0.2)",
              }}
            >
              <p className="text-sm" style={{ color: "#1a0e2e" }}>
                Only showing newsletters you forwarded earlier.
                <br />
                Have more you want in your podcast each day? Forward one from each to:
              </p>
              <div
                className="flex items-center gap-2 mt-2 p-2 rounded-lg"
                style={{ background: "rgba(255, 255, 255, 0.6)" }}
              >
                <code
                  className="flex-1 text-xs break-all"
                  style={{ color: "#1a0e2e" }}
                >
                  {forwardingAddress}
                </code>
                <CopyButton text={forwardingAddress} />
              </div>
              <p className="text-xs mt-2" style={{ color: "#5a4d6b" }}>
                Then refresh this page to see them here.
              </p>
            </div>
            {sources.map((source) => (
              <label
                key={source.id}
                className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors"
                style={{
                  background: selected.has(source.id)
                    ? "rgba(107, 76, 154, 0.06)"
                    : "rgba(45, 27, 78, 0.02)",
                  border: selected.has(source.id)
                    ? "1px solid rgba(107, 76, 154, 0.2)"
                    : "1px solid rgba(45, 27, 78, 0.06)",
                }}
              >
                <input
                  type="checkbox"
                  checked={selected.has(source.id)}
                  onChange={() => toggleSource(source.id)}
                  className="w-4 h-4 rounded accent-[#6b4c9a]"
                />
                <div className="min-w-0 flex-1">
                  <p
                    className="text-sm font-medium truncate"
                    style={{ color: "#1a0e2e" }}
                  >
                    {source.sender_name || source.sender_email}
                  </p>
                  {source.sender_name && (
                    <p
                      className="text-xs truncate"
                      style={{ color: "#8a7f96" }}
                    >
                      {source.sender_email}
                    </p>
                  )}
                </div>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Continue button */}
      {sources.length > 0 && (
        <button
          onClick={() => { if (selectedSources.length > 0) setSubState("setup-guide"); }}
          disabled={selected.size === 0}
          className="w-full py-3 rounded-xl text-sm font-medium transition-all"
          style={{
            background: selected.size > 0 ? "#6b4c9a" : "rgba(45, 27, 78, 0.1)",
            color: selected.size > 0 ? "#faf7f2" : "#8a7f96",
            cursor: selected.size > 0 ? "pointer" : "not-allowed",
          }}
        >
          Continue
        </button>
      )}

      {/* Skip option */}
      <button
        onClick={onComplete}
        className="w-full py-2 text-xs font-medium"
        style={{ color: "#8a7f96", background: "none", border: "none" }}
      >
        Skip for now &mdash; I&apos;ll set this up later
      </button>

    </>
  );
}
