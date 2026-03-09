"use client";

import { useState } from "react";

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  tech: { bg: "rgba(59, 130, 246, 0.12)", text: "#2563eb" },
  business: { bg: "rgba(107, 76, 154, 0.12)", text: "#6b4c9a" },
  finance: { bg: "rgba(16, 185, 129, 0.12)", text: "#059669" },
  productivity: { bg: "rgba(232, 164, 74, 0.12)", text: "#c4842e" },
};

export function AdminFeedUrls({
  feedBaseUrl,
  categories,
}: {
  feedBaseUrl: string;
  categories: string[];
}) {
  const [copiedCategory, setCopiedCategory] = useState<string | null>(null);

  function handleCopy(category: string) {
    const url = `${feedBaseUrl}?category=${category}`;
    navigator.clipboard.writeText(url);
    setCopiedCategory(category);
    setTimeout(() => setCopiedCategory(null), 2000);
  }

  return (
    <div>
      <h2
        className="text-lg mb-4"
        style={{
          fontFamily: "var(--font-instrument-serif), serif",
          letterSpacing: "-0.02em",
        }}
      >
        Feed URLs
      </h2>
      <div
        className="bg-white rounded-2xl overflow-hidden"
        style={{ border: "1px solid rgba(45, 27, 78, 0.08)" }}
      >
        {categories.map((cat) => {
          const colors = CATEGORY_COLORS[cat];
          const url = `${feedBaseUrl}?category=${cat}`;
          return (
            <div
              key={cat}
              className="flex items-center justify-between px-5 py-3"
              style={{ borderBottom: "1px solid rgba(45, 27, 78, 0.04)" }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className="px-2 py-1 rounded-lg text-xs font-medium shrink-0"
                  style={{
                    background: colors?.bg ?? "rgba(45, 27, 78, 0.04)",
                    color: colors?.text ?? "#8a7f96",
                  }}
                >
                  {cat}
                </span>
                <span
                  className="text-xs truncate"
                  style={{ color: "#8a7f96" }}
                >
                  {url}
                </span>
              </div>
              <button
                onClick={() => handleCopy(cat)}
                className="text-xs font-medium px-3 py-1 rounded-lg cursor-pointer transition-colors shrink-0 ml-3"
                style={{
                  background:
                    copiedCategory === cat
                      ? "rgba(16, 185, 129, 0.12)"
                      : "rgba(45, 27, 78, 0.04)",
                  color: copiedCategory === cat ? "#059669" : "#5a4d6b",
                }}
              >
                {copiedCategory === cat ? "Copied" : "Copy"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
