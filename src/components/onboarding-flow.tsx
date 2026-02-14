"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { CopyButton } from "@/components/copy-button";

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
};

const PROGRESS_MESSAGES = [
  "Processing your newsletters...",
  "Reading through your emails...",
  "Creating your podcast script...",
  "Writing the conversation...",
  "Generating audio...",
  "Almost there...",
];

export function OnboardingFlow({
  forwardingAddress,
  feedUrl,
}: {
  forwardingAddress: string;
  feedUrl: string;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [emails, setEmails] = useState<Email[]>([]);
  const [episodeId, setEpisodeId] = useState<string | null>(null);
  const [episode, setEpisode] = useState<EpisodeStatus | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [progressIndex, setProgressIndex] = useState(0);

  const supabase = createClient();

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
        .select("id, status, audio_url, title, error_message")
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

  // Cycle progress messages (Screen 2)
  useEffect(() => {
    if (step !== 2 || generateError) return;

    const interval = setInterval(() => {
      setProgressIndex((i) => (i + 1) % PROGRESS_MESSAGES.length);
    }, 8000);
    return () => clearInterval(interval);
  }, [step, generateError]);

  const handleGenerate = useCallback(async () => {
    setGenerateError(null);
    setStep(2);
    setProgressIndex(0);

    try {
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
  }, []);

  const handleComplete = useCallback(async () => {
    await supabase
      .from("users")
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq("id", (await supabase.auth.getUser()).data.user?.id);

    window.location.href = "/dashboard";
  }, [supabase]);

  return (
    <div className="max-w-2xl space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {[1, 2, 3].map((s) => (
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
            {s < 3 && (
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
          onGenerate={handleGenerate}
        />
      )}

      {step === 2 && (
        <GeneratingStep
          progressMessage={PROGRESS_MESSAGES[progressIndex]}
          error={generateError}
          onRetry={handleGenerate}
        />
      )}

      {step === 3 && episode && (
        <ReadyStep
          episode={episode}
          feedUrl={feedUrl}
          onComplete={handleComplete}
        />
      )}
    </div>
  );
}

function ForwardStep({
  forwardingAddress,
  emails,
  onGenerate,
}: {
  forwardingAddress: string;
  emails: Email[];
  onGenerate: () => void;
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
            {emails.map((email) => (
              <div
                key={email.id}
                className="flex items-center gap-3 p-3 rounded-xl"
                style={{
                  background: "rgba(74, 157, 107, 0.06)",
                  border: "1px solid rgba(74, 157, 107, 0.15)",
                }}
              >
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: "rgba(74, 157, 107, 0.15)" }}
                >
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
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className="text-sm font-medium truncate"
                    style={{ color: "#1a0e2e" }}
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
            ))}
          </div>
        )}
      </div>

      {/* Generate button */}
      <button
        onClick={onGenerate}
        disabled={emails.length === 0}
        className="w-full py-3 rounded-xl text-sm font-medium transition-all"
        style={{
          background: emails.length > 0 ? "#6b4c9a" : "rgba(45, 27, 78, 0.1)",
          color: emails.length > 0 ? "#faf7f2" : "#8a7f96",
          cursor: emails.length > 0 ? "pointer" : "not-allowed",
        }}
      >
        Generate my first episode
        {emails.length > 0 && ` (${emails.length} newsletter${emails.length !== 1 ? "s" : ""})`}
      </button>
    </>
  );
}

function GeneratingStep({
  progressMessage,
  error,
  onRetry,
}: {
  progressMessage: string;
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
            {progressMessage}
          </p>
          <p className="text-xs mt-4" style={{ color: "#8a7f96" }}>
            This usually takes 2-3 minutes. Feel free to wait here.
          </p>
        </>
      )}
    </div>
  );
}

function ReadyStep({
  episode,
  feedUrl,
  onComplete,
}: {
  episode: EpisodeStatus;
  feedUrl: string;
  onComplete: () => void;
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

      {/* Complete button */}
      <button
        onClick={onComplete}
        className="w-full py-3 rounded-xl text-sm font-medium transition-colors"
        style={{ background: "#1a0e2e", color: "#faf7f2" }}
      >
        Go to Dashboard
      </button>
    </>
  );
}
