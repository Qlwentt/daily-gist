"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { CopyButton } from "@/components/copy-button";

type Collection = {
  id: string;
  name: string;
  slug: string;
  host_voice: string | null;
  guest_voice: string | null;
  intro_music: string | null;
  schedule_days: number[];
  source_count: number;
};

type Source = {
  id: string;
  sender_email: string;
  sender_name: string | null;
};

type Rule = {
  id: string;
  sender_email: string;
  from_name_pattern: string | null;
};

const MAX_COLLECTIONS = 4;

export function CollectionsManager({
  rssToken,
  initialCollections,
}: {
  rssToken: string;
  initialCollections: Collection[];
}) {
  const [collections, setCollections] = useState<Collection[]>(initialCollections);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const appUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://dailygist.fyi";

  async function createCollection() {
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);

    try {
      const res = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create collection");
        return;
      }

      const data = await res.json();
      setCollections((prev) => [...prev, data.collection]);
      setNewName("");
    } finally {
      setCreating(false);
    }
  }

  async function deleteCollection(id: string) {
    const res = await fetch(`/api/collections/${id}`, { method: "DELETE" });
    if (res.ok) {
      setCollections((prev) => prev.filter((c) => c.id !== id));
      if (expandedId === id) setExpandedId(null);
    }
  }

  async function renameCollection(id: string, name: string) {
    const res = await fetch(`/api/collections/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      const data = await res.json();
      setCollections((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...data.collection } : c))
      );
    }
  }

  function takenDaysFor(id: string): Set<number> {
    const taken = new Set<number>();
    for (const c of collections) {
      if (c.id !== id) {
        for (const d of c.schedule_days) taken.add(d);
      }
    }
    return taken;
  }

  async function updateSchedule(id: string, days: number[]) {
    // Optimistic update
    setCollections((prev) =>
      prev.map((c) => (c.id === id ? { ...c, schedule_days: days } : c))
    );

    const res = await fetch(`/api/collections/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schedule_days: days }),
    });
    if (!res.ok) {
      // Revert on failure — refetch server state
      const listRes = await fetch("/api/collections");
      if (listRes.ok) {
        const data = await listRes.json();
        setCollections(data.collections ?? []);
      }
    }
  }

  function feedUrl(slug: string) {
    return `${appUrl}/api/feed/${rssToken}?collection=${slug}`;
  }

  return (
    <div
      className="relative overflow-hidden rounded-2xl p-6"
      style={{
        background:
          "linear-gradient(135deg, #1a0e2e 0%, #2d1b4e 50%, #4a2d7a 100%)",
        border: "1px solid rgba(107, 76, 154, 0.3)",
      }}
    >
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 50%, white 1px, transparent 1px), " +
            "radial-gradient(circle at 80% 20%, white 1px, transparent 1px), " +
            "radial-gradient(circle at 60% 80%, white 1px, transparent 1px)",
          backgroundSize: "60px 60px, 80px 80px, 70px 70px",
        }}
      />
      <div className="relative">
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-lg font-semibold" style={{ color: "#ffffff" }}>
            Collections
          </h2>
          <span
            className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
            style={{
              background: "linear-gradient(135deg, #c084fc, #818cf8)",
              color: "#ffffff",
              letterSpacing: "0.1em",
            }}
          >
            Special Edition
          </span>
        </div>
        <p
          className="text-sm mb-4"
          style={{ color: "rgba(255, 255, 255, 0.6)" }}
        >
          You get one podcast per day. Assign each collection to specific days
          of the week — on those days, only that collection's newsletters are
          included. Days with no collection use your unassigned newsletters.
          Each collection gets its own RSS feed.
        </p>

        {/* Collection list */}
        <div className="space-y-3 mb-4">
          {collections.map((col) => (
            <CollectionCard
              key={col.id}
              collection={col}
              feedUrl={feedUrl(col.slug)}
              expanded={expandedId === col.id}
              takenDays={takenDaysFor(col.id)}
              onToggle={() =>
                setExpandedId(expandedId === col.id ? null : col.id)
              }
              onDelete={() => deleteCollection(col.id)}
              onRename={(name) => renameCollection(col.id, name)}
              onScheduleChange={(days) => updateSchedule(col.id, days)}
              onSourceCountChange={(count) =>
                setCollections((prev) =>
                  prev.map((c) =>
                    c.id === col.id ? { ...c, source_count: count } : c
                  )
                )
              }
            />
          ))}
        </div>

        {/* Create new */}
        {collections.length < MAX_COLLECTIONS && (
          <div className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") createCollection();
              }}
              placeholder="New collection name..."
              maxLength={50}
              className="flex-1 px-3 py-2 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
              style={{
                background: "rgba(255, 255, 255, 0.1)",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                color: "#ffffff",
              }}
            />
            <button
              onClick={createCollection}
              disabled={creating || !newName.trim()}
              className="px-4 py-2 rounded-xl text-sm font-medium text-white transition-opacity"
              style={{
                background: "linear-gradient(135deg, #7c3aed, #6366f1)",
                opacity: creating || !newName.trim() ? 0.5 : 1,
              }}
            >
              {creating ? "Creating..." : "Create"}
            </button>
          </div>
        )}

        {collections.length >= MAX_COLLECTIONS && (
          <p
            className="text-xs"
            style={{ color: "rgba(255, 255, 255, 0.4)" }}
          >
            Maximum {MAX_COLLECTIONS} collections reached.
          </p>
        )}

        {error && (
          <p className="mt-2 text-xs" style={{ color: "#f87171" }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function CollectionCard({
  collection,
  feedUrl,
  expanded,
  takenDays,
  onToggle,
  onDelete,
  onRename,
  onScheduleChange,
  onSourceCountChange,
}: {
  collection: Collection;
  feedUrl: string;
  expanded: boolean;
  takenDays: Set<number>;
  onToggle: () => void;
  onDelete: () => void;
  onRename: (name: string) => void;
  onScheduleChange: (days: number[]) => void;
  onSourceCountChange: (count: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(collection.name);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function handleRename() {
    if (editName.trim() && editName.trim() !== collection.name) {
      onRename(editName.trim());
    }
    setEditing(false);
  }

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: "rgba(255, 255, 255, 0.06)",
        border: "1px solid rgba(255, 255, 255, 0.1)",
      }}
    >
      {/* Header */}
      <div className="p-4 flex items-center gap-3">
        <button
          onClick={onToggle}
          className="flex-1 flex items-center gap-3 text-left"
        >
          <span
            className="text-xs transition-transform"
            style={{
              color: "rgba(255, 255, 255, 0.4)",
              transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            }}
          >
            &#9654;
          </span>

          {editing ? (
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRename();
                if (e.key === "Escape") {
                  setEditName(collection.name);
                  setEditing(false);
                }
              }}
              onClick={(e) => e.stopPropagation()}
              autoFocus
              maxLength={50}
              className="px-2 py-1 rounded text-sm focus:outline-none"
              style={{
                background: "rgba(255, 255, 255, 0.1)",
                border: "1px solid rgba(255, 255, 255, 0.3)",
                color: "#ffffff",
              }}
            />
          ) : (
            <span className="font-medium text-sm" style={{ color: "#ffffff" }}>
              {collection.name}
            </span>
          )}

          <span
            className="text-xs"
            style={{ color: "rgba(255, 255, 255, 0.4)" }}
          >
            {collection.source_count}{" "}
            {collection.source_count === 1 ? "source" : "sources"}
          </span>
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            setEditing(true);
            setEditName(collection.name);
          }}
          className="p-1 rounded text-xs"
          style={{ color: "rgba(255, 255, 255, 0.4)" }}
          title="Rename"
        >
          Rename
        </button>

        {confirmDelete ? (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={onDelete}
              className="px-2 py-1 rounded text-xs font-medium"
              style={{ background: "rgba(248, 113, 113, 0.2)", color: "#f87171" }}
            >
              Confirm
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="px-2 py-1 rounded text-xs"
              style={{ color: "rgba(255, 255, 255, 0.4)" }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setConfirmDelete(true);
            }}
            className="p-1 rounded text-xs"
            style={{ color: "rgba(248, 113, 113, 0.6)" }}
            title="Delete"
          >
            Delete
          </button>
        )}
      </div>

      {/* Expanded content */}
      {expanded && (
        <div
          className="px-4 pb-4 space-y-4"
          style={{ borderTop: "1px solid rgba(255, 255, 255, 0.06)" }}
        >
          {/* RSS Feed URL */}
          <div className="pt-3">
            <label
              className="text-xs font-medium uppercase mb-1 block"
              style={{
                color: "rgba(255, 255, 255, 0.5)",
                letterSpacing: "0.05em",
              }}
            >
              RSS Feed URL
            </label>
            <div
              className="flex items-center gap-2 p-2 rounded-lg"
              style={{ background: "rgba(0, 0, 0, 0.2)" }}
            >
              <code
                className="flex-1 text-xs break-all"
                style={{ color: "rgba(255, 255, 255, 0.7)" }}
              >
                {feedUrl}
              </code>
              <CopyButton text={feedUrl} variant="dark" />
            </div>
          </div>

          {/* Schedule days */}
          <div>
            <label
              className="text-xs font-medium uppercase mb-2 block"
              style={{
                color: "rgba(255, 255, 255, 0.5)",
                letterSpacing: "0.05em",
              }}
            >
              Schedule
            </label>
            <div className="flex gap-1.5">
              {DAY_LABELS.map((label, day) => {
                const active = collection.schedule_days.includes(day);
                const taken = takenDays.has(day);
                return (
                  <button
                    key={day}
                    disabled={taken}
                    onClick={() => {
                      const next = active
                        ? collection.schedule_days.filter((d) => d !== day)
                        : [...collection.schedule_days, day];
                      onScheduleChange(next);
                    }}
                    className="w-8 h-8 rounded-lg text-xs font-medium transition-all"
                    style={{
                      background: active
                        ? "linear-gradient(135deg, #7c3aed, #6366f1)"
                        : "rgba(255, 255, 255, 0.08)",
                      color: active ? "#ffffff" : "rgba(255, 255, 255, 0.4)",
                      border: active
                        ? "1px solid rgba(124, 58, 237, 0.5)"
                        : "1px solid rgba(255, 255, 255, 0.1)",
                      opacity: taken ? 0.3 : 1,
                      cursor: taken ? "not-allowed" : "pointer",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {collection.source_count > 0 && collection.schedule_days.length === 0 ? (
              <p
                className="text-xs mt-1.5"
                style={{ color: "#fbbf24" }}
              >
                Pick at least one day or this collection won't generate episodes.
              </p>
            ) : (
              <p
                className="text-xs mt-1.5"
                style={{ color: "rgba(255, 255, 255, 0.3)" }}
              >
                This collection generates on selected days. Unscheduled days use your main podcast.
              </p>
            )}
          </div>

          {/* Source assignment */}
          <SourceAssignment
            collectionId={collection.id}
            onCountChange={onSourceCountChange}
          />
        </div>
      )}
    </div>
  );
}

function SourceAssignment({
  collectionId,
  onCountChange,
}: {
  collectionId: string;
  onCountChange: (count: number) => void;
}) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [allSources, setAllSources] = useState<Source[]>([]);
  const [allAssignedEmails, setAllAssignedEmails] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [selectedSource, setSelectedSource] = useState("");

  const onCountChangeRef = useRef(onCountChange);
  onCountChangeRef.current = onCountChange;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [rulesRes, sourcesRes, allRulesRes] = await Promise.all([
        fetch(`/api/collections/${collectionId}/sources`),
        fetch("/api/newsletter-sources"),
        fetch("/api/collections/all-rules"),
      ]);

      if (rulesRes.ok) {
        const data = await rulesRes.json();
        setRules(data.sources ?? []);
        onCountChangeRef.current(data.sources?.length ?? 0);
      }
      if (sourcesRes.ok) {
        const data = await sourcesRes.json();
        setAllSources(data.sources ?? []);
      }
      if (allRulesRes.ok) {
        const data = await allRulesRes.json();
        setAllAssignedEmails(new Set((data.rules ?? []).map((r: Rule) => r.sender_email)));
      }
    } finally {
      setLoading(false);
    }
  }, [collectionId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function assignSource() {
    if (!selectedSource) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/collections/${collectionId}/sources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sender_email: selectedSource }),
      });

      if (res.ok) {
        const data = await res.json();
        const newRules = [...rules, data.source];
        setRules(newRules);
        onCountChange(newRules.length);
        setSelectedSource("");
        setAllAssignedEmails((prev) => new Set([...prev, selectedSource]));
      }
    } finally {
      setAdding(false);
    }
  }

  async function removeSource(ruleId: string) {
    const rule = rules.find((r) => r.id === ruleId);
    const res = await fetch(
      `/api/collections/${collectionId}/sources?rule_id=${ruleId}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      const newRules = rules.filter((r) => r.id !== ruleId);
      setRules(newRules);
      onCountChange(newRules.length);
      if (rule) {
        setAllAssignedEmails((prev) => {
          const next = new Set(prev);
          next.delete(rule.sender_email);
          return next;
        });
      }
    }
  }

  // Sources not yet assigned to any collection
  const availableSources = allSources.filter(
    (s) => !allAssignedEmails.has(s.sender_email)
  );

  if (loading) {
    return (
      <p
        className="text-xs py-2"
        style={{ color: "rgba(255, 255, 255, 0.4)" }}
      >
        Loading sources...
      </p>
    );
  }

  return (
    <div>
      <label
        className="text-xs font-medium uppercase mb-2 block"
        style={{
          color: "rgba(255, 255, 255, 0.5)",
          letterSpacing: "0.05em",
        }}
      >
        Assigned Newsletters
      </label>

      {rules.length === 0 ? (
        <p
          className="text-xs mb-2"
          style={{ color: "rgba(255, 255, 255, 0.3)" }}
        >
          No sources assigned yet.
        </p>
      ) : (
        <div className="space-y-1 mb-2">
          {rules.map((rule) => {
            const source = allSources.find((s) => s.sender_email === rule.sender_email);
            const displayName = source?.sender_name;
            return (
            <div
              key={rule.id}
              className="flex items-center justify-between px-2 py-1.5 rounded-lg"
              style={{ background: "rgba(0, 0, 0, 0.15)" }}
            >
              <span
                className="text-xs truncate"
                style={{ color: "rgba(255, 255, 255, 0.7)" }}
              >
                {displayName ? `${displayName} (${rule.sender_email})` : rule.sender_email}
                {rule.from_name_pattern && (
                  <span style={{ color: "rgba(255, 255, 255, 0.4)" }}>
                    {" "}
                    (name: {rule.from_name_pattern})
                  </span>
                )}
              </span>
              <button
                onClick={() => removeSource(rule.id)}
                className="ml-2 text-xs flex-shrink-0"
                style={{ color: "rgba(248, 113, 113, 0.6)" }}
              >
                Remove
              </button>
            </div>
          );
          })}
        </div>
      )}

      {availableSources.length > 0 && (
        <div className="flex gap-2">
          <select
            value={selectedSource}
            onChange={(e) => setSelectedSource(e.target.value)}
            className="flex-1 px-2 py-1.5 rounded-lg text-xs focus:outline-none"
            style={{
              background: "rgba(255, 255, 255, 0.1)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              color: "#ffffff",
            }}
          >
            <option value="" style={{ color: "#1a0e2e" }}>
              Add a newsletter...
            </option>
            {availableSources.map((s) => (
              <option
                key={s.sender_email}
                value={s.sender_email}
                style={{ color: "#1a0e2e" }}
              >
                {s.sender_name ? `${s.sender_name} (${s.sender_email})` : s.sender_email}
              </option>
            ))}
          </select>
          <button
            onClick={assignSource}
            disabled={!selectedSource || adding}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-opacity"
            style={{
              background: "linear-gradient(135deg, #7c3aed, #6366f1)",
              opacity: !selectedSource || adding ? 0.5 : 1,
            }}
          >
            {adding ? "Adding..." : "Add"}
          </button>
        </div>
      )}

      {availableSources.length === 0 && allSources.length > 0 && rules.length > 0 && (
        <p
          className="text-xs"
          style={{ color: "rgba(255, 255, 255, 0.3)" }}
        >
          All your newsletter sources are assigned.
        </p>
      )}
    </div>
  );
}
