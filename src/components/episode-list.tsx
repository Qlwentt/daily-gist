"use client";

import { useState } from "react";

type Episode = {
  id: string;
  title: string;
  date: string;
  status: string;
  transcript: string | null;
  error_message: string | null;
};

export function EpisodeList({ episodes }: { episodes: Episode[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-200">
      {episodes.map((episode) => (
        <div key={episode.id}>
          <button
            onClick={() =>
              setExpandedId(expandedId === episode.id ? null : episode.id)
            }
            className="w-full p-4 flex items-center justify-between text-left hover:bg-gray-50"
          >
            <div>
              <p className="font-medium">{episode.title}</p>
              <p className="text-sm text-gray-500">
                {new Date(episode.date).toLocaleDateString("en-US", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <StatusBadge status={episode.status} />
              <span className="text-gray-400 text-sm">
                {expandedId === episode.id ? "▲" : "▼"}
              </span>
            </div>
          </button>
          {expandedId === episode.id && (
            <div className="px-4 pb-4 border-t border-gray-100">
              {episode.status === "failed" && episode.error_message && (
                <div className="mt-3 bg-red-50 border border-red-200 rounded p-3">
                  <p className="text-sm text-red-800">
                    <span className="font-medium">Error:</span>{" "}
                    {episode.error_message}
                  </p>
                </div>
              )}
              {episode.status === "processing" && (
                <p className="mt-3 text-sm text-gray-500">
                  This episode is currently being generated...
                </p>
              )}
              {episode.status === "pending" && (
                <p className="mt-3 text-sm text-gray-500">
                  This episode is queued for generation.
                </p>
              )}
              {episode.status === "ready" && (
                <div className="mt-3">
                  {episode.transcript ? (
                    <pre className="whitespace-pre-wrap text-sm text-gray-700 bg-gray-50 rounded p-3 max-h-96 overflow-y-auto">
                      {episode.transcript}
                    </pre>
                  ) : (
                    <p className="text-sm text-gray-500">
                      No transcript available.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
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
