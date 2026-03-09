"use client";

import { useState } from "react";

const CATEGORIES = [
  { value: "tech", label: "Tech", description: "AI, software, startups, crypto" },
  { value: "business", label: "Business", description: "Strategy, leadership, markets" },
  { value: "finance", label: "Finance", description: "Investing, economics, personal finance" },
  { value: "productivity", label: "Productivity", description: "Habits, tools, time management" },
];

export function CategoryPicker({
  currentCategory,
}: {
  currentCategory: string | null;
}) {
  const [selected, setSelected] = useState<string>(currentCategory || "tech");
  const [committed, setCommitted] = useState<string | null>(currentCategory);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const dirty = selected !== committed;

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/account/category", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: selected }),
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
      <h2 className="text-lg font-semibold mb-1" style={{ color: "#1a0e2e" }}>
        Category
      </h2>
      <p className="text-sm mb-4" style={{ color: "#5a4d6b" }}>
        Your daily podcast is curated from top newsletters in this category.
      </p>
      <div className="flex gap-3">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="flex-1 px-3 py-2 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
          style={{
            background: "#faf7f2",
            border: "1px solid rgba(45, 27, 78, 0.15)",
            color: "#1a0e2e",
          }}
        >
          {CATEGORIES.map((cat) => (
            <option key={cat.value} value={cat.value}>
              {cat.label} — {cat.description}
            </option>
          ))}
        </select>
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
