"use client";

import { useState } from "react";

const STYLES = [
  {
    value: "easy_listening",
    label: "Easy Listening",
    description: "Simple, conversational — like chatting with a friend",
  },
  {
    value: "intellectual",
    label: "Intellectual",
    description: "In-depth analysis with sharp insights",
  },
];

export function DiscussionStylePicker({
  currentStyle,
}: {
  currentStyle: string;
}) {
  const [selected, setSelected] = useState(currentStyle);
  const [committed, setCommitted] = useState(currentStyle);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const dirty = selected !== committed;

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/account/discussion-style", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discussion_style: selected }),
      });
      if (res.ok) {
        setCommitted(selected);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="bg-white rounded-2xl p-6"
      style={{ border: "1px solid rgba(45, 27, 78, 0.08)" }}
    >
      <h2
        className="text-lg font-semibold mb-1"
        style={{ color: "#1a0e2e" }}
      >
        Discussion Style
      </h2>
      <p
        className="text-sm mb-4"
        style={{ color: "#5a4d6b" }}
      >
        Choose how your hosts discuss the news.
      </p>

      <div className="space-y-2">
        {STYLES.map((style) => (
          <button
            key={style.value}
            type="button"
            onClick={() => setSelected(style.value)}
            className="w-full text-left p-4 rounded-xl transition-all"
            style={{
              background:
                selected === style.value
                  ? "rgba(107, 76, 154, 0.08)"
                  : "#fff",
              border:
                selected === style.value
                  ? "2px solid #6b4c9a"
                  : "1px solid rgba(45, 27, 78, 0.08)",
            }}
          >
            <p
              className="text-sm font-semibold"
              style={{ color: "#1a0e2e" }}
            >
              {style.label}
            </p>
            <p
              className="text-xs mt-0.5"
              style={{ color: "#5a4d6b" }}
            >
              {style.description}
            </p>
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="px-4 py-2 rounded-xl text-sm font-medium transition-opacity"
          style={{
            background: "#6b4c9a",
            color: "#faf7f2",
            opacity: !dirty || saving ? 0.5 : 1,
          }}
        >
          {saving ? "Saving..." : saved ? "Saved!" : "Save"}
        </button>
      </div>
    </div>
  );
}
