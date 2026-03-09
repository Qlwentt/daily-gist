"use client";

import { useMemo, useState } from "react";
import { AdminFeedUrls } from "./admin-feed-urls";

const CATEGORIES = [
  { value: "tech", label: "Tech" },
  { value: "business", label: "Business" },
  { value: "finance", label: "Finance" },
  { value: "productivity", label: "Productivity" },
];

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  tech: { bg: "rgba(59, 130, 246, 0.12)", text: "#2563eb" },
  business: { bg: "rgba(107, 76, 154, 0.12)", text: "#6b4c9a" },
  finance: { bg: "rgba(16, 185, 129, 0.12)", text: "#059669" },
  productivity: { bg: "rgba(232, 164, 74, 0.12)", text: "#c4842e" },
};

type Rule = {
  id: string;
  sender_email: string;
  from_name_pattern: string | null;
  subject_pattern: string | null;
  category: string;
  priority: number;
  created_at: string;
};

export function AdminRulesTable({
  initialRules,
  senderEmails,
  feedBaseUrl,
}: {
  initialRules: Rule[];
  senderEmails: string[];
  feedBaseUrl: string;
}) {
  const [rules, setRules] = useState(initialRules);
  const [showForm, setShowForm] = useState(false);
  const [senderEmail, setSenderEmail] = useState("");
  const [fromNamePattern, setFromNamePattern] = useState("");
  const [subjectPattern, setSubjectPattern] = useState("");
  const [category, setCategory] = useState("tech");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { categoryCounts, categories } = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of rules) {
      counts[r.category] = (counts[r.category] || 0) + 1;
    }
    const cats = [...new Set(rules.map((r) => r.category))].sort();
    return { categoryCounts: counts, categories: cats };
  }, [rules]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const res = await fetch("/api/admin/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sender_email: senderEmail,
          from_name_pattern: fromNamePattern || null,
          subject_pattern: subjectPattern || null,
          category,
        }),
      });

      if (res.ok) {
        const { rule } = await res.json();
        setRules((prev) => [rule, ...prev]);
        setSenderEmail("");
        setFromNamePattern("");
        setSubjectPattern("");
        setCategory("tech");
        setShowForm(false);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/rules/${id}`, { method: "DELETE" });
      if (res.ok) {
        setRules((prev) => prev.filter((r) => r.id !== id));
      }
    } finally {
      setDeletingId(null);
    }
  }

  function formatPattern(rule: Rule): React.ReactNode {
    const parts: string[] = [];
    if (rule.from_name_pattern) parts.push(`name: ${rule.from_name_pattern}`);
    if (rule.subject_pattern) parts.push(`subject: ${rule.subject_pattern}`);
    if (parts.length === 0) {
      return <span style={{ color: "#b0a8ba" }}>catch-all</span>;
    }
    return parts.join(", ");
  }

  return (
    <div className="space-y-8">
      {/* Stats */}
      <div className="flex gap-4">
        <div
          className="bg-white rounded-2xl px-5 py-4 flex-1"
          style={{ border: "1px solid rgba(45, 27, 78, 0.08)" }}
        >
          <div
            className="text-2xl font-semibold"
            style={{ color: "#1a0e2e" }}
          >
            {rules.length}
          </div>
          <div className="text-xs" style={{ color: "#8a7f96" }}>
            Total rules
          </div>
        </div>
        {Object.entries(categoryCounts).map(([cat, count]) => (
          <div
            key={cat}
            className="bg-white rounded-2xl px-5 py-4 flex-1"
            style={{ border: "1px solid rgba(45, 27, 78, 0.08)" }}
          >
            <div
              className="text-2xl font-semibold"
              style={{ color: "#1a0e2e" }}
            >
              {count}
            </div>
            <div className="text-xs capitalize" style={{ color: "#8a7f96" }}>
              {cat}
            </div>
          </div>
        ))}
      </div>

      {/* Feed URLs */}
      {categories.length > 0 && (
        <AdminFeedUrls feedBaseUrl={feedBaseUrl} categories={categories} />
      )}

      {/* Rules table */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2
            className="text-lg"
            style={{
              fontFamily: "var(--font-instrument-serif), serif",
              letterSpacing: "-0.02em",
            }}
          >
            Categorization Rules
          </h2>
          <button
            onClick={() => setShowForm(!showForm)}
            className="text-sm px-3 py-1.5 rounded-lg font-medium cursor-pointer transition-colors"
            style={{
              background: showForm
                ? "rgba(45, 27, 78, 0.04)"
                : "rgba(107, 76, 154, 0.12)",
              color: showForm ? "#8a7f96" : "#6b4c9a",
            }}
          >
            {showForm ? "Cancel" : "+ Add Rule"}
          </button>
        </div>

        {showForm && (
          <form
            onSubmit={handleAdd}
            className="bg-white rounded-2xl p-5 mb-4 space-y-3"
            style={{ border: "1px solid rgba(45, 27, 78, 0.08)" }}
          >
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label
                  className="block text-xs font-medium mb-1"
                  style={{ color: "#8a7f96" }}
                >
                  Sender Email
                </label>
                <input
                  type="text"
                  value={senderEmail}
                  onChange={(e) => setSenderEmail(e.target.value)}
                  required
                  list="sender-emails"
                  placeholder="sender@example.com"
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{
                    border: "1px solid rgba(45, 27, 78, 0.12)",
                    background: "#faf7f2",
                    color: "#1a0e2e",
                  }}
                />
                <datalist id="sender-emails">
                  {senderEmails.map((email) => (
                    <option key={email} value={email} />
                  ))}
                </datalist>
              </div>
              <div>
                <label
                  className="block text-xs font-medium mb-1"
                  style={{ color: "#8a7f96" }}
                >
                  Sender Name{" "}
                  <span style={{ color: "#b0a8ba" }}>(optional)</span>
                </label>
                <input
                  type="text"
                  value={fromNamePattern}
                  onChange={(e) => setFromNamePattern(e.target.value)}
                  placeholder="e.g. TLDR AI"
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{
                    border: "1px solid rgba(45, 27, 78, 0.12)",
                    background: "#faf7f2",
                    color: "#1a0e2e",
                  }}
                />
              </div>
              <div>
                <label
                  className="block text-xs font-medium mb-1"
                  style={{ color: "#8a7f96" }}
                >
                  Subject Pattern{" "}
                  <span style={{ color: "#b0a8ba" }}>(optional)</span>
                </label>
                <input
                  type="text"
                  value={subjectPattern}
                  onChange={(e) => setSubjectPattern(e.target.value)}
                  placeholder="e.g. AI News"
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{
                    border: "1px solid rgba(45, 27, 78, 0.12)",
                    background: "#faf7f2",
                    color: "#1a0e2e",
                  }}
                />
              </div>
            </div>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label
                  className="block text-xs font-medium mb-1"
                  style={{ color: "#8a7f96" }}
                >
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm cursor-pointer"
                  style={{
                    border: "1px solid rgba(45, 27, 78, 0.12)",
                    background: "#faf7f2",
                    color: "#1a0e2e",
                  }}
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white cursor-pointer transition-opacity disabled:opacity-50"
                style={{ background: "#6b4c9a" }}
              >
                {saving ? "Saving..." : "Add Rule"}
              </button>
            </div>
          </form>
        )}

        <div
          className="bg-white rounded-2xl overflow-hidden"
          style={{ border: "1px solid rgba(45, 27, 78, 0.08)" }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(45, 27, 78, 0.08)" }}>
                <th
                  className="text-left px-5 py-3 font-medium"
                  style={{ color: "#8a7f96" }}
                >
                  Sender Email
                </th>
                <th
                  className="text-left px-5 py-3 font-medium"
                  style={{ color: "#8a7f96" }}
                >
                  Pattern
                </th>
                <th
                  className="text-left px-5 py-3 font-medium"
                  style={{ color: "#8a7f96" }}
                >
                  Category
                </th>
                <th className="px-5 py-3 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => {
                const colors = CATEGORY_COLORS[rule.category];
                return (
                  <tr
                    key={rule.id}
                    style={{
                      borderBottom: "1px solid rgba(45, 27, 78, 0.04)",
                    }}
                  >
                    <td className="px-5 py-3" style={{ color: "#1a0e2e" }}>
                      {rule.sender_email}
                    </td>
                    <td className="px-5 py-3" style={{ color: "#5a4d6b" }}>
                      {formatPattern(rule)}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className="px-2 py-1 rounded-lg text-xs font-medium"
                        style={{
                          background: colors?.bg ?? "rgba(45, 27, 78, 0.04)",
                          color: colors?.text ?? "#8a7f96",
                        }}
                      >
                        {rule.category}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => handleDelete(rule.id)}
                        disabled={deletingId === rule.id}
                        className="text-xs cursor-pointer transition-colors hover:text-red-600"
                        style={{ color: "#8a7f96" }}
                      >
                        {deletingId === rule.id ? "..." : "Delete"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rules.length === 0 && (
            <div
              className="px-5 py-8 text-center"
              style={{ color: "#8a7f96" }}
            >
              No categorization rules yet. Add one to get started.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
