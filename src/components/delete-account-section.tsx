"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteAccountSection() {
  const [confirmation, setConfirmation] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter();

  const isConfirmed = confirmation.toLowerCase() === "delete";

  async function handleDelete() {
    if (!isConfirmed) return;
    setIsDeleting(true);

    try {
      const res = await fetch("/api/account", { method: "DELETE" });
      if (!res.ok) throw new Error();
      router.push("/login");
    } catch {
      setIsDeleting(false);
      alert("Something went wrong. Please try again or contact support@dailygist.fyi.");
    }
  }

  return (
    <div
      className="bg-white rounded-2xl p-6"
      style={{ border: "1px solid rgba(220, 38, 38, 0.2)" }}
    >
      <h2 className="text-lg font-semibold mb-2" style={{ color: "#dc2626" }}>
        Delete Account
      </h2>
      <p className="text-sm mb-4" style={{ color: "#5a4d6b" }}>
        Permanently delete your account and all associated data including episodes,
        emails, and audio files. This action cannot be undone.
      </p>
      <div className="flex gap-3 items-center">
        <input
          type="text"
          placeholder='Type "delete" to confirm'
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          className="flex-1 px-3 py-2 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
          style={{
            background: "#faf7f2",
            border: "1px solid rgba(220, 38, 38, 0.2)",
            color: "#1a0e2e",
          }}
          disabled={isDeleting}
        />
        <button
          onClick={handleDelete}
          disabled={!isConfirmed || isDeleting}
          className="px-4 py-2 rounded-xl text-sm font-medium text-white transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: isConfirmed && !isDeleting ? "#dc2626" : "#e5a0a0",
          }}
        >
          {isDeleting ? "Deleting..." : "Delete Account"}
        </button>
      </div>
    </div>
  );
}
