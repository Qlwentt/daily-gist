"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

type Episode = {
  id: string;
  title: string;
  date: string;
  status: string;
  transcript: string | null;
  error_message: string | null;
  share_code: string | null;
  audio_url: string | null;
  source_newsletters: string[] | null;
  progress_stage: string | null;
};

export function EpisodeList({ episodes }: { episodes: Episode[] }) {
  return (
    <div className="space-y-4">
      {episodes.map((episode) =>
        episode.status === "ready" && episode.audio_url ? (
          <ReadyEpisodeCard key={episode.id} episode={episode} />
        ) : (
          <PendingEpisodeCard key={episode.id} episode={episode} />
        )
      )}
    </div>
  );
}

function ReadyEpisodeCard({ episode }: { episode: Episode }) {
  const [shared, setShared] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);

  const [year, month, day] = episode.date.split("-").map(Number);
  const date = new Date(year, month - 1, day).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  const handleShare = async () => {
    if (!episode.share_code) return;
    const url = `${window.location.origin}/s/${episode.share_code}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: episode.title,
          url,
        });
        return;
      } catch {
        // User cancelled or share failed — fall through to clipboard
      }
    }

    await navigator.clipboard.writeText(url);
    setShared(true);
    setTimeout(() => setShared(false), 2000);
  };

  return (
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

      {/* Header */}
      <div className="flex items-center gap-3 mb-4 relative">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0"
          style={{
            background: "linear-gradient(135deg, #6b4c9a, #e8a44a)",
          }}
        >
          DG
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm truncate">{episode.title}</p>
          <p
            className="text-xs"
            style={{ color: "rgba(250, 247, 242, 0.5)" }}
          >
            {date}
          </p>
        </div>
      </div>

      {/* Audio player */}
      <div className="relative mb-4">
        <audio
          controls
          preload="metadata"
          src={episode.audio_url!}
          className="w-full"
          style={{ borderRadius: "8px", height: "44px" }}
        />
      </div>

      {/* Source newsletters */}
      {episode.source_newsletters && episode.source_newsletters.length > 0 && (
        <div
          className="relative mb-4 pt-4"
          style={{
            borderTop: "1px solid rgba(250, 247, 242, 0.08)",
          }}
        >
          <div
            className="text-[0.7rem] uppercase tracking-widest mb-2"
            style={{ color: "rgba(250, 247, 242, 0.4)" }}
          >
            Brought to you by
          </div>
          <div className="flex flex-wrap gap-1.5">
            {episode.source_newsletters.map((source) => (
              <span
                key={source}
                className="px-2.5 py-1 rounded-md text-xs"
                style={{
                  background: "rgba(250, 247, 242, 0.08)",
                  color: "rgba(250, 247, 242, 0.7)",
                  border: "1px solid rgba(250, 247, 242, 0.06)",
                }}
              >
                {source}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Share button */}
      {episode.share_code && (
        <div className="relative">
          <button
            onClick={handleShare}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-colors"
            style={{
              background: "rgba(250, 247, 242, 0.1)",
              color: "rgba(250, 247, 242, 0.8)",
              border: "1px solid rgba(250, 247, 242, 0.08)",
            }}
          >
            {shared ? (
              "Link copied!"
            ) : (
              <>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 8V13a1 1 0 001 1h6a1 1 0 001-1V8" />
                  <polyline points="11,4 8,1 5,4" />
                  <line x1="8" y1="1" x2="8" y2="10" />
                </svg>
                Share episode
              </>
            )}
          </button>
        </div>
      )}

      {/* Transcript toggle */}
      {episode.transcript && (
        <div className="relative mt-3">
          <button
            onClick={() => setShowTranscript(!showTranscript)}
            className="text-xs font-medium transition-colors"
            style={{ color: "rgba(250, 247, 242, 0.4)" }}
          >
            {showTranscript ? "Hide transcript" : "Show transcript"}
          </button>
          {showTranscript && (
            <pre
              className="mt-3 whitespace-pre-wrap text-xs rounded-xl p-4 max-h-80 overflow-y-auto"
              style={{
                background: "rgba(250, 247, 242, 0.06)",
                color: "rgba(250, 247, 242, 0.6)",
                border: "1px solid rgba(250, 247, 242, 0.06)",
              }}
            >
              {episode.transcript}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

const PROGRESS_STAGES: Record<string, string> = {
  outline: "Planning your episode...",
  first_half: "Writing the first half of the script...",
  second_half: "Writing the second half of the script...",
  audio: "Generating audio (this is the longest step)...",
  uploading: "Uploading your episode...",
};

function formatProgressStage(stage: string | null): string {
  if (!stage) return "Starting up...";
  const chunkMatch = stage.match(/^audio:(\d+)\/(\d+)$/);
  if (chunkMatch) {
    return `Generating audio — part ${chunkMatch[1]} of ${chunkMatch[2]}...`;
  }
  return PROGRESS_STAGES[stage] ?? "Processing...";
}

function PendingEpisodeCard({ episode }: { episode: Episode }) {
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [progressStage, setProgressStage] = useState<string | null>(
    episode.progress_stage
  );

  const [year, month, day] = episode.date.split("-").map(Number);
  const date = new Date(year, month - 1, day).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  // Poll for progress updates when processing
  useEffect(() => {
    if (episode.status !== "processing") return;

    const supabase = createClient();
    const poll = async () => {
      const { data } = await supabase
        .from("episodes")
        .select("progress_stage, status")
        .eq("id", episode.id)
        .single();

      if (data) {
        setProgressStage(data.progress_stage);
        if (data.status === "ready" || data.status === "failed") {
          window.location.reload();
        }
      }
    };

    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [episode.id, episode.status]);

  const handleRetry = async () => {
    setRetrying(true);
    setRetryError(null);
    try {
      const res = await fetch("/api/episodes/generate-now", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setRetryError(data.error || "Retry failed");
        setRetrying(false);
        return;
      }
      // Reload to pick up the new episode status
      window.location.reload();
    } catch {
      setRetryError("Failed to connect to server");
      setRetrying(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-sm">{episode.title}</p>
          <p className="text-xs text-gray-500">{date}</p>
        </div>
        <StatusBadge status={episode.status} />
      </div>
      {episode.status === "failed" && (
        <div className="mt-3 bg-red-50 border border-red-200 rounded p-3">
          {episode.error_message && (
            <p className="text-sm text-red-800">
              <span className="font-medium">Error:</span> {episode.error_message}
            </p>
          )}
          {retryError && (
            <p className="text-sm text-red-800 mt-1">
              <span className="font-medium">Retry failed:</span> {retryError}
            </p>
          )}
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="mt-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{
              background: retrying ? "rgba(45, 27, 78, 0.08)" : "#6b4c9a",
              color: retrying ? "#8a7f96" : "#faf7f2",
              cursor: retrying ? "not-allowed" : "pointer",
            }}
          >
            {retrying ? "Retrying..." : "Retry"}
          </button>
        </div>
      )}
      {episode.status === "processing" && (
        <div className="mt-2 flex items-center gap-2">
          <div
            className="w-4 h-4 border-2 rounded-full animate-spin flex-shrink-0"
            style={{
              borderColor: "rgba(107, 76, 154, 0.2)",
              borderTopColor: "#6b4c9a",
            }}
          />
          <p className="text-sm" style={{ color: "#5a4d6b" }}>
            {formatProgressStage(progressStage)}
          </p>
        </div>
      )}
      {episode.status === "pending" && (
        <p className="mt-2 text-sm text-gray-500">
          Queued for generation.
        </p>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    processing: "bg-blue-100 text-blue-800",
    ready: "bg-green-100 text-green-800",
    failed: "bg-red-100 text-red-800",
  };

  return (
    <span
      className={`px-2 py-1 rounded text-xs font-medium ${styles[status] || "bg-gray-100 text-gray-800"}`}
    >
      {status}
    </span>
  );
}
